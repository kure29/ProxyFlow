import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { RefreshCoordinator, commitCandidate } from '../../src/core/subscription/refreshCoordinator'
import { sourceConfigFingerprint } from '../../src/core/subscription/hash'
import type { SourceFetcher } from '../../src/core/subscription/sourceFetcher'
import type { SubscriptionRefreshError, SubscriptionSnapshot } from '../../src/core/subscription/types'
import { ServerSourceFetcher } from './sourceFetcher'
import { SqliteRuntimeRepository, type RuntimeSchedule } from './repository'

export interface RuntimeServiceOptions {
  token: string
  databasePath?: string
  allowedOrigin?: string
  maxHistoryPerSource?: number
  maxRequestsPerMinute?: number
  maxConcurrentRequests?: number
  fetcher?: SourceFetcher
  repository?: SqliteRuntimeRepository
  now?: () => Date
  schedulerIntervalMs?: number
  staticDirectory?: string
  sameOrigin?: boolean
  version?: string
}

export interface RuntimeServiceHandle {
  server: ReturnType<typeof createServer>
  repository: SqliteRuntimeRepository
  listen(port?: number, host?: string): Promise<void>
  close(): Promise<void>
  runDueSchedules(): Promise<void>
}

const MAX_JSON_BYTES = 128 * 1024
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SELF_HOSTED_COOKIE = 'proxyflow_runtime'

