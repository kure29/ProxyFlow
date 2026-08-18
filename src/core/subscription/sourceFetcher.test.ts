import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserSourceFetcher } from './sourceFetcher'

afterEach(() => vi.unstubAllGlobals())

describe('BrowserSourceFetcher', () => {
  it('rejects non-HTTP subscription URLs before calling fetch', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(new BrowserSourceFetcher().fetchText('file:///private/subscription.txt')).rejects.toMatchObject({ code: 'SUBSCRIPTION_INVALID_URL' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('checks HTTP status without exposing the URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub?token=secret')).rejects.toMatchObject({ code: 'SUBSCRIPTION_HTTP_ERROR', message: 'HTTP 403' })
  })

  it.each([500, 502])('normalizes HTTP %s without exposing a token-bearing URL', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('fictional upstream body', { status })))
    const promise = new BrowserSourceFetcher().fetchText('https://example.com/sub?token=fictional-private-token')
    await expect(promise).rejects.toMatchObject({ code: 'SUBSCRIPTION_HTTP_ERROR', message: `HTTP ${status}`, httpStatus: status })
    await expect(promise).rejects.not.toThrow('fictional-private-token')
  })

  it('distinguishes browser CORS/network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch https://example.com/?token=secret') }))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub?token=secret')).rejects.toMatchObject({ code: 'SUBSCRIPTION_CORS_BLOCKED' })
  })

  it('normalizes non-CORS network failures separately', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fictional socket failure') }))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub')).rejects.toMatchObject({ code: 'SUBSCRIPTION_NETWORK_ERROR' })
  })

  it('classifies an explicitly offline browser as a network failure', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub')).rejects.toMatchObject({ code: 'SUBSCRIPTION_NETWORK_ERROR' })
  })

  it('returns safe response metadata without retaining the request URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('proxies: []', { status: 200, headers: {
      'content-type': 'text/yaml', etag: '"fictional-etag"', 'last-modified': 'Sat, 15 Aug 2026 00:00:00 GMT',
    } })))
    const result = await new BrowserSourceFetcher().fetch('https://example.com/sub?token=fictional-private-token')
    expect(result).toEqual(expect.objectContaining({ status: 200, contentType: 'text/yaml', etag: '"fictional-etag"', lastModified: 'Sat, 15 Aug 2026 00:00:00 GMT' }))
    expect(result.contentLength).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('fictional-private-token')
  })

  it('records declared content length and actual response bytes without retaining the request URL', async () => {
    const body = 'proxies: []'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200, headers: {
      'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(body).byteLength),
    } })))
    const result = await new BrowserSourceFetcher().fetch('https://example.com/sub?token=fictional-private-token')
    expect(result).toEqual(expect.objectContaining({
      contentLength: new TextEncoder().encode(body).byteLength,
      responseBytes: new TextEncoder().encode(body).byteLength,
    }))
    expect(JSON.stringify(result)).not.toContain('fictional-private-token')
  })

  it('enforces streamed response size limits', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(128), { status: 200 })))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub', { maxBytes: 64 })).rejects.toMatchObject({ code: 'SUBSCRIPTION_TOO_LARGE' })
  })

  it('aborts requests after a bounded timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub', { timeoutMs: 5 })).rejects.toMatchObject({ code: 'SUBSCRIPTION_TIMEOUT' })
  })
})
