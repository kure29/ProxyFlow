import { describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SubscriptionFetchError } from '../../src/core/subscription/errors'
import { parseSubscription } from '../../src/core/subscription/parseSubscription'
import { createSnapshotCandidate } from '../../src/core/subscription/snapshot'
import type { SourceFetchResult, SourceFetcher } from '../../src/core/subscription/sourceFetcher'
import { SqliteRuntimeRepository } from './repository'
import { createRuntimeService } from './service'
import { ServerSourceFetcher } from './sourceFetcher'
import { isPublicAddress } from './ssrf'

const token = 'fictional-runtime-token-123456789'
const origin = 'http://localhost:5173'

describe('Runtime Service', () => {
  it('requires authentication and serves an uncredentialed health check', async () => {
    const service = createTestService(sequenceFetcher(yamlBody('Ready', '198.51.100.10')))
    await service.listen(0)
    const base = address(service)
    await expect(fetch(`${base}/health`).then((response) => response.json())).resolves.toEqual(expect.objectContaining({ ok: true, runtimeStorageSchema: 1 }))
    const unauthorized = await fetch(`${base}/api/v1/subscriptions/fetch`, { method: 'POST', body: '{}' })
    expect(unauthorized.status).toBe(401)
    await service.close()
  })

  it('fetches, stores bounded history, preserves LKG, and confirms empty results explicitly', async () => {
    const fetcher = sequenceFetcher(yamlBody('Ready', '198.51.100.10'), 'proxies: []', new SubscriptionFetchError('SUBSCRIPTION_NETWORK_ERROR', 'untrusted token=fictional-secret'))
    const service = createTestService(fetcher)
    await service.listen(0)
    const base = address(service)
    const request = () => fetch(`${base}/api/v1/subscriptions/fetch`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ projectId: 'project-a', sourceId: 'source-a', sourceName: 'Fictional Source', url: 'https://example.com/sub' }),
    })

    const first = await request()
    expect(first.status).toBe(200)
    const firstBody = await first.json() as { snapshot: { snapshotId: string } }
    expect(firstBody.snapshot.snapshotId).toContain('snapshot-')

    const empty = await request()
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual(expect.objectContaining({ outcome: 'empty-confirmation-required' }))
    const historyBeforeConfirm = await fetch(`${base}/api/v1/projects/project-a/sources/source-a/history`, { headers: authHeaders() })
    expect((await historyBeforeConfirm.json()).history).toHaveLength(1)

    const confirmed = await fetch(`${base}/api/v1/projects/project-a/sources/source-a/confirm-empty`, { method: 'POST', headers: authHeaders() })
    expect(confirmed.status).toBe(200)
    const historyAfterConfirm = await fetch(`${base}/api/v1/projects/project-a/sources/source-a/history`, { headers: authHeaders() })
    expect((await historyAfterConfirm.json()).history).toHaveLength(2)

    const failed = await request()
    expect(failed.status).toBe(502)
    const failedBody = await failed.json()
    expect(failedBody).toEqual(expect.objectContaining({
      error: 'SUBSCRIPTION_NETWORK_ERROR', message: 'The Runtime Service could not reach the subscription server.',
    }))
    expect(JSON.stringify(failedBody)).not.toContain('fictional-secret')
    const active = await service.repository.readActive({ projectId: 'project-a', sourceId: 'source-a', sourceConfigFingerprint: await fingerprint('https://example.com/sub') })
    expect(active?.quality).toBe('empty')
    await service.close()
  })

  it.each([
    [new SubscriptionFetchError('SUBSCRIPTION_TLS_ERROR', 'The Runtime Service could not establish a trusted TLS connection to the subscription server.'), 'SUBSCRIPTION_TLS_ERROR', undefined],
    [new SubscriptionFetchError('SUBSCRIPTION_RUNTIME_POLICY_BLOCKED', 'The Runtime Service resolved the destination or redirect to a private or non-public address and blocked it.'), 'SUBSCRIPTION_RUNTIME_POLICY_BLOCKED', undefined],
    [new SubscriptionFetchError('SUBSCRIPTION_HTTP_ERROR', 'HTTP 403', 403), 'SUBSCRIPTION_HTTP_ERROR', 403],
  ])('returns the redacted gateway classification %s across the Runtime API', async (failure, code, httpStatus) => {
    const service = createTestService(sequenceFetcher(failure))
    await service.listen(0)
    try {
      const response = await fetch(`${address(service)}/api/v1/subscriptions/fetch`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ projectId: 'project-a', sourceId: 'source-a', sourceName: 'Fictional Source', url: 'https://example.com/sub?token=fictional-secret' }),
      })
      expect(response.status).toBe(502)
      const body = await response.json()
      expect(body).toEqual(expect.objectContaining({ error: code, ...(httpStatus ? { httpStatus } : {}) }))
      expect(JSON.stringify(body)).not.toContain('fictional-secret')
    } finally {
      await service.close()
    }
  })

  it('restores a history entry as a new active snapshot and clears history without deleting active state', async () => {
    const service = createTestService(sequenceFetcher(yamlBody('First', '198.51.100.10'), yamlBody('Second', '203.0.113.10')))
    await service.listen(0)
    const base = address(service)
    const request = (headers = authHeaders()) => fetch(`${base}/api/v1/subscriptions/fetch`, {
      method: 'POST', headers, body: JSON.stringify({ projectId: 'project-a', sourceId: 'source-a', sourceName: 'Fictional Source', url: 'https://example.com/sub' }),
    })
    await request()
    const second = await request()
    expect(second.status).toBe(200)
    const historyResponse = await fetch(`${base}/api/v1/projects/project-a/sources/source-a/history`, { headers: authHeaders() })
    const history = (await historyResponse.json()).history as Array<{ snapshotId: string }>
    expect(history.length).toBe(2)
    const restored = await fetch(`${base}/api/v1/projects/project-a/sources/source-a/history/restore`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ snapshotId: history[1].snapshotId }) })
    expect(restored.status).toBe(200)
    const restoredBody = await restored.json() as { snapshot: { snapshotId: string } }
    expect(restoredBody.snapshot.snapshotId).toContain('-restore-')
    await fetch(`${base}/api/v1/projects/project-a/sources/source-a/history`, { method: 'DELETE', headers: authHeaders() })
    const afterClear = await service.repository.readActive({ projectId: 'project-a', sourceId: 'source-a', sourceConfigFingerprint: await fingerprint('https://example.com/sub') })
    expect(afterClear).toBeTruthy()
    await service.close()
  })

  it('runs due schedules through the same refresh/LKG pipeline', async () => {
    let now = new Date('2026-08-17T00:00:00.000Z')
    const fetcher = sequenceFetcher(yamlBody('Scheduled', '198.51.100.12'), new SubscriptionFetchError('SUBSCRIPTION_NETWORK_ERROR', 'fictional scheduler failure'))
    const repository = new SqliteRuntimeRepository(':memory:')
    const service = createRuntimeService({ token, allowedOrigin: origin, fetcher, repository, now: () => now, schedulerIntervalMs: 60_000 })
    await repository.upsertSchedule({ projectId: 'project-a', sourceId: 'source-a', sourceName: 'Scheduled', url: 'https://example.com/sub', requestProfile: 'mihomo', intervalSeconds: 60, enabled: true, nextRunAt: '2026-08-16T23:59:00.000Z' })
    await service.runDueSchedules()
    expect(fetcher.fetch).toHaveBeenCalledTimes(1)
    expect(fetcher.fetch).toHaveBeenCalledWith('https://example.com/sub', expect.objectContaining({ requestProfile: 'mihomo' }))
    expect((await repository.listHistory('project-a', 'source-a'))).toHaveLength(1)
    expect((await repository.getSchedule('project-a', 'source-a'))?.lastRunAt).toBe(now.toISOString())
    const beforeFailure = await service.repository.readActive({ projectId: 'project-a', sourceId: 'source-a', sourceConfigFingerprint: await fingerprint('https://example.com/sub', 'mihomo') })
    now = new Date('2026-08-17T00:01:00.000Z')
    await service.runDueSchedules()
    expect(fetcher.fetch).toHaveBeenCalledTimes(2)
    expect(await service.repository.readActive({ projectId: 'project-a', sourceId: 'source-a', sourceConfigFingerprint: await fingerprint('https://example.com/sub', 'mihomo') })).toEqual(beforeFailure)
    await service.close()
  })

  it('keeps only the configured bounded history window', async () => {
    const repository = new SqliteRuntimeRepository(':memory:', 2)
    const service = createRuntimeService({ token, repository, fetcher: sequenceFetcher(yamlBody('One', '198.51.100.1')), schedulerIntervalMs: 60_000 })
    const scope = { projectId: 'project-a', sourceId: 'source-a', sourceConfigFingerprint: 'fictional' }
    for (let index = 0; index < 3; index += 1) {
      const snapshot = await createSnapshotCandidate({
        sourceId: 'source-a', inputKind: 'url', sourceConfigFingerprint: 'fictional', content: yamlBody(`Node ${index}`, '198.51.100.1'),
        result: parseSubscription(yamlBody(`Node ${index}`, '198.51.100.1'), { sourceId: 'source-a' }),
        fetchedAt: `2026-08-17T00:0${index}:00.000Z`, parsedAt: `2026-08-17T00:0${index}:00.000Z`,
      })
      await repository.writeActive(scope, { ...snapshot, committedAt: `2026-08-17T00:0${index}:00.000Z`, quality: 'usable' })
    }
    expect(await repository.listHistory('project-a', 'source-a')).toHaveLength(2)
    await service.close()
  })

  it('exposes schedule configuration without putting credentials in the response', async () => {
    const service = createTestService(sequenceFetcher(yamlBody('Ready', '198.51.100.10')))
    await service.listen(0)
    const base = address(service)
    const path = `${base}/api/v1/projects/project-a/sources/source-a/schedule`
    const saved = await fetch(path, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ sourceName: 'Source', url: 'https://example.com/sub?token=fictional-secret', requestProfile: 'sing-box', intervalSeconds: 300, enabled: true }) })
    expect(saved.status).toBe(200)
    const savedBody = await saved.json() as { schedule: { url: string; intervalSeconds: number } }
    expect(savedBody.schedule).toEqual(expect.objectContaining({ intervalSeconds: 300, requestProfile: 'sing-box', url: 'https://example.com/sub?token=fictional-secret' }))
    const read = await fetch(path, { headers: authHeaders() })
    expect((await read.json()).schedule.enabled).toBe(true)
    await fetch(path, { method: 'DELETE', headers: authHeaders() })
    expect((await (await fetch(path, { headers: authHeaders() })).json()).schedule).toBeNull()
    await service.close()
  })

  it('migrates existing schedules to the Auto request profile without changing their timing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'proxyflow-runtime-schedule-'))
    const databasePath = join(directory, 'runtime.sqlite')
    const legacy = new DatabaseSync(databasePath)
    legacy.exec(`CREATE TABLE schedules (
      project_id TEXT NOT NULL, source_id TEXT NOT NULL, source_name TEXT NOT NULL, url TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL, enabled INTEGER NOT NULL, next_run_at TEXT NOT NULL, last_run_at TEXT,
      PRIMARY KEY (project_id, source_id)
    )`)
    legacy.prepare('INSERT INTO schedules VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'project-a', 'source-a', 'Legacy', 'https://example.com/sub', 300, 1, '2026-08-17T00:05:00.000Z', null,
    )
    legacy.close()
    const repository = new SqliteRuntimeRepository(databasePath)
    try {
      await expect(repository.getSchedule('project-a', 'source-a')).resolves.toEqual(expect.objectContaining({
        requestProfile: 'auto', intervalSeconds: 300, nextRunAt: '2026-08-17T00:05:00.000Z',
      }))
    } finally {
      repository.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('validates request profiles at the Runtime API boundary and defaults missing values to Auto', async () => {
    const fetcher = sequenceFetcher(yamlBody('Ready', '198.51.100.10'))
    const service = createTestService(fetcher)
    await service.listen(0)
    try {
      const base = address(service)
      const invalid = await fetch(`${base}/api/v1/subscriptions/fetch`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ projectId: 'project-a', sourceId: 'source-a', sourceName: 'Source', url: 'https://example.com/sub', requestProfile: 'Clash.Meta\r\nX-Fictional: injected' }),
      })
      expect(invalid.status).toBe(400)
      await expect(invalid.json()).resolves.toEqual(expect.objectContaining({ error: 'SUBSCRIPTION_REQUEST_PROFILE_INVALID' }))
      expect(fetcher.fetch).not.toHaveBeenCalled()

      const valid = await fetch(`${base}/api/v1/subscriptions/fetch`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ projectId: 'project-a', sourceId: 'source-a', sourceName: 'Source', url: 'https://example.com/sub' }),
      })
      expect(valid.status).toBe(200)
      expect(fetcher.fetch).toHaveBeenCalledWith('https://example.com/sub', expect.objectContaining({ requestProfile: 'auto' }))
    } finally {
      await service.close()
    }
  })

  it('rejects disallowed browser origins and private destination addresses', async () => {
    const service = createTestService(sequenceFetcher(yamlBody('Ready', '198.51.100.10')))
    await service.listen(0)
    const base = address(service)
    const blocked = await fetch(`${base}/api/v1/subscriptions/fetch`, { method: 'POST', headers: { ...authHeaders(), Origin: 'https://evil.example' }, body: '{}' })
    expect(blocked.status).toBe(403)
    await expect(new ServerSourceFetcher({ resolveHost: async () => ['127.0.0.1'] }).fetch('https://example.com/sub')).rejects.toMatchObject({ code: 'SUBSCRIPTION_RUNTIME_POLICY_BLOCKED' })
    expect(isPublicAddress('127.0.0.1')).toBe(false)
    expect(isPublicAddress('192.168.1.1')).toBe(false)
    expect(isPublicAddress('2001:db8::1')).toBe(false)
    expect(isPublicAddress('8.8.8.8')).toBe(true)
    await service.close()
  })

  it('serves the Web app and authenticates same-origin API requests with an HttpOnly cookie', async () => {
    const webRoot = await mkdtemp(join(tmpdir(), 'proxyflow-web-'))
    await mkdir(join(webRoot, 'assets'))
    await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>ProxyFlow</title>')
    await writeFile(join(webRoot, 'assets', 'app.js'), 'export {}')
    const service = createRuntimeService({
      token, sameOrigin: true, staticDirectory: webRoot, version: '1.0.0',
      fetcher: sequenceFetcher(yamlBody('Ready', '198.51.100.10')),
      repository: new SqliteRuntimeRepository(':memory:'), schedulerIntervalMs: 60_000,
    })
    try {
      await service.listen(0)
      const base = address(service)
      const page = await fetch(`${base}/workspace`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('<title>ProxyFlow</title>')
      expect(page.headers.get('x-frame-options')).toBe('DENY')
      const asset = await fetch(`${base}/assets/app.js`)
      expect(asset.headers.get('cache-control')).toContain('immutable')
      expect(asset.headers.get('content-type')).toContain('text/javascript')
      expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404)
      expect((await fetch(`${base}/%2e%2e/package.json`)).status).toBe(404)

      const health = await fetch(`${base}/health`).then((response) => response.json())
      expect(health).toEqual(expect.objectContaining({ version: '1.0.0', web: 'ready', backend: 'ready', scheduler: 'ready' }))

      const discovered = await fetch(`${base}/api/v1/self-hosted`, { headers: { Origin: base } })
      expect(discovered.status).toBe(200)
      const discoveredBody = await discovered.json()
      expect(discoveredBody).toEqual(expect.objectContaining({ ok: true, service: 'proxyflow-runtime' }))
      expect(JSON.stringify(discoveredBody)).not.toContain(token)
      const cookie = discovered.headers.get('set-cookie')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Strict')
      expect(cookie).toContain('Path=/api/v1')
      expect(cookie).not.toContain(`Secure`)

      const secureDiscovery = await fetch(`${base}/api/v1/self-hosted`, {
        headers: { Origin: base, 'X-Forwarded-Proto': 'https' },
      })
      expect(secureDiscovery.headers.get('set-cookie')).toContain('Secure')

      const authenticated = await fetch(`${base}/api/v1/subscriptions/fetch`, {
        method: 'POST',
        headers: { Cookie: cookie!.split(';')[0], 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify({ projectId: 'project-a', sourceId: 'source-a', sourceName: 'Source', url: 'https://example.com/sub' }),
      })
      expect(authenticated.status).toBe(200)
      const blocked = await fetch(`${base}/api/v1/self-hosted`, { headers: { Origin: 'https://evil.example' } })
      expect(blocked.status).toBe(403)
    } finally {
      await service.close()
      await rm(webRoot, { recursive: true, force: true })
    }
  })
})

