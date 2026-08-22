import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import { SubscriptionFetchError } from '../../src/core/subscription/errors'
import { DEFAULT_MAX_SUBSCRIPTION_BYTES } from '../../src/core/subscription/parseSubscription'
import {
  isSubscriptionRequestProfile, normalizeSubscriptionRequestProfile, subscriptionRequestUserAgents,
} from '../../src/core/subscription/requestProfile'
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
  wireBytes?: number
}

export interface RuntimeRequestOptions {
  maxBytes: number
  timeoutMs: number
  signal?: AbortSignal
  resolveHost: ResolveHost
  userAgent: string
}

export interface RuntimeFetcherOptions {
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  resolveHost?: ResolveHost
  request?: (url: URL, options: RuntimeRequestOptions) => Promise<RuntimeResponseBody>
}

interface FetchAttemptOptions {
  maxBytes: number
  maxRedirects: number
  deadline: number
  startedAt: number
  signal?: AbortSignal
  resolveHost: ResolveHost
  userAgent: string
}

export class ServerSourceFetcher implements SourceFetcher {
  constructor(private readonly defaults: RuntimeFetcherOptions = {}) {}

  async fetch(value: string, options: SourceFetchOptions = {}): Promise<SourceFetchResult> {
    if (options.requestProfile !== undefined && !isSubscriptionRequestProfile(options.requestProfile)) {
      throw new SubscriptionFetchError('SUBSCRIPTION_REQUEST_PROFILE_INVALID', 'The subscription request profile is invalid.')
    }
    const profile = normalizeSubscriptionRequestProfile(options.requestProfile)
    const maxBytes = options.maxBytes ?? this.defaults.maxBytes ?? Math.min(DEFAULT_RUNTIME_MAX_BYTES, DEFAULT_MAX_SUBSCRIPTION_BYTES)
    const timeoutMs = options.timeoutMs ?? this.defaults.timeoutMs ?? DEFAULT_RUNTIME_TIMEOUT_MS
    const maxRedirects = this.defaults.maxRedirects ?? DEFAULT_RUNTIME_MAX_REDIRECTS
    const resolveHost = this.defaults.resolveHost ?? resolvePublicHost
    const startedAt = Date.now()
    const deadline = startedAt + timeoutMs
    const userAgents = subscriptionRequestUserAgents(profile)

    for (let attempt = 0; attempt < userAgents.length; attempt += 1) {
      try {
        return await this.fetchWithUserAgent(value, {
          maxBytes, maxRedirects, deadline, startedAt, signal: options.signal, resolveHost, userAgent: userAgents[attempt],
        })
      } catch (error) {
        if (profile === 'auto' && attempt < userAgents.length - 1 && isNegotiationRejection(error)) continue
        throw error
      }
    }
    throw new SubscriptionFetchError('SUBSCRIPTION_HTTP_ERROR', 'The subscription server rejected every compatibility profile.')
  }

  private async fetchWithUserAgent(value: string, options: FetchAttemptOptions): Promise<SourceFetchResult> {
    let current = value
    for (let redirect = 0; redirect <= options.maxRedirects; redirect += 1) {
      let url: URL
      try { url = await withinDeadline(assertPublicUrl(current, options.resolveHost), options.deadline, options.signal) } catch (error) {
        if (error instanceof SubscriptionFetchError) throw error
        if (error instanceof RuntimeSecurityError) throw normalizeRuntimeSecurityError(error)
        throw new SubscriptionFetchError('SUBSCRIPTION_NETWORK_ERROR', 'The Runtime Service could not resolve the subscription host.')
      }
      let response: RuntimeResponseBody
      try {
        response = await (this.defaults.request ?? requestOnce)(url, {
          maxBytes: options.maxBytes,
          timeoutMs: remainingTime(options.deadline),
          signal: options.signal,
          resolveHost: options.resolveHost,
          userAgent: options.userAgent,
        })
      } catch (error) {
        throw normalizeServerRequestError(error, url.protocol)
      }
      if (response.bytes > options.maxBytes || (response.wireBytes ?? response.bytes) > options.maxBytes
        || new TextEncoder().encode(response.text).byteLength > options.maxBytes) {
        throw new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', 'Subscription response exceeds the Runtime Service size limit.')
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location
        if (!location || redirect === options.maxRedirects) throw new SubscriptionFetchError('SUBSCRIPTION_HTTP_ERROR', 'The subscription redirect chain is not allowed.', response.status)
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
        durationMs: Math.max(0, Date.now() - options.startedAt),
      }
    }
    throw new SubscriptionFetchError('SUBSCRIPTION_HTTP_ERROR', 'The subscription redirect chain is not allowed.')
  }
}

