import { SubscriptionFetchError } from './errors'
import { DEFAULT_MAX_SUBSCRIPTION_BYTES } from './parseSubscription'

export interface SourceFetcher {
  fetch(url: string, options?: SourceFetchOptions): Promise<SourceFetchResult>
}

export interface SourceFetchOptions {
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes?: number
}

export interface SourceFetchResult {
  text: string
  status: number
  contentType?: string
  contentLength?: number
  responseBytes?: number
  etag?: string
  lastModified?: string
  durationMs: number
}

export class BrowserSourceFetcher implements SourceFetcher {
  async fetch(url: string, options: SourceFetchOptions = {}): Promise<SourceFetchResult> {
    if (!isSafeSubscriptionUrl(url)) throw new SubscriptionFetchError('SUBSCRIPTION_INVALID_URL', 'Subscription URL must use HTTP or HTTPS.')
    const timeoutMs = options.timeoutMs ?? 12_000
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_SUBSCRIPTION_BYTES
    const controller = new AbortController()
    const startedAt = performance.now()
    let timedOut = false
    const timeout = globalThis.setTimeout(() => { timedOut = true; controller.abort('timeout') }, timeoutMs)
    const abort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/plain, text/yaml, application/yaml, */*' } })
      if (!response.ok) throw new SubscriptionFetchError('SUBSCRIPTION_HTTP_ERROR', `HTTP ${response.status}`, response.status)
      const contentLengthHeader = response.headers.get('content-length')
      const declaredLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader)
      if (declaredLength !== undefined && Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', 'Subscription response exceeds the browser size limit.')
      let text: string
      let responseBytes = 0
      if (!response.body) {
        text = await response.text()
        responseBytes = new TextEncoder().encode(text).byteLength
        if (responseBytes > maxBytes) throw new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', 'Subscription response exceeds the browser size limit.')
      } else {
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let length = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          length += value.byteLength
          if (length > maxBytes) {
            await reader.cancel()
            throw new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', 'Subscription response exceeds the browser size limit.')
          }
          chunks.push(value)
        }
        const bytes = new Uint8Array(length)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        responseBytes = length
        text = new TextDecoder().decode(bytes)
      }
      return {
        text,
        status: response.status,
        contentType: response.headers.get('content-type') ?? undefined,
        ...(declaredLength !== undefined && Number.isFinite(declaredLength) && declaredLength >= 0 ? { contentLength: declaredLength } : {}),
        responseBytes,
        etag: response.headers.get('etag') ?? undefined,
        lastModified: response.headers.get('last-modified') ?? undefined,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      }
    } catch (error) {
      if (error instanceof SubscriptionFetchError) throw error
      if (timedOut) throw new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Subscription request timed out.')
      if (options.signal?.aborted) throw new SubscriptionFetchError('SUBSCRIPTION_REFRESH_SUPERSEDED', 'Subscription refresh was superseded.')
      if (error instanceof TypeError) throw new SubscriptionFetchError('SUBSCRIPTION_CORS_BLOCKED', 'The browser blocked this cross-origin request. Use Paste Content, Local File, or a URL that supports CORS.')
      throw new SubscriptionFetchError('SUBSCRIPTION_NETWORK_ERROR', 'Subscription request failed because of a network error.')
    } finally {
      globalThis.clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abort)
    }
  }

  async fetchText(url: string, options: SourceFetchOptions = {}) {
    return (await this.fetch(url, options)).text
  }
}

function isSafeSubscriptionUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