function createTestService(fetcher: SourceFetcher) {
  return createRuntimeService({ token, allowedOrigin: origin, fetcher, repository: new SqliteRuntimeRepository(':memory:'), schedulerIntervalMs: 60_000 })
}

function sequenceFetcher(...values: Array<string | Error>): SourceFetcher {
  let index = 0
  return { fetch: vi.fn(async (): Promise<SourceFetchResult> => {
    const value = values[Math.min(index++, values.length - 1)]
    if (value instanceof Error) throw value
    return { text: value, status: 200, contentType: 'text/plain', responseBytes: value.length, durationMs: 1 }
  }) }
}

function yamlBody(name: string, server: string) {
  return `proxies:\n  - name: ${name}\n    type: socks5\n    server: ${server}\n    port: 1080`
}

function authHeaders() { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin } }

function address(service: ReturnType<typeof createRuntimeService>) {
  const value = service.server.address()
  if (!value || typeof value === 'string') throw new Error('service is not listening')
  return `http://127.0.0.1:${value.port}`
}

async function fingerprint(url: string, requestProfile?: import('../../src/core/subscription/types').SubscriptionRequestProfile) {
  const { sourceConfigFingerprint } = await import('../../src/core/subscription/hash')
  return sourceConfigFingerprint('url', url, requestProfile)
}
