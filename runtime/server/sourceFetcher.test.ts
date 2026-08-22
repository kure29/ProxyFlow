import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib'
import { SubscriptionFetchError } from '../../src/core/subscription/errors'
import { parseSubscription } from '../../src/core/subscription/parseSubscription'
import { createValidatedLookup, readRuntimeResponseBody, ServerSourceFetcher } from './sourceFetcher'
import { RuntimeSecurityError } from './ssrf'

describe('ServerSourceFetcher security controls', () => {
  it('revalidates redirects before following them', async () => {
    const calls: string[] = []
    const fetcher = new ServerSourceFetcher({
      resolveHost: async () => ['8.8.8.8'],
      request: async (url) => {
        calls.push(url.toString())
        return calls.length === 1
          ? { status: 302, headers: { location: 'http://127.0.0.1/private' }, text: '', bytes: 0 }
          : { status: 200, headers: {}, text: 'proxies: []', bytes: 13 }
      },
    })
    await expect(fetcher.fetch('https://example.com/start')).rejects.toMatchObject({ code: 'SUBSCRIPTION_RUNTIME_POLICY_BLOCKED' })
    expect(calls).toEqual(['https://example.com/start'])
  })

  it.each([
    'not a URL',
    'file:///private/subscription.txt',
    'https://user:fictional-password@example.com/sub',
  ])('keeps malformed or disallowed URL syntax in the invalid URL category: %s', async (url) => {
    const fetcher = new ServerSourceFetcher({ resolveHost: async () => ['8.8.8.8'] })
    const error = await fetcher.fetch(url).catch((cause: unknown) => cause)
    expect(error).toMatchObject({ code: 'SUBSCRIPTION_INVALID_URL' })
    expect(JSON.stringify(error)).not.toContain('fictional-password')
  })

  it('maps an explicitly blocked redirect to the Runtime policy category', async () => {
    const fetcher = new ServerSourceFetcher({
      resolveHost: async () => ['8.8.8.8'],
      request: async () => { throw new RuntimeSecurityError('RUNTIME_REDIRECT_BLOCKED') },
    })
    await expect(fetcher.fetch('https://example.com/start')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_RUNTIME_POLICY_BLOCKED',
      message: 'The Runtime Service resolved the destination or redirect to a private or non-public address and blocked it.',
    })
  })

  it('enforces response bytes even when a transport returns a declared body', async () => {
    const fetcher = new ServerSourceFetcher({
      resolveHost: async () => ['8.8.8.8'],
      maxBytes: 8,
      request: async () => ({ status: 200, headers: {}, text: 'proxies: []', bytes: 12 }),
    })
    await expect(fetcher.fetch('https://example.com/large')).rejects.toMatchObject({ code: 'SUBSCRIPTION_TOO_LARGE' })
  })

  it('propagates timeout and superseded abort outcomes without exposing URLs', async () => {
    const fetcher = new ServerSourceFetcher({
      resolveHost: async () => ['8.8.8.8'],
      request: async (_url, options) => {
        if (options.signal?.aborted) throw new Error('aborted')
        throw new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Subscription request timed out.')
      },
    })
    await expect(fetcher.fetch('https://example.com/sub?token=fictional-secret')).rejects.toMatchObject({ code: 'SUBSCRIPTION_TIMEOUT', message: 'Subscription request timed out.' })
  })

  it('bounds DNS resolution with the same request deadline', async () => {
    const request = vi.fn()
    const fetcher = new ServerSourceFetcher({
      timeoutMs: 5,
      resolveHost: () => new Promise<string[]>(() => undefined),
      request,
    })

    await expect(fetcher.fetch('https://example.com/sub?token=fictional-secret')).rejects.toMatchObject({ code: 'SUBSCRIPTION_TIMEOUT' })
    expect(request).not.toHaveBeenCalled()
  })

  it('returns every validated address when Node 22 requests lookup all:true', async () => {
    const lookup = createValidatedLookup(async () => ['2001:4860:4860::8888', '8.8.8.8'])
    const addresses = await new Promise<unknown>((resolve, reject) => {
      lookup('example.com', { all: true }, (error, result) => error ? reject(error) : resolve(result))
    })
    expect(addresses).toEqual([
      { address: '2001:4860:4860::8888', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ])
  })

  it('selects the requested address family for a single-address lookup', async () => {
    const lookup = createValidatedLookup(async () => ['2001:4860:4860::8888', '8.8.8.8'])
    const selected = await new Promise<{ address: unknown; family: number | undefined }>((resolve, reject) => {
      lookup('example.com', { family: 4 }, (error, address, family) => error ? reject(error) : resolve({ address, family }))
    })
    expect(selected).toEqual({ address: '8.8.8.8', family: 4 })
  })

  it('rejects the complete DNS answer when any address is non-public', async () => {
    const lookup = createValidatedLookup(async () => ['8.8.8.8', '127.0.0.1'])
    const error = await new Promise<unknown>((resolve) => {
      lookup('example.com', { all: true }, (cause) => resolve(cause))
    })
    expect(error).toMatchObject({ code: 'RUNTIME_PRIVATE_ADDRESS' })
  })

  it('continues to block the RFC 2544 benchmark range used by fake-IP DNS', async () => {
    const fetcher = new ServerSourceFetcher({ resolveHost: async () => ['198.18.1.10'] })
    await expect(fetcher.fetch('https://example.com/sub')).rejects.toMatchObject({ code: 'SUBSCRIPTION_RUNTIME_POLICY_BLOCKED' })
  })

  it.each([
    ['CERT_HAS_EXPIRED', 'SUBSCRIPTION_TLS_ERROR'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'SUBSCRIPTION_TLS_ERROR'],
    ['EAI_AGAIN', 'SUBSCRIPTION_NETWORK_ERROR'],
    ['ENETUNREACH', 'SUBSCRIPTION_NETWORK_ERROR'],
  ])('classifies server transport error %s without exposing the URL', async (transportCode, expectedCode) => {
    const fetcher = new ServerSourceFetcher({
      resolveHost: async () => ['8.8.8.8'],
      request: async () => { throw Object.assign(new Error(`fictional ${transportCode}`), { code: transportCode }) },
    })
    const error = await fetcher.fetch('https://example.com/sub?token=fictional-secret').catch((cause: unknown) => cause)
    expect(error).toMatchObject({ code: expectedCode })
    expect(JSON.stringify(error)).not.toContain('fictional-secret')
  })
})