export function createRuntimeService(options: RuntimeServiceOptions): RuntimeServiceHandle {
  if (!options.token || options.token.length < 16) throw new Error('Runtime Service API token must contain at least 16 characters.')
  const repository = options.repository ?? new SqliteRuntimeRepository(options.databasePath ?? './proxyflow-runtime.sqlite', options.maxHistoryPerSource ?? 10)
  const fetcher = options.fetcher ?? new ServerSourceFetcher()
  const coordinator = new RefreshCoordinator(fetcher, repository, options.now ?? (() => new Date()))
  const now = options.now ?? (() => new Date())
  const rateLimit = new RateLimiter(options.maxRequestsPerMinute ?? 60)
  const maxConcurrent = options.maxConcurrentRequests ?? 3
  const staticDirectory = options.staticDirectory ? resolve(options.staticDirectory) : undefined
  let concurrent = 0
  let scheduler: ReturnType<typeof setInterval> | undefined

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch(() => respond(response, 500, { error: 'RUNTIME_INTERNAL_ERROR', message: 'The Runtime Service encountered an internal error.' }, options.allowedOrigin))
  })

  async function handleRequest(request: any, response: any) {
    const origin = request.headers.origin as string | undefined
    if (!applyCors(response, origin, options.allowedOrigin, request.headers.host, options.sameOrigin)) {
      respond(response, 403, { error: 'RUNTIME_ORIGIN_BLOCKED', message: 'This browser origin is not allowed.' })
      return
    }
    if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return }
    const url = new URL(request.url ?? '/', 'http://runtime.invalid')
    if (request.method === 'GET' && url.pathname === '/health') {
      respond(response, 200, {
        ok: true,
        service: 'proxyflow-runtime',
        version: options.version,
        runtimeStorageSchema: 1,
        web: staticDirectory ? 'ready' : 'disabled',
        backend: 'ready',
        scheduler: 'ready',
      }, options.allowedOrigin)
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/self-hosted' && options.sameOrigin) {
      setSessionCookie(response, options.token, isSecureRequest(request, origin))
      respond(response, 200, {
        ok: true,
        service: 'proxyflow-runtime',
        version: options.version,
        runtimeStorageSchema: 1,
        capabilities: { scheduledRefresh: true, history: true },
      }, options.allowedOrigin)
      return
    }
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments[0] !== 'api') {
      if ((request.method === 'GET' || request.method === 'HEAD') && staticDirectory && await serveStatic(response, request.method, url.pathname, staticDirectory)) return
      respond(response, 404, { error: 'RUNTIME_NOT_FOUND', message: 'Runtime Service endpoint not found.' }, options.allowedOrigin)
      return
    }
    if (segments[1] !== 'v1') {
      respond(response, 404, { error: 'RUNTIME_NOT_FOUND', message: 'Runtime Service endpoint not found.' }, options.allowedOrigin)
      return
    }
    if (!authorized(request.headers.authorization, request.headers.cookie, options.token)) {
      respond(response, 401, { error: 'RUNTIME_UNAUTHORIZED', message: 'A valid Runtime Service API token is required.' }, options.allowedOrigin)
      return
    }
    if (!rateLimit.allow(options.token)) {
      respond(response, 429, { error: 'RUNTIME_RATE_LIMITED', message: 'Runtime Service request rate limit exceeded.' }, options.allowedOrigin)
      return
    }
    if (request.method === 'POST' && segments.length === 4 && segments[2] === 'subscriptions' && segments[3] === 'fetch') {
      await withConcurrency(async () => refreshSubscription(request, response), response)
      return
    }
    if (segments[2] === 'projects' && segments.length >= 6 && segments[4] === 'sources') {
      const projectId = segments[3]
      const sourceId = segments[5]
      if (!validId(projectId) || !validId(sourceId)) { respond(response, 400, { error: 'RUNTIME_INVALID_ID', message: 'Project and source identifiers are invalid.' }, options.allowedOrigin); return }
      if (request.method === 'GET' && segments.length === 7 && segments[6] === 'history') {
        respond(response, 200, { history: await repository.listHistory(projectId, sourceId) }, options.allowedOrigin)
        return
      }
      if (request.method === 'DELETE' && segments.length === 7 && segments[6] === 'history') {
        await repository.clearHistory(projectId, sourceId)
        respond(response, 204, undefined, options.allowedOrigin)
        return
      }
      if (request.method === 'GET' && segments.length === 8 && segments[6] === 'history') {
        const snapshot = await repository.historySnapshot(projectId, sourceId, decodeURIComponent(segments[7]))
        if (!snapshot) { respond(response, 404, { error: 'RUNTIME_HISTORY_NOT_FOUND', message: 'Snapshot history entry not found.' }, options.allowedOrigin); return }
        respond(response, 200, { snapshot }, options.allowedOrigin)
        return
      }
      if (request.method === 'POST' && segments.length === 8 && segments[6] === 'history' && segments[7] === 'restore') {
        await restoreSnapshot(projectId, sourceId, request, response)
        return
      }
      if (request.method === 'POST' && segments.length === 7 && segments[6] === 'confirm-empty') {
        await confirmEmpty(projectId, sourceId, response)
        return
      }
      if (request.method === 'POST' && segments.length === 7 && segments[6] === 'discard-empty') {
        await repository.clearPendingEmpty(projectId, sourceId)
        respond(response, 204, undefined, options.allowedOrigin)
        return
      }
      if (request.method === 'DELETE' && segments.length === 6) {
        await repository.deleteSource(projectId, sourceId)
        coordinator.cancel(projectId, sourceId)
        respond(response, 204, undefined, options.allowedOrigin)
        return
      }
      if (request.method === 'GET' && segments.length === 7 && segments[6] === 'schedule') {
        respond(response, 200, { schedule: await repository.getSchedule(projectId, sourceId) ?? null }, options.allowedOrigin)
        return
      }
      if (request.method === 'PUT' && segments.length === 7 && segments[6] === 'schedule') {
        await saveSchedule(projectId, sourceId, request, response)
        return
      }
      if (request.method === 'DELETE' && segments.length === 7 && segments[6] === 'schedule') {
        await repository.deleteSchedule(projectId, sourceId)
        respond(response, 204, undefined, options.allowedOrigin)
        return
      }
    }
    respond(response, 404, { error: 'RUNTIME_NOT_FOUND', message: 'Runtime Service endpoint not found.' }, options.allowedOrigin)
  }

  async function refreshSubscription(request: any, response: any) {
    const body = await readJson(request)
    const projectId = String(body.projectId ?? '')
    const sourceId = String(body.sourceId ?? '')
    const sourceName = String(body.sourceName ?? sourceId)
    const sourceUrl = String(body.url ?? '').trim()
    if (!validId(projectId) || !validId(sourceId) || !sourceName || sourceName.length > 256 || !sourceUrl || sourceUrl.length > 8192) {
      respond(response, 400, { error: 'RUNTIME_INVALID_REQUEST', message: 'Project, source, name, and URL are required.' }, options.allowedOrigin)
      return
    }
    const fingerprint = await sourceConfigFingerprint('url', sourceUrl)
    const activeSnapshot = await repository.readActive({ projectId, sourceId, sourceConfigFingerprint: fingerprint })
    let fetchedText = ''
    let cacheError: SubscriptionRefreshError | undefined
    const result = await coordinator.refresh({ projectId, sourceId, sourceName, url: sourceUrl, activeSnapshot, onFetched: (fetched) => { fetchedText = fetched.text } }, {
      onStart: () => undefined,
      onCommit: () => undefined,
      onEmptyConfirmation: () => undefined,
      onFailure: () => undefined,
      onCacheError: (error) => { cacheError = error },
    })
    if (result.outcome === 'success') {
      if (cacheError) { respond(response, 503, { error: cacheError.code, message: cacheError.message }, options.allowedOrigin); return }
      respond(response, 200, { outcome: result.outcome, text: fetchedText, snapshot: result.snapshot, diff: result.diff }, options.allowedOrigin)
      return
    }
    if (result.outcome === 'empty-confirmation-required') {
      await repository.savePendingEmpty(projectId, sourceId, { candidate: result.candidate, diff: result.diff })
      respond(response, 200, { outcome: result.outcome, text: fetchedText, diff: result.diff, candidate: { quality: result.candidate.quality, readyCount: result.candidate.readyCount, detectedCount: result.candidate.result.detectedCount } }, options.allowedOrigin)
      return
    }
    if (result.outcome === 'superseded') { respond(response, 409, { error: 'SUBSCRIPTION_REFRESH_SUPERSEDED', message: 'Refresh was superseded by a newer request.' }, options.allowedOrigin); return }
    respond(response, 502, { error: result.error.code, message: result.error.message }, options.allowedOrigin)
  }

  async function confirmEmpty(projectId: string, sourceId: string, response: any) {
    const pending = await repository.readPendingEmpty(projectId, sourceId)
    if (!pending) { respond(response, 404, { error: 'SUBSCRIPTION_EMPTY_CONFIRMATION_REQUIRED', message: 'No pending empty snapshot exists.' }, options.allowedOrigin); return }
    const snapshot = commitCandidate(pending.candidate, now().toISOString())
    await repository.writeActive({ projectId, sourceId, sourceConfigFingerprint: snapshot.sourceConfigFingerprint }, snapshot)
    await repository.clearPendingEmpty(projectId, sourceId)
    respond(response, 200, { outcome: 'success', snapshot, diff: pending.diff }, options.allowedOrigin)
  }

  async function restoreSnapshot(projectId: string, sourceId: string, request: any, response: any) {
    const body = await readJson(request)
    const snapshotId = String(body.snapshotId ?? '')
    if (!snapshotId || snapshotId.length > 256) { respond(response, 400, { error: 'RUNTIME_INVALID_REQUEST', message: 'Snapshot ID is required.' }, options.allowedOrigin); return }
    const source = await repository.historySnapshot(projectId, sourceId, snapshotId)
    if (!source) { respond(response, 404, { error: 'RUNTIME_HISTORY_NOT_FOUND', message: 'Snapshot history entry not found.' }, options.allowedOrigin); return }
    const restored: SubscriptionSnapshot = { ...source, snapshotId: `${source.snapshotId}-restore-${now().getTime().toString(36)}`, committedAt: now().toISOString() }
    await repository.writeActive({ projectId, sourceId, sourceConfigFingerprint: restored.sourceConfigFingerprint }, restored)
    respond(response, 200, { outcome: 'success', snapshot: restored }, options.allowedOrigin)
  }

  async function saveSchedule(projectId: string, sourceId: string, request: any, response: any) {
    const body = await readJson(request)
    const sourceName = String(body.sourceName ?? sourceId)
    const sourceUrl = String(body.url ?? '').trim()
    const intervalSeconds = Number(body.intervalSeconds)
    const enabled = body.enabled !== false
    if (!sourceUrl || sourceUrl.length > 8192 || !Number.isInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 30 * 24 * 60 * 60) {
      respond(response, 400, { error: 'RUNTIME_INVALID_SCHEDULE', message: 'Schedule URL and an interval from 60 seconds to 30 days are required.' }, options.allowedOrigin)
      return
    }
    const schedule: RuntimeSchedule = { projectId, sourceId, sourceName, url: sourceUrl, intervalSeconds, enabled, nextRunAt: new Date(now().getTime() + intervalSeconds * 1000).toISOString() }
    await repository.upsertSchedule(schedule)
    respond(response, 200, { schedule }, options.allowedOrigin)
  }

  async function withConcurrency(task: () => Promise<void>, response: any) {
    if (concurrent >= maxConcurrent) { respond(response, 429, { error: 'RUNTIME_CONCURRENCY_LIMITED', message: 'Too many Runtime Service fetches are active.' }, options.allowedOrigin); return }
    concurrent += 1
    try { await task() } finally { concurrent -= 1 }
  }

  async function runDueSchedules() {
    const current = now()
    const due = await repository.dueSchedules(current.toISOString())
    for (const schedule of due) {
      const fingerprint = await sourceConfigFingerprint('url', schedule.url)
      const activeSnapshot = await repository.readActive({ projectId: schedule.projectId, sourceId: schedule.sourceId, sourceConfigFingerprint: fingerprint })
      const result = await coordinator.refresh({ projectId: schedule.projectId, sourceId: schedule.sourceId, sourceName: schedule.sourceName, url: schedule.url, activeSnapshot }, {
        onStart: () => undefined, onCommit: () => undefined, onEmptyConfirmation: () => undefined, onFailure: () => undefined, onCacheError: () => undefined,
      })
      if (result.outcome === 'empty-confirmation-required') await repository.savePendingEmpty(schedule.projectId, schedule.sourceId, { candidate: result.candidate, diff: result.diff })
      const next = new Date(current.getTime() + schedule.intervalSeconds * 1000).toISOString()
      await repository.markScheduleRun(schedule.projectId, schedule.sourceId, current.toISOString(), next)
    }
  }

  scheduler = setInterval(() => { void runDueSchedules().catch(() => undefined) }, options.schedulerIntervalMs ?? 1_000)
  scheduler.unref?.()

  return {
    server, repository,
    listen: (port = 8787, host = '127.0.0.1') => new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => { server.removeListener('error', reject); resolve() })
    }),
    close: () => new Promise<void>((resolve, reject) => {
      if (scheduler) clearInterval(scheduler)
      if (!server.listening) { repository.close(); resolve(); return }
      server.close((error) => { repository.close(); error ? reject(error) : resolve() })
    }),
    runDueSchedules,
  }
}

