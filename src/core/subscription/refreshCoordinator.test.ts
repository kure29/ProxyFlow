import { describe, expect, it, vi } from 'vitest'
import { compileGraph } from '../graphCompiler'
import { createBlankProject } from '../../data/newProject'
import { mapWithConcurrency } from './concurrency'
import { RefreshCoordinator, type RefreshHandlers } from './refreshCoordinator'
import { MemorySubscriptionRuntimeRepository, type SubscriptionRuntimeRepository } from './runtimeRepository'
import type { SourceFetchOptions, SourceFetchResult, SourceFetcher } from './sourceFetcher'
import type { SubscriptionDiff, SubscriptionRefreshError, SubscriptionSnapshot, SubscriptionSnapshotCandidate } from './types'

const usableBody = 'socks5://fictional-user:fictional-password@node.example.invalid:1080#Node%20One'

describe('RefreshCoordinator', () => {
  it('commits first and second successful snapshots', async () => {
    const fetcher = sequenceFetcher(usableBody, usableBody.replace('Node%20One', 'Renamed'))
    const repository = new MemorySubscriptionRuntimeRepository()
    const coordinator = new RefreshCoordinator(fetcher, repository)
    const runtime = harness()
    const first = await coordinator.refresh(request(), runtime.handlers)
    expect(first.outcome).toBe('success')
    expect(runtime.active?.result.readyCount).toBe(1)
    const second = await coordinator.refresh(request(runtime.active), runtime.handlers)
    expect(second.outcome).toBe('success')
    expect(runtime.diff?.changed).toBe(1)
  })

  it.each([
    ['unsupported format', 'not a subscription', 'SUBSCRIPTION_UNSUPPORTED_FORMAT'],
    ['blank response', '   \n', 'SUBSCRIPTION_PARSE_FAILED'],
    ['all Partial', partialOnlyBody(), 'SUBSCRIPTION_NO_USABLE_NODES'],
  ])('rejects %s without committing', async (_label, body, code) => {
    const runtime = harness()
    const result = await new RefreshCoordinator(sequenceFetcher(body), new MemorySubscriptionRuntimeRepository()).refresh(request(), runtime.handlers)
    expect(result).toEqual(expect.objectContaining({ outcome: 'failure', error: expect.objectContaining({ code }) }))
    expect(runtime.active).toBeUndefined()
  })

  it('commits mixed Ready and Partial nodes as usable', async () => {
    const runtime = harness()
    const body = `${usableBody}\n${partialOnlyBody()}`
    await new RefreshCoordinator(sequenceFetcher(body), new MemorySubscriptionRuntimeRepository()).refresh(request(), runtime.handlers)
    expect(runtime.active).toEqual(expect.objectContaining({ quality: 'usable', readyCount: 1, partialCount: 1 }))
  })

  it('commits an initial valid empty snapshot but guards non-empty to empty replacement', async () => {
    const emptyBody = 'proxies: []'
    const coordinator = new RefreshCoordinator(sequenceFetcher(emptyBody, usableBody, emptyBody), new MemorySubscriptionRuntimeRepository())
    const emptyRuntime = harness()
    expect((await coordinator.refresh(request(), emptyRuntime.handlers)).outcome).toBe('success')
    expect(emptyRuntime.active?.quality).toBe('empty')

    const runtime = harness()
    await coordinator.refresh(request(), runtime.handlers)
    const lkg = runtime.active
    const guarded = await coordinator.refresh(request(lkg), runtime.handlers)
    expect(guarded.outcome).toBe('empty-confirmation-required')
    expect(runtime.active).toBe(lkg)
    expect(runtime.pending?.quality).toBe('empty')
  })

  it('preserves the exact LKG and graph output after a failed refresh, then replaces it on success', async () => {
    const failure = Object.assign(new Error('network'), { code: 'ignored' })
    const fetcher = sequenceFetcher(usableBody, failure, usableBody.replace('node.example.invalid', 'next.example.invalid'))
    const coordinator = new RefreshCoordinator(fetcher, new MemorySubscriptionRuntimeRepository())
    const runtime = harness()
    await coordinator.refresh(request(), runtime.handlers)
    const lkg = runtime.active!
    const project = projectWithSource()
    const before = compileGraph(project, { subscriptionSnapshots: { source: lkg } })
    await coordinator.refresh(request(lkg), runtime.handlers)
    expect(runtime.active).toBe(lkg)
    expect(runtime.error).toEqual(expect.objectContaining({ code: 'SUBSCRIPTION_RUNTIME_INTERNAL_ERROR' }))
    const after = compileGraph(project, { subscriptionSnapshots: { source: runtime.active! } })
    expect(after.ir?.sources[0]).toEqual(before.ir?.sources[0])
    await coordinator.refresh(request(runtime.active), runtime.handlers)
    expect(runtime.active).not.toBe(lkg)
  })

  it('keeps an in-memory commit when cache persistence fails', async () => {
    const repository = new MemorySubscriptionRuntimeRepository()
    repository.writeError = new Error('quota exceeded')
    const runtime = harness()
    const result = await new RefreshCoordinator(sequenceFetcher(usableBody), repository).refresh(request(), runtime.handlers)
    expect(result.outcome).toBe('success')
    expect(runtime.active?.quality).toBe('usable')
    expect(runtime.cacheError?.code).toBe('SUBSCRIPTION_CACHE_WRITE_FAILED')
  })

  it('serializes clear-cache after a pending write', async () => {
    let releaseWrite!: () => void
    const events: string[] = []
    const repository: SubscriptionRuntimeRepository = new MemorySubscriptionRuntimeRepository()
    repository.writeActive = async () => {
      events.push('write-started')
      await new Promise<void>((resolve) => { releaseWrite = resolve })
      events.push('write-finished')
    }
    repository.deleteActive = async () => { events.push('delete') }
    const coordinator = new RefreshCoordinator(sequenceFetcher(usableBody), repository)
    const runtime = harness()
    const refresh = coordinator.refresh(request(), runtime.handlers)
    await vi.waitFor(() => expect(events).toContain('write-started'))

    const clear = coordinator.clearPersistedSnapshot({ projectId: 'project-a', sourceId: 'source', sourceConfigFingerprint: 'unused' })
    expect(events).toEqual(['write-started'])
    releaseWrite()
    await refresh
    await clear
    expect(events).toEqual(['write-started', 'write-finished', 'delete'])
  })

  it('lets B win when A completes after B and treats A as superseded', async () => {
    const pending = new Map<number, (value: SourceFetchResult) => void>()
    let call = 0
    const fetcher: SourceFetcher = { fetch: vi.fn(() => new Promise<SourceFetchResult>((resolve) => { pending.set(++call, resolve) })) }
    const coordinator = new RefreshCoordinator(fetcher, new MemorySubscriptionRuntimeRepository())
    const runtime = harness()
    const a = coordinator.refresh(request(), runtime.handlers)
    await vi.waitFor(() => expect(call).toBe(1))
    const b = coordinator.refresh(request(), runtime.handlers)
    await vi.waitFor(() => expect(call).toBe(2))
    pending.get(2)!(fetchResult(usableBody.replace('Node%20One', 'B')))
    await b
    const bSnapshot = runtime.active
    pending.get(1)!(fetchResult(usableBody.replace('Node%20One', 'A')))
    expect((await a).outcome).toBe('superseded')
    expect(runtime.active).toBe(bSnapshot)
    expect(runtime.active?.result.nodes[0].name).toBe('B')
  })

  it('aborts A when B starts without an unhandled rejection', async () => {
    let call = 0
    const fetcher: SourceFetcher = { fetch: vi.fn((_url: string, options?: SourceFetchOptions) => {
      call += 1
      if (call === 2) return Promise.resolve(fetchResult(usableBody))
      return new Promise<SourceFetchResult>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    }) }
    const coordinator = new RefreshCoordinator(fetcher, new MemorySubscriptionRuntimeRepository())
    const runtime = harness()
    const a = coordinator.refresh(request(), runtime.handlers)
    await vi.waitFor(() => expect(call).toBe(1))
    const b = coordinator.refresh(request(), runtime.handlers)
    await expect(a).resolves.toEqual({ outcome: 'superseded' })
    await expect(b).resolves.toEqual(expect.objectContaining({ outcome: 'success' }))
  })
})

