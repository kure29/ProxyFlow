import { SubscriptionFetchError } from './errors'
import { diffSubscriptionSnapshots } from './diff'
import { sourceConfigFingerprint } from './hash'
import { parseSubscription } from './parseSubscription'
import { createSnapshotCandidate } from './snapshot'
import { BrowserSourceFetcher, type SourceFetcher } from './sourceFetcher'
import type { SubscriptionCacheScope, SubscriptionRuntimeRepository } from './runtimeRepository'
import { subscriptionRuntimeRepository } from './runtimeRepository'
import type {
  SubscriptionDiff, SubscriptionRefreshError, SubscriptionRefreshErrorCode, SubscriptionSnapshot, SubscriptionSnapshotCandidate,
} from './types'

export interface RefreshRequest {
  projectId: string
  sourceId: string
  sourceName: string
  url: string
  activeSnapshot?: SubscriptionSnapshot
  fetcher?: SourceFetcher
  onFetched?: (result: Awaited<ReturnType<SourceFetcher['fetch']>>) => void
}

export interface RefreshHandlers {
  onStart(generation: number, attemptedAt: string, fingerprint: string): void
  onCommit(snapshot: SubscriptionSnapshot, diff: SubscriptionDiff, generation: number): void
  onEmptyConfirmation(candidate: SubscriptionSnapshotCandidate, diff: SubscriptionDiff, generation: number): void
  onFailure(error: SubscriptionRefreshError, generation: number): void
  onCacheError(error: SubscriptionRefreshError, generation: number): void
}

export type RefreshExecutionResult =
  | { outcome: 'success'; snapshot: SubscriptionSnapshot; diff: SubscriptionDiff }
  | { outcome: 'failure'; error: SubscriptionRefreshError }
  | { outcome: 'superseded' }
  | { outcome: 'empty-confirmation-required'; candidate: SubscriptionSnapshotCandidate; diff: SubscriptionDiff }

interface ActiveRequest { generation: number; controller: AbortController }

export class RefreshCoordinator {
  private readonly activeRequests = new Map<string, ActiveRequest>()
  private readonly generations = new Map<string, number>()
  private readonly cacheWrites = new Map<string, Promise<void>>()
  private readonly deletedSources = new Set<string>()

  constructor(
    private readonly fetcher: SourceFetcher = new BrowserSourceFetcher(),
    private readonly repository: SubscriptionRuntimeRepository = subscriptionRuntimeRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async refresh(request: RefreshRequest, handlers: RefreshHandlers): Promise<RefreshExecutionResult> {
    const key = requestKey(request.projectId, request.sourceId)
    this.deletedSources.delete(key)
    const previous = this.activeRequests.get(key)
    previous?.controller.abort('superseded')
    const generation = (this.generations.get(key) ?? 0) + 1
    const controller = new AbortController()
    this.generations.set(key, generation)
    this.activeRequests.set(key, { generation, controller })
    const attemptedAt = this.now().toISOString()
    const fingerprint = await sourceConfigFingerprint('url', request.url)
    if (!this.isCurrent(key, generation)) return { outcome: 'superseded' }
    handlers.onStart(generation, attemptedAt, fingerprint)

    try {
      const fetched = await (request.fetcher ?? this.fetcher).fetch(request.url, { signal: controller.signal })
      request.onFetched?.(fetched)
      if (!this.isCurrent(key, generation)) return { outcome: 'superseded' }
      const fetchedAt = this.now().toISOString()
      const result = parseSubscription(fetched.text, { sourceId: request.sourceId, sourceName: request.sourceName })
      const parsedAt = this.now().toISOString()
      const candidate = await createSnapshotCandidate({
        sourceId: request.sourceId,
        inputKind: 'url',
        sourceConfigFingerprint: fingerprint,
        content: fetched.text,
        result,
        fetchedAt,
        parsedAt,
        http: {
          status: fetched.status,
          contentType: fetched.contentType,
          ...(fetched.contentLength !== undefined ? { contentLength: fetched.contentLength } : {}),
          ...(fetched.responseBytes !== undefined ? { responseBytes: fetched.responseBytes } : {}),
          etag: fetched.etag,
          lastModified: fetched.lastModified,
          durationMs: fetched.durationMs,
        },
      })
      if (!this.isCurrent(key, generation)) return { outcome: 'superseded' }
      if (candidate.quality === 'invalid') {
        const error = invalidCandidateError(candidate, parsedAt)
        handlers.onFailure(error, generation)
        return { outcome: 'failure', error }
      }
      const diff = await diffSubscriptionSnapshots(request.activeSnapshot, candidate)
      if (!this.isCurrent(key, generation)) return { outcome: 'superseded' }
      if (candidate.quality === 'empty' && request.activeSnapshot?.quality === 'usable') {
        handlers.onEmptyConfirmation(candidate, diff, generation)
        return { outcome: 'empty-confirmation-required', candidate, diff }
      }
      const snapshot = commitCandidate(candidate, this.now().toISOString())
      try {
        handlers.onCommit(snapshot, diff, generation)
      } catch {
        const error = refreshError('SUBSCRIPTION_SNAPSHOT_COMMIT_FAILED', 'The refreshed snapshot could not be committed.', this.now().toISOString())
        handlers.onFailure(error, generation)
        return { outcome: 'failure', error }
      }
      await this.persistCommittedSnapshot(request.projectId, snapshot, generation, handlers)
      return { outcome: 'success', snapshot, diff }
    } catch (cause) {
      if (!this.isCurrent(key, generation)) return { outcome: 'superseded' }
      const error = normalizeRefreshError(cause, this.now().toISOString())
      if (error.code === 'SUBSCRIPTION_REFRESH_SUPERSEDED') return { outcome: 'superseded' }
      handlers.onFailure(error, generation)
      return { outcome: 'failure', error }
    } finally {
      if (this.isCurrent(key, generation)) this.activeRequests.delete(key)
    }
  }

  cancel(projectId: string, sourceId: string) {
    const key = requestKey(projectId, sourceId)
    this.activeRequests.get(key)?.controller.abort('superseded')
    this.activeRequests.delete(key)
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1)
  }