function authorized(authorization: string | undefined, cookie: string | undefined, expected: string) {
  const providedValue = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : readCookie(cookie, SELF_HOSTED_COOKIE)
  if (!providedValue) return false
  const provided = Buffer.from(providedValue)
  const target = Buffer.from(expected)
  return provided.length === target.length && timingSafeEqual(provided, target)
}

function validId(value: string) { return ID_PATTERN.test(value) }

function applyCors(response: any, origin: string | undefined, allowedOrigin: string | undefined, host: string | undefined, sameOrigin = false) {
  const requestHost = origin ? safeOriginHost(origin) : undefined
  const acceptedOrigin = Boolean(origin && (origin === allowedOrigin || sameOrigin && requestHost && requestHost === host))
  if (origin && !acceptedOrigin) return false
  if (origin && acceptedOrigin) response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.setHeader('Vary', 'Origin')
  return true
}

function safeOriginHost(origin: string) {
  try { return new URL(origin).host } catch { return undefined }
}

function readCookie(value: string | undefined, name: string) {
  if (!value) return undefined
  const entry = value.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  if (!entry) return undefined
  try { return decodeURIComponent(entry.slice(name.length + 1)) } catch { return undefined }
}

function setSessionCookie(response: any, token: string, secure: boolean) {
  response.setHeader('Set-Cookie', `${SELF_HOSTED_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/api/v1; Max-Age=86400${secure ? '; Secure' : ''}`)
}

