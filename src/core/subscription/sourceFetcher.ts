import { SubscriptionFetchError } from './errors'
import { DEFAULT_MAX_SUBSCRIPTION_BYTES } from './parseSubscription'

export interface SourceFetcher {
  fetchText(url: string, options?: { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number }): Promise<string>
}

export class BrowserSourceFetcher implements SourceFetcher {
  async fetchText(url: string, options: { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number } = {}): Promise<string> {
    if (!isSafeSubscriptionUrl(url)) throw new SubscriptionFetchError('INVALID_SUBSCRIPTION_URL', '订阅地址必须使用 HTTP 或 HTTPS。')
    const timeoutMs = options.timeoutMs ?? 12_000
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_SUBSCRIPTION_BYTES
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort('timeout'), timeoutMs)
    const abort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/plain, text/yaml, application/yaml, */*' } })
      if (!response.ok) throw new SubscriptionFetchError('FETCH_FAILED', `订阅服务器返回 HTTP ${response.status}。`)
      const declaredLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', '订阅响应超过浏览器安全限制。')
      if (!response.body) {
        const text = await response.text()
        if (new TextEncoder().encode(text).byteLength > maxBytes) throw new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', '订阅响应超过浏览器安全限制。')
        return text
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let length = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > maxBytes) {
          await reader.cancel()
          throw new SubscriptionFetchError('SUBSCRIPTION_TOO_LARGE', '订阅响应超过浏览器安全限制。')
        }
        chunks.push(value)
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      return new TextDecoder().decode(bytes)
    } catch (error) {
      if (error instanceof SubscriptionFetchError) throw error
      if (controller.signal.aborted) throw new SubscriptionFetchError('FETCH_FAILED', '订阅请求超时或已取消。')
      throw new SubscriptionFetchError('CORS_OR_NETWORK_ERROR', '该订阅服务器不允许浏览器直接读取。你可以粘贴订阅内容或导入文件。')
    } finally {
      globalThis.clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abort)
    }
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