type RuntimeLookupOptions = number | { all?: boolean; family?: number }
type RuntimeLookupAddress = { address: string; family: 4 | 6 }
type RuntimeLookupCallback = (error: Error | null, address?: string | RuntimeLookupAddress[], family?: number) => void

export function createValidatedLookup(resolveHost: ResolveHost) {
  return (hostname: string, lookupOptions: RuntimeLookupOptions, callback: RuntimeLookupCallback) => {
    resolveHost(hostname).then((addresses) => {
      if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) throw new RuntimeSecurityError('RUNTIME_PRIVATE_ADDRESS')
      const requestedFamily = typeof lookupOptions === 'number' ? lookupOptions : lookupOptions.family
      const candidates = addresses
        .map((address): RuntimeLookupAddress => ({ address, family: isIP(address) as 4 | 6 }))
        .filter(({ family }) => family > 0 && (!requestedFamily || family === requestedFamily))
      if (candidates.length === 0) throw new Error('DNS lookup returned no usable address.')
      if (typeof lookupOptions === 'object' && lookupOptions.all) callback(null, candidates)
      else callback(null, candidates[0].address, candidates[0].family)
    }).catch((error) => callback(error instanceof Error ? error : new Error('DNS lookup failed.')))
  }
}

function requestOnce(url: URL, options: RuntimeRequestOptions): Promise<RuntimeResponseBody> {
  return new Promise((resolve, reject) => {
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest
    let settled = false
    let timedOut = false
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    let activeResponse: Readable | undefined
    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      options.signal?.removeEventListener('abort', abort)
    }
    const finishError = (error: unknown) => {
      if (!settled) { settled = true; cleanup(); reject(error) }
    }
    const finishSuccess = (body: RuntimeResponseBody) => {
      if (!settled) { settled = true; cleanup(); resolve(body) }
    }
    const request = requestFn(url, {
      method: 'GET',
      headers: {
        Accept: 'text/plain, text/yaml, application/yaml, application/json, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': options.userAgent,
      },
      lookup: createValidatedLookup(options.resolveHost),
    }, (response) => {
      activeResponse = response
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
      const status = response.statusCode ?? 0
      if (status < 200 || status >= 300) {
        response.destroy()
        finishSuccess({ status, headers, text: '', bytes: 0, wireBytes: 0 })
        return
      }
      void readRuntimeResponseBody(response, headers['content-encoding'], options.maxBytes, options.signal).then(
        ({ text, bytes, wireBytes }) => finishSuccess({ status, headers, text, bytes, wireBytes }),
        (error) => { response.destroy(); finishError(error) },
      )
    })
    const abort = () => {
      const error = new SubscriptionFetchError('SUBSCRIPTION_REFRESH_SUPERSEDED', 'Subscription refresh was superseded.')
      activeResponse?.destroy(error)
      request.destroy(error)
    }
    timeoutHandle = setTimeout(() => {
      timedOut = true
      const error = new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Subscription request timed out.')
      activeResponse?.destroy(error)
      request.destroy(error)
    }, options.timeoutMs)
    request.setTimeout(options.timeoutMs, () => {
      timedOut = true
      const error = new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Subscription request timed out.')
      activeResponse?.destroy(error)
      request.destroy(error)
    })
    request.on('error', (error) => finishError(timedOut
      ? new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Subscription request timed out.')
      : error))
    if (options.signal?.aborted) { abort(); return }
    options.signal?.addEventListener('abort', abort, { once: true })
    request.end()
  })
}