  async deleteSource(projectId: string, sourceId: string) {
    const key = requestKey(projectId, sourceId)
    this.cancel(projectId, sourceId)
    this.deletedSources.add(key)
    const previous = this.cacheWrites.get(key) ?? Promise.resolve()
    const deletion = previous.catch(() => undefined).then(() => this.repository.deleteSource(projectId, sourceId))
    this.cacheWrites.set(key, deletion)
    try {
      await deletion
    } finally {
      if (this.cacheWrites.get(key) === deletion) this.cacheWrites.delete(key)
    }
  }

  async persistSnapshot(projectId: string, snapshot: SubscriptionSnapshot, handlers?: Pick<RefreshHandlers, 'onCacheError'>, generation = 0) {
    const key = requestKey(projectId, snapshot.sourceId)
    if (this.deletedSources.has(key) || (generation > 0 && !this.isCurrent(key, generation))) return
    const scope = { projectId, sourceId: snapshot.sourceId, sourceConfigFingerprint: snapshot.sourceConfigFingerprint }
    const previous = this.cacheWrites.get(key) ?? Promise.resolve()
    const write = previous.catch(() => undefined).then(async () => {
      if (this.deletedSources.has(key) || (generation > 0 && !this.isCurrent(key, generation))) return
      await this.repository.writeActive(scope, snapshot)
    })
    this.cacheWrites.set(key, write)
    try {
      await write
    } catch {
      handlers?.onCacheError(refreshError('SUBSCRIPTION_CACHE_WRITE_FAILED', 'The current snapshot is active, but it could not be saved to this browser. Reloading may restore an older cache.', this.now().toISOString()), generation)
    } finally {
      if (this.cacheWrites.get(key) === write) this.cacheWrites.delete(key)
    }
  }

  async clearPersistedSnapshot(scope: SubscriptionCacheScope, shouldClear: () => boolean = () => true) {
    const key = requestKey(scope.projectId, scope.sourceId)
    const previous = this.cacheWrites.get(key) ?? Promise.resolve()
    const clear = previous.catch(() => undefined).then(() => shouldClear() ? this.repository.deleteActive(scope) : undefined)
    this.cacheWrites.set(key, clear)
    try {
      await clear
    } finally {
      if (this.cacheWrites.get(key) === clear) this.cacheWrites.delete(key)
    }
  }

  private persistCommittedSnapshot(projectId: string, snapshot: SubscriptionSnapshot, generation: number, handlers: RefreshHandlers) {
    return this.persistSnapshot(projectId, snapshot, handlers, generation)
  }

  private isCurrent(key: string, generation: number) {
    return this.generations.get(key) === generation
  }
}

export function commitCandidate(candidate: SubscriptionSnapshotCandidate, committedAt: string): SubscriptionSnapshot {
  if (candidate.quality === 'invalid') throw new Error('Invalid subscription candidate cannot be committed.')
  return { ...candidate, quality: candidate.quality, committedAt }
}

export function normalizeRefreshError(cause: unknown, at: string): SubscriptionRefreshError {
  if (cause instanceof SubscriptionFetchError) return refreshError(cause.code, cause.message, at, cause.httpStatus)
  return refreshError('SUBSCRIPTION_RUNTIME_INTERNAL_ERROR', 'Subscription refresh failed because of an internal runtime error.', at)
}

function invalidCandidateError(candidate: SubscriptionSnapshotCandidate, at: string) {
  let code: SubscriptionRefreshErrorCode = 'SUBSCRIPTION_PARSE_FAILED'
  if (candidate.format === 'unsupported') code = candidate.result.issues.some((issue) => issue.code === 'PARSE_FAILED')
    ? 'SUBSCRIPTION_PARSE_FAILED'
    : 'SUBSCRIPTION_UNSUPPORTED_FORMAT'
  else if (candidate.result.detectedCount > 0 && candidate.readyCount === 0) code = 'SUBSCRIPTION_NO_USABLE_NODES'
  else if (candidate.result.issues.some((issue) => issue.code === 'SUBSCRIPTION_TOO_LARGE')) code = 'SUBSCRIPTION_TOO_LARGE'
  return refreshError(code, safeErrorMessage(code), at)
}

function safeErrorMessage(code: SubscriptionRefreshErrorCode) {
  if (code === 'SUBSCRIPTION_UNSUPPORTED_FORMAT') return 'The subscription format is not supported.'
  if (code === 'SUBSCRIPTION_NO_USABLE_NODES') return 'The subscription contains no Ready nodes; the previous snapshot was retained.'
  if (code === 'SUBSCRIPTION_TOO_LARGE') return 'The subscription exceeds the browser size limit.'
  return 'The subscription could not be parsed.'
}

function refreshError(code: SubscriptionRefreshErrorCode, message: string, at: string, httpStatus?: number): SubscriptionRefreshError {
  return { code, message, at, ...(httpStatus !== undefined ? { httpStatus } : {}) }
}

function requestKey(projectId: string, sourceId: string) {
  return `${projectId}\u0000${sourceId}`
}