describe('refresh concurrency limiter', () => {
  it('settles every task and never exceeds three concurrent requests', async () => {
    let active = 0
    let maximum = 0
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
      active += 1
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active -= 1
      if (value === 4) throw new Error('expected failure')
      return value
    })
    expect(maximum).toBe(3)
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  })
})

function harness() {
  const state: {
    active?: SubscriptionSnapshot
    pending?: SubscriptionSnapshotCandidate
    diff?: SubscriptionDiff
    error?: SubscriptionRefreshError
    cacheError?: SubscriptionRefreshError
  } = {}
  const handlers: RefreshHandlers = {
    onStart: () => undefined,
    onCommit: (snapshot, diff) => { state.active = snapshot; state.diff = diff; state.error = undefined },
    onEmptyConfirmation: (candidate, diff) => { state.pending = candidate; state.diff = diff },
    onFailure: (error) => { state.error = error },
    onCacheError: (error) => { state.cacheError = error },
  }
  return Object.assign(state, { handlers })
}

function request(activeSnapshot?: SubscriptionSnapshot) {
  return { projectId: 'project-a', sourceId: 'source', sourceName: 'Subscription', url: 'https://subscription.example.invalid/list?token=fictional', activeSnapshot }
}

function sequenceFetcher(...values: Array<string | Error>): SourceFetcher {
  let index = 0
  return { fetch: vi.fn(async () => {
    const value = values[index++]
    if (value instanceof Error) throw value
    return fetchResult(value)
  }) }
}

function fetchResult(text: string): SourceFetchResult {
  return { text, status: 200, contentType: 'text/plain', durationMs: 5 }
}

function partialOnlyBody() {
  return `vless://${'11111111-1111-4111-8111-111111111111'}@partial.example.invalid:443?security=tls&type=ws&flow=unsupported-flow#Partial`
}

function projectWithSource() {
  const project = createBlankProject()
  project.graph.nodes.unshift({
    id: 'source', type: 'block', position: { x: 0, y: 0 },
    data: { blockType: 'subscription', category: 'source', title: 'Subscription', subtitle: '', icon: 'rss', enabled: true },
  })
  return project
}