export async function readRuntimeResponseBody(
  source: Readable,
  contentEncoding: string | undefined,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<{ text: string; bytes: number; wireBytes: number }> {
  const encoding = normalizeContentEncoding(contentEncoding)
  const wireLimiter = new ByteLimitTransform(maxBytes)
  const decodedLimiter = new ByteLimitTransform(maxBytes)
  const chunks: Buffer[] = []
  decodedLimiter.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
  const decoder = encoding === 'gzip' ? createGunzip()
    : encoding === 'deflate' ? createInflate()
      : encoding === 'br' ? createBrotliDecompress()
        : undefined
  try {
    const streams = decoder
      ? [source, wireLimiter, decoder, decodedLimiter]
      : [source, wireLimiter, decodedLimiter]
    await pipeline(streams, ...(signal ? [{ signal }] : []))
  } catch (error) {
    if (error instanceof SubscriptionFetchError) throw error
    if (signal?.aborted) throw new SubscriptionFetchError('SUBSCRIPTION_REFRESH_SUPERSEDED', 'Subscription refresh was superseded.')
    if (decoder) throw new SubscriptionFetchError('SUBSCRIPTION_CONTENT_ENCODING_ERROR', 'The subscription response could not be decompressed safely.')
    throw error
  }
  return { text: Buffer.concat(chunks).toString('utf8'), bytes: decodedLimiter.bytes, wireBytes: wireLimiter.bytes }
}

class ByteLimitTransform extends Transform {
  bytes = 0

  constructor(private readonly maxBytes: number) { super() }

  override _transform(chunk: Buffer | Uint8Array, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    this.bytes += value.byteLength
    if (this.bytes > this.maxBytes) {
      callback(new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', 'Subscription response exceeds the Runtime Service size limit.'))
      return
    }
    callback(null, value)
  }
}

function normalizeContentEncoding(value: string | undefined): 'identity' | 'gzip' | 'deflate' | 'br' {
  const normalized = value?.trim().toLocaleLowerCase() || 'identity'
  if (normalized === 'identity' || normalized === 'gzip' || normalized === 'deflate' || normalized === 'br') return normalized
  throw new SubscriptionFetchError('SUBSCRIPTION_CONTENT_ENCODING_ERROR', 'The subscription server returned an unsupported content encoding.')
}

function normalizeServerRequestError(error: unknown, protocol: string) {
  if (error instanceof SubscriptionFetchError) return error
  if (error instanceof RuntimeSecurityError) return normalizeRuntimeSecurityError(error)
  const code = errorCode(error)
  if (isTlsErrorCode(code) || protocol === 'https:' && code === 'EPROTO') {
    return new SubscriptionFetchError('SUBSCRIPTION_TLS_ERROR', 'The Runtime Service could not establish a trusted TLS connection to the subscription server.')
  }
  return new SubscriptionFetchError('SUBSCRIPTION_NETWORK_ERROR', 'The Runtime Service could not reach the subscription server.')
}

function normalizeRuntimeSecurityError(error: RuntimeSecurityError) {
  if (error.code === 'RUNTIME_INVALID_URL') {
    return new SubscriptionFetchError('SUBSCRIPTION_INVALID_URL', 'The Runtime Service accepts only valid HTTP and HTTPS subscription URLs without embedded credentials.')
  }
  return new SubscriptionFetchError('SUBSCRIPTION_RUNTIME_POLICY_BLOCKED', 'The Runtime Service resolved the destination or redirect to a private or non-public address and blocked it.')
}

function isNegotiationRejection(error: unknown) {
  return error instanceof SubscriptionFetchError
    && error.code === 'SUBSCRIPTION_HTTP_ERROR'
    && (error.httpStatus === 403 || error.httpStatus === 406)
}

function remainingTime(deadline: number) {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Subscription request timed out.')
  return remaining
}

function withinDeadline<T>(task: Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
  const timeoutMs = remainingTime(deadline)
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => finish(() => reject(new SubscriptionFetchError('SUBSCRIPTION_REFRESH_SUPERSEDED', 'Subscription refresh was superseded.')))
    const timeout = setTimeout(() => finish(() => reject(new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Subscription request timed out.'))), timeoutMs)
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    task.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)))
  })
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : ''
}

function isTlsErrorCode(code: string) {
  return code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_') || new Set([
    'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  ]).has(code)
}

function parseHeaderNumber(value: string | undefined) {
  if (value === undefined) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}