function isSecureRequest(request: any, origin: string | undefined) {
  const forwarded = String(request.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()
  return forwarded === 'https' || origin?.startsWith('https://') === true
}

async function serveStatic(response: any, method: string, pathname: string, root: string) {
  let decoded: string
  try { decoded = decodeURIComponent(pathname) } catch { respond(response, 400, { error: 'RUNTIME_INVALID_PATH', message: 'The requested path is invalid.' }); return true }
  const requested = resolve(root, `.${decoded}`)
  if (requested !== root && !requested.startsWith(`${root}${sep}`)) {
    respond(response, 404, { error: 'RUNTIME_NOT_FOUND', message: 'Runtime Service endpoint not found.' })
    return true
  }
  let file = requested
  try {
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html')
  } catch {
    if (extname(decoded) || decoded.startsWith('/assets/')) {
      respond(response, 404, { error: 'RUNTIME_NOT_FOUND', message: 'Runtime Service endpoint not found.' })
      return true
    }
    file = resolve(root, 'index.html')
  }
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    respond(response, 404, { error: 'RUNTIME_NOT_FOUND', message: 'Runtime Service endpoint not found.' })
    return true
  }
  try {
    const body = await readFile(file)
    response.statusCode = 200
    response.setHeader('Content-Type', contentType(file))
    response.setHeader('Content-Length', body.byteLength)
    response.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Frame-Options', 'DENY')
    method === 'HEAD' ? response.end() : response.end(body)
  } catch {
    respond(response, 404, { error: 'RUNTIME_NOT_FOUND', message: 'Runtime Service endpoint not found.' })
  }
  return true
}

