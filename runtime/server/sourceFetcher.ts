import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { SubscriptionFetchError } from '../../src/core/subscription/errors'
import { DEFAULT_MAX_SUBSCRIPTION_BYTES } from '../../src/core/subscription/parseSubscription'
import type { SourceFetcher, SourceFetchOptions, SourceFetchResult } from '../../src/core/subscription/sourceFetcher'
import {
  assertPublicUrl, DEFAULT_RUNTIME_MAX_BYTES, DEFAULT_RUNTIME_MAX_REDIRECTS, DEFAULT_RUNTIME_TIMEOUT_MS,
  resolvePublicHost, type ResolveHost, RuntimeSecurityError, isPublicAddress,
} from './ssrf'

export interface RuntimeResponseBody {
  status: number
  headers: Record<string, string | undefined>
  text: string
  bytes: number
}

export interface RuntimeFetcherOptions {
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  resolveHost?: ResolveHost
  request?: (url: URL, options: { maxBytes: number; timeoutMs: number; signal?: AbortSignal; resolveHost: ResolveHost }) => Promise<RuntimeResponseBody>
}

export class ServerSourceFetcher implements SourceFetcher {
  constructor(private readonly defaults: RuntimeFetcherOptions = {}) {}

  async fetch(value: string, options: SourceFetchOptions = {}): Promise<SourceFetchResult> {
    const maxBytes = options.maxBytes ?? this.defaults.maxBytes ?? Math.min(DEFAULT_RUNTIME_MAX_BYTES, DEFAULT_MAX_SUBSCRIPTION_BYTES)
    const timeoutMs = options.timeoutMs ?? this.defaults.timeoutMs ?? DEFAULT_RUNTIME_TIMEOUT_MS
    const maxRedirects = this.defaults.maxRedirects ?? DEFAULT_RUNTIME_MAX_REDIRECTS
    const resolveHost = this.defaults.resolveHost ?? resolvePublicHost
    const startedAt = Date.now()
    let current = value
    for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
      let url: URL
      try { url = await assertPublicUrl(current, resolveHost) } catch (error) {
        if (error instanceof RuntimeSecurityError) throw new SubscriptionFetchError('SUBSCRIPTION_INVALID_URL', error.message)
        throw new SubscriptionFetchError('SUBSCRIPTION_NETWORK_ERROR', 'The Runtime Service could not resolve the subscription host.')
      }
      const response = await (this.defaults.request ?? requestOnce)(url, { ...options, maxBytes, timeoutMs, resolveHost })
      if (response.bytes > maxBytes || new TextEncoder().encode(response.text).byteLength > maxBytes) throw new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', 'Subscription response exceeds the Runtime Service size limit.')
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location
        if (!location || redirect === maxRedirects) throw new SubscriptionFetchError('SUBSCRIPTION_HTTP_ERROR', 'The subscription redirect chain is not allowed.', response.status)
        try { current = new URL(location, url).toString() } catch { throw new SubscriptionFetchError('SUBSCRIPTION_INVALID_URL', 'The subscription redirect URL is invalid.') }
        continue
      }
      if (response.status < 200 || response.status >= 300) throw new SubscriptionFetchError('SUBSCRIPTION_HTTP_ERROR', `HTTP ${response.status}`, response.status)
      return {
        text: response.text,
        status: response.status,
        contentType: response.headers['content-type'],
        contentLength: parseHeaderNumber(response.headers['content-length']),
        responseBytes: response.bytes,
        etag: response.headers.etag,
        lastModified: response.headers['last-modified'],
        durationMs: Math.max(0, Date.now() - startedAt),
      }
    }
    throw new SubscriptionFetchError('SUBSCRIPTION_HTTP_ERROR', 'The subscription redirect chain is not allowed.')
  }
}

function requestOnce(url: URL, options: SourceFetchOptions & { maxBytes: number; timeoutMs: number; resolveHost: ResolveHost }): Promise<RuntimeResponseBody> {
  return new Promise((resolve, reject) => {
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest
    let settled = false
    let timedOut = false
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const finishError = (error: unknown) => { if (!settled) { if (timeoutHandle) clearTimeout(timeoutHandle); settled = true; reject(error) } }
    const request = requestFn(url, {
      method: 'GET',
      headers: { Accept: 'text/plain, text/yaml, application/yaml, application/json, */*', 'User-Agent': 'ProxyFlow-Runtime/1.0' },
      lookup: (hostname: string, _options: unknown, callback: (error: Error | null, address?: string, family?: number) => void) => {
        options.resolveHost(hostname).then((addresses) => {
          if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) throw new RuntimeSecurityError('RUNTIME_PRIVATE_ADDRESS')
          callback(null, addresses[0], addresses[0].includes(':') ? 6 : 4)
        }).catch((error) => callback(error instanceof Error ? error : new Error('DNS lookup failed')))
      },
    }, (response) => {
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength
        if (bytes > options.maxBytes) {
          response.destroy()
          finishError(new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', 'Subscription response exceeds the Runtime Service size limit.'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        if (settled) return
        if (timeoutHandle) clearTimeout(timeoutHandle)
        settled = true
        resolve({ status: response.statusCode ?? 0, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])), text: Buffer.concat(chunks).toString('utf8'), bytes })
      })
      response.on('error', finishError)
    })
    timeoutHandle = setTimeout(() => { timedOut = true; request.destroy(new Error('timeout')) }, options.timeoutMs)
    request.setTimeout(options.timeoutMs, () => { timedOut = true; request.destroy(new Error('timeout')) })
    request.on('error', (error) => finishError(timedOut ? new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Subscription request timed out.') : error))
    const abort = () => request.destroy(new SubscriptionFetchError('SUBSCRIPTION_REFRESH_SUPERSEDED', 'Subscription refresh was superseded.'))
    if (options.signal?.aborted) { abort(); return }
    options.signal?.addEventListener('abort', abort, { once: true })
    request.on('close', () => options.signal?.removeEventListener('abort', abort))
    request.end()
  })
}

function parseHeaderNumber(value: string | undefined) {
  if (value === undefined) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}
