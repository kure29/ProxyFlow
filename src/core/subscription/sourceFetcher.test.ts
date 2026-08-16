import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserSourceFetcher } from './sourceFetcher'

afterEach(() => vi.unstubAllGlobals())

describe('BrowserSourceFetcher', () => {
  it('rejects non-HTTP subscription URLs before calling fetch', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(new BrowserSourceFetcher().fetchText('file:///private/subscription.txt')).rejects.toMatchObject({ code: 'INVALID_SUBSCRIPTION_URL' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('checks HTTP status without exposing the URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub?token=secret')).rejects.toMatchObject({ code: 'FETCH_FAILED', message: '订阅服务器返回 HTTP 403。' })
  })

  it('distinguishes browser CORS/network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch https://example.com/?token=secret') }))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub?token=secret')).rejects.toMatchObject({ code: 'CORS_OR_NETWORK_ERROR' })
  })

  it('enforces streamed response size limits', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(128), { status: 200 })))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub', { maxBytes: 64 })).rejects.toMatchObject({ code: 'SUBSCRIPTION_TOO_LARGE' })
  })

  it('aborts requests after a bounded timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    await expect(new BrowserSourceFetcher().fetchText('https://example.com/sub', { timeoutMs: 5 })).rejects.toMatchObject({ code: 'FETCH_FAILED' })
  })
})