describe('ServerSourceFetcher request profiles', () => {
  const publicHost = async () => ['8.8.8.8']
  const response = (status = 200) => ({ status, headers: {}, text: 'proxies: []', bytes: 11 })

  it('uses Clash.Meta first in Auto and does not fall back after a successful response', async () => {
    const userAgents: string[] = []
    const fetcher = new ServerSourceFetcher({ resolveHost: publicHost, request: async (_url, options) => {
      userAgents.push(options.userAgent)
      return response()
    } })
    await expect(fetcher.fetch('https://example.com/sub', { requestProfile: 'auto' })).resolves.toEqual(expect.objectContaining({ status: 200 }))
    expect(userAgents).toEqual(['Clash.Meta'])
  })

  it('returns an unfamiliar 2xx body to the parser without performing content-based fallback', async () => {
    const userAgents: string[] = []
    const fetcher = new ServerSourceFetcher({ resolveHost: publicHost, request: async (_url, options) => {
      userAgents.push(options.userAgent)
      return { status: 200, headers: { 'content-type': 'text/html' }, text: '<html>fictional provider page</html>', bytes: 37 }
    } })
    await expect(fetcher.fetch('https://example.com/sub')).resolves.toEqual(expect.objectContaining({
      contentType: 'text/html', text: '<html>fictional provider page</html>',
    }))
    expect(userAgents).toEqual(['Clash.Meta'])
  })

  it('falls back from Clash.Meta to mihomo only after an explicit negotiation rejection', async () => {
    const userAgents: string[] = []
    const fetcher = new ServerSourceFetcher({ resolveHost: publicHost, request: async (_url, options) => {
      userAgents.push(options.userAgent)
      return response(userAgents.length === 1 ? 403 : 200)
    } })
    await fetcher.fetch('https://example.com/sub')
    expect(userAgents).toEqual(['Clash.Meta', 'mihomo'])
  })

  it('can reach sing-box after 403 and 406 negotiation rejections', async () => {
    const userAgents: string[] = []
    const fetcher = new ServerSourceFetcher({ resolveHost: publicHost, request: async (_url, options) => {
      userAgents.push(options.userAgent)
      return response(userAgents.length === 1 ? 403 : userAgents.length === 2 ? 406 : 200)
    } })
    await fetcher.fetch('https://example.com/sub')
    expect(userAgents).toEqual(['Clash.Meta', 'mihomo', 'sing-box'])
  })

  it('shares one overall deadline across every Auto fallback attempt', async () => {
    let now = 1_000
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const timeouts: number[] = []
    const fetcher = new ServerSourceFetcher({ resolveHost: publicHost, request: async (_url, options) => {
      timeouts.push(options.timeoutMs)
      now += 25
      return response(timeouts.length < 4 ? 403 : 200)
    } })
    try {
      await fetcher.fetch('https://example.com/sub', { timeoutMs: 100 })
      expect(timeouts).toEqual([100, 75, 50, 25])
    } finally {
      dateNow.mockRestore()
    }
  })

  it.each([
    [Object.assign(new Error('certificate rejected'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), 'SUBSCRIPTION_TLS_ERROR'],
    [new SubscriptionFetchError('SUBSCRIPTION_TIMEOUT', 'Subscription request timed out.'), 'SUBSCRIPTION_TIMEOUT'],
  ])('does not switch User-Agent after transport failure %s', async (failure, expectedCode) => {
    const request = vi.fn(async () => { throw failure })
    const fetcher = new ServerSourceFetcher({ resolveHost: publicHost, request })
    await expect(fetcher.fetch('https://example.com/sub')).rejects.toMatchObject({ code: expectedCode })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not switch User-Agent after a non-negotiation HTTP status', async () => {
    const request = vi.fn(async () => response(404))
    const fetcher = new ServerSourceFetcher({ resolveHost: publicHost, request })
    await expect(fetcher.fetch('https://example.com/sub')).rejects.toMatchObject({ code: 'SUBSCRIPTION_HTTP_ERROR', httpStatus: 404 })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['mihomo', 'Clash.Meta'],
    ['sing-box', 'sing-box'],
    ['generic', 'ProxyFlow-Runtime/1.0'],
  ] as const)('uses exactly one whitelisted User-Agent for the %s profile', async (requestProfile, expectedUserAgent) => {
    const userAgents: string[] = []
    const fetcher = new ServerSourceFetcher({ resolveHost: publicHost, request: async (_url, options) => {
      userAgents.push(options.userAgent)
      return response(403)
    } })
    await expect(fetcher.fetch('https://example.com/sub', { requestProfile })).rejects.toMatchObject({ httpStatus: 403 })
    expect(userAgents).toEqual([expectedUserAgent])
  })

  it('rejects an untrusted profile value before it can become a header', async () => {
    const request = vi.fn(async () => response())
    const fetcher = new ServerSourceFetcher({ resolveHost: publicHost, request })
    await expect(fetcher.fetch('https://example.com/sub', {
      requestProfile: 'Clash.Meta\r\nX-Fictional: injected' as never,
    })).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUEST_PROFILE_INVALID' })
    expect(request).not.toHaveBeenCalled()
  })
})

describe('Runtime response decompression', () => {
  const text = 'proxies:\n  - { name: Ready, type: socks5, server: proxy.example.com, port: 1080 }\n'

  it.each([
    ['absent', undefined, Buffer.from(text)],
    ['identity', 'identity', Buffer.from(text)],
    ['gzip', 'gzip', gzipSync(text)],
    ['deflate', 'deflate', deflateSync(text)],
    ['br', 'br', brotliCompressSync(text)],
  ] as const)('decodes a bounded %s response', async (_label, contentEncoding, body) => {
    await expect(readRuntimeResponseBody(Readable.from([body]), contentEncoding, 4096)).resolves.toEqual(expect.objectContaining({
      text,
      bytes: Buffer.byteLength(text),
      wireBytes: body.byteLength,
    }))
  })

  it.each([
    ['gzip', gzipSync(text).subarray(0, 8)],
    ['br', brotliCompressSync(text).subarray(0, 4)],
  ])('rejects a corrupt %s response with a stable transport error', async (contentEncoding, body) => {
    await expect(readRuntimeResponseBody(Readable.from([body]), contentEncoding, 4096)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_CONTENT_ENCODING_ERROR',
    })
  })

  it('rejects an unknown Content-Encoding instead of parsing compressed bytes as UTF-8', async () => {
    await expect(readRuntimeResponseBody(Readable.from([Buffer.from(text)]), 'zstd', 4096)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_CONTENT_ENCODING_ERROR',
    })
  })

  it('bounds both wire bytes and decompressed bytes', async () => {
    await expect(readRuntimeResponseBody(Readable.from([Buffer.alloc(65)]), 'identity', 64)).rejects.toMatchObject({ code: 'SUBSCRIPTION_TOO_LARGE' })
    const compressed = gzipSync('x'.repeat(1024))
    expect(compressed.byteLength).toBeLessThan(64)
    await expect(readRuntimeResponseBody(Readable.from([compressed]), 'gzip', 64)).rejects.toMatchObject({ code: 'SUBSCRIPTION_TOO_LARGE' })
  })

  it('feeds a normal gzip subscription to the existing parser unchanged', async () => {
    const decoded = await readRuntimeResponseBody(Readable.from([gzipSync(text)]), 'gzip', 4096)
    const result = parseSubscription(decoded.text, { sourceId: 'compressed-fixture' })
    expect([result.detectedCount, result.readyCount]).toEqual([1, 1])
  })

  it('preserves AbortSignal cancellation while decoding', async () => {
    const controller = new AbortController()
    controller.abort('superseded')
    await expect(readRuntimeResponseBody(Readable.from([gzipSync(text)]), 'gzip', 4096, controller.signal)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REFRESH_SUPERSEDED',
    })
  })
})
