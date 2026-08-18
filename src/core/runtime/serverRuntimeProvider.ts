import { SubscriptionFetchError } from '../subscription/errors'
import type { SourceFetcher, SourceFetchOptions, SourceFetchResult } from '../subscription/sourceFetcher'
import type { SubscriptionSnapshot } from '../subscription/types'

export interface RuntimeServiceConfig {
  baseUrl: string
  token: string
  sameOrigin?: boolean
}

export interface ServerRuntimeProviderOptions {
  projectId: string
  sourceId: string
  sourceName: string
}

export interface RuntimeHealth {
  ok: boolean
  service: string
  runtimeStorageSchema: number
}

export interface RuntimeHistoryEntry {
  snapshotId: string
  committedAt: string
  quality: 'usable' | 'empty'
  readyCount: number
  detectedCount: number
}

export interface RuntimeSchedule {
  projectId: string
  sourceId: string
  sourceName: string
  url: string
  intervalSeconds: number
  enabled: boolean
  nextRunAt: string
  lastRunAt?: string
}

export class ServerRuntimeProvider implements SourceFetcher {
  constructor(private readonly config: RuntimeServiceConfig, private readonly source: ServerRuntimeProviderOptions) {}

  async fetch(url: string, options: SourceFetchOptions = {}): Promise<SourceFetchResult> {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? 15_000)
    const abort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/v1/subscriptions/fetch`, {
        method: 'POST',
        headers: runtimeHeaders(this.config, true),
        body: JSON.stringify({ projectId: this.source.projectId, sourceId: this.source.sourceId, sourceName: this.source.sourceName, url }),
        signal: controller.signal,
        credentials: runtimeCredentials(this.config),
      })
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>
      if (!response.ok) {
        const code = typeof payload.error === 'string' ? payload.error : 'SUBSCRIPTION_NETWORK_ERROR'
        throw new SubscriptionFetchError(normalizeErrorCode(code), typeof payload.message === 'string' ? payload.message : 'Runtime Service request failed.', response.status)
      }
      if (typeof payload.text !== 'string') throw new SubscriptionFetchError('SUBSCRIPTION_NETWORK_ERROR', 'Runtime Service returned no subscription content.')
      return {
        text: payload.text,
        status: 200,
        contentType: 'text/plain',
        responseBytes: new TextEncoder().encode(payload.text).byteLength,
        durationMs: 0,
      }
    } catch (error) {
      if (error instanceof SubscriptionFetchError) throw error
      if (controller.signal.aborted && options.signal?.aborted) throw new SubscriptionFetchError('SUBSCRIPTION_REFRESH_SUPERSEDED', 'Subscription refresh was superseded.')
      if (controller.signal.aborted) throw new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Runtime Service request timed out.')
      if (error instanceof TypeError) throw new SubscriptionFetchError('SUBSCRIPTION_NETWORK_ERROR', 'Runtime Service is unavailable.')
      throw new SubscriptionFetchError('SUBSCRIPTION_NETWORK_ERROR', 'Runtime Service request failed.')
    } finally {
      globalThis.clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abort)
    }
  }

  async health(): Promise<RuntimeHealth> {
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/health`, {
      headers: runtimeHeaders(this.config), credentials: runtimeCredentials(this.config),
    })
    if (!response.ok) throw new Error('Runtime Service health check failed.')
    return response.json() as Promise<RuntimeHealth>
  }

  async confirmEmpty() {
    return this.postAction('confirm-empty')
  }

  async discardEmpty() {
    return this.postAction('discard-empty')
  }

  async history(): Promise<RuntimeHistoryEntry[]> {
    const response = await this.request('history')
    const payload = await response.json() as { history?: RuntimeHistoryEntry[] }
    return payload.history ?? []
  }

  async restoreSnapshot(snapshotId: string): Promise<SubscriptionSnapshot> {
    const response = await fetch(`${this.sourceUrl('history/restore')}`, {
      method: 'POST', headers: runtimeHeaders(this.config, true), body: JSON.stringify({ snapshotId }), credentials: runtimeCredentials(this.config),
    })
    if (!response.ok) throw new Error('Runtime Service snapshot restore failed.')
    const payload = await response.json() as { snapshot?: SubscriptionSnapshot }
    if (!payload.snapshot) throw new Error('Runtime Service returned no restored snapshot.')
    return payload.snapshot
  }

  async getSchedule(): Promise<RuntimeSchedule | null> {
    const response = await this.request('schedule')
    const payload = await response.json() as { schedule?: RuntimeSchedule | null }
    return payload.schedule ?? null
  }

  async saveSchedule(url: string, intervalSeconds: number, enabled = true): Promise<RuntimeSchedule> {
    const response = await fetch(this.sourceUrl('schedule'), {
      method: 'PUT', headers: runtimeHeaders(this.config, true), credentials: runtimeCredentials(this.config),
      body: JSON.stringify({ sourceName: this.source.sourceName, url, intervalSeconds, enabled }),
    })
    if (!response.ok) throw new Error('Runtime Service schedule update failed.')
    const payload = await response.json() as { schedule?: RuntimeSchedule }
    if (!payload.schedule) throw new Error('Runtime Service returned no schedule.')
    return payload.schedule
  }

  async clearSchedule() {
    const response = await fetch(this.sourceUrl('schedule'), {
      method: 'DELETE', headers: runtimeHeaders(this.config), credentials: runtimeCredentials(this.config),
    })
    if (!response.ok && response.status !== 404) throw new Error('Runtime Service schedule removal failed.')
  }

  private sourceUrl(action: string) {
    return `${normalizeBaseUrl(this.config.baseUrl)}/api/v1/projects/${encodeURIComponent(this.source.projectId)}/sources/${encodeURIComponent(this.source.sourceId)}/${action}`
  }

  private async request(action: string) {
    const response = await fetch(this.sourceUrl(action), {
      headers: runtimeHeaders(this.config), credentials: runtimeCredentials(this.config),
    })
    if (!response.ok) throw new Error(`Runtime Service ${action} request failed.`)
    return response
  }

  private async postAction(action: string) {
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/v1/projects/${encodeURIComponent(this.source.projectId)}/sources/${encodeURIComponent(this.source.sourceId)}/${action}`, {
      method: 'POST', headers: runtimeHeaders(this.config), credentials: runtimeCredentials(this.config),
    })
    if (!response.ok && response.status !== 404) throw new Error(`Runtime Service ${action} failed.`)
  }
}

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

export function loadRuntimeServiceConfig(): RuntimeServiceConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem('proxyflow.runtime.provider.v1') ?? 'null') as Partial<RuntimeServiceConfig> | null
    if (parsed?.sameOrigin === true) return { baseUrl: '', token: '', sameOrigin: true }
    return parsed && typeof parsed.baseUrl === 'string' && typeof parsed.token === 'string' && parsed.baseUrl && parsed.token
      ? { baseUrl: parsed.baseUrl, token: parsed.token }
      : null
  } catch { return null }
}

export function saveRuntimeServiceConfig(config: RuntimeServiceConfig) {
  if (typeof window !== 'undefined') window.localStorage.setItem('proxyflow.runtime.provider.v1', JSON.stringify(config))
}

export function clearRuntimeServiceConfig() {
  if (typeof window !== 'undefined') window.localStorage.removeItem('proxyflow.runtime.provider.v1')
}

export async function detectSameOriginRuntime(fetcher: typeof fetch = globalThis.fetch): Promise<RuntimeServiceConfig | null> {
  try {
    const response = await fetcher('/api/v1/self-hosted', {
      headers: { Accept: 'application/json' }, credentials: 'same-origin',
    })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
    const payload = await response.json() as { ok?: boolean; service?: string }
    return payload.ok === true && payload.service === 'proxyflow-runtime'
      ? { baseUrl: '', token: '', sameOrigin: true }
      : null
  } catch { return null }
}

function runtimeHeaders(config: RuntimeServiceConfig, json = false) {
  return {
    ...(config.sameOrigin ? {} : { Authorization: `Bearer ${config.token}` }),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

function runtimeCredentials(config: RuntimeServiceConfig): RequestCredentials {
  return config.sameOrigin ? 'same-origin' : 'omit'
}

function normalizeErrorCode(value: string): ConstructorParameters<typeof SubscriptionFetchError>[0] {
  const allowed = new Set<ConstructorParameters<typeof SubscriptionFetchError>[0]>([
    'SUBSCRIPTION_HTTP_ERROR', 'SUBSCRIPTION_NETWORK_ERROR', 'SUBSCRIPTION_TIMEOUT', 'SUBSCRIPTION_TOO_LARGE', 'SUBSCRIPTION_REFRESH_SUPERSEDED',
  ])
  return allowed.has(value as ConstructorParameters<typeof SubscriptionFetchError>[0]) ? value as ConstructorParameters<typeof SubscriptionFetchError>[0] : 'SUBSCRIPTION_NETWORK_ERROR'
}