function contentType(file: string) {
  const extension = extname(file).toLowerCase()
  if (extension === '.html') return 'text/html; charset=utf-8'
  if (extension === '.js') return 'text/javascript; charset=utf-8'
  if (extension === '.css') return 'text/css; charset=utf-8'
  if (extension === '.json') return 'application/json; charset=utf-8'
  if (extension === '.png') return 'image/png'
  if (extension === '.svg') return 'image/svg+xml'
  if (extension === '.ico') return 'image/x-icon'
  if (extension === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

function respond(response: any, status: number, body?: unknown, origin?: string) {
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Cache-Control', 'no-store')
  response.statusCode = status
  if (body === undefined || status === 204) { response.end(); return }
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function readJson(request: any): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength
      if (bytes > MAX_JSON_BYTES) { request.destroy(); reject(new Error('request too large')); return }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid body')
        resolve(value as Record<string, unknown>)
      } catch { reject(new Error('invalid json')) }
    })
    request.on('error', reject)
  })
}

class RateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>()
  constructor(private readonly maxPerMinute: number) {}
  allow(key: string) {
    const now = Date.now()
    const current = this.windows.get(key)
    if (!current || now - current.startedAt >= 60_000) { this.windows.set(key, { startedAt: now, count: 1 }); return true }
    if (current.count >= this.maxPerMinute) return false
    current.count += 1
    return true
  }
}
