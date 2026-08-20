import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectSameOriginRuntime, ServerRuntimeProvider } from './serverRuntimeProvider'

describe('ServerRuntimeProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the Runtime Service fetch gateway and returns shared parser input', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ outcome: 'success', text: 'proxies: []' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const provider = new ServerRuntimeProvider({ baseUrl: 'http://runtime.example/', token: 'fictional-runtime-token' }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    await expect(provider.fetch('https://example.com/sub')).resolves.toEqual(expect.objectContaining({ text: 'proxies: []', status: 200 }))
    expect(fetch).toHaveBeenCalledWith('http://runtime.example/api/v1/subscriptions/fetch', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer fictional-runtime-token' }) }))
  })

  it('maps service errors without exposing request credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'SUBSCRIPTION_HTTP_ERROR', message: 'HTTP 403', httpStatus: 403 }), { status: 502 })))
    const provider = new ServerRuntimeProvider({ baseUrl: 'http://runtime.example', token: 'fictional-runtime-token' }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    await expect(provider.fetch('https://example.com/sub?token=fictional-secret')).rejects.toMatchObject({ code: 'SUBSCRIPTION_HTTP_ERROR', message: 'HTTP 403', httpStatus: 403 })
  })

  it.each([
    ['SUBSCRIPTION_NETWORK_ERROR', 'The Runtime Service could not reach the subscription server.'],
    ['SUBSCRIPTION_TIMEOUT', 'The subscription request timed out in the Runtime Service.'],
    ['SUBSCRIPTION_RUNTIME_POLICY_BLOCKED', 'The Runtime Service resolved the destination or redirect to a private or non-public address and blocked it.'],
    ['SUBSCRIPTION_TLS_ERROR', 'The Runtime Service could not establish a trusted TLS connection to the subscription server.'],
    ['SUBSCRIPTION_UNSUPPORTED_FORMAT', 'The subscription format is not supported.'],
    ['SUBSCRIPTION_PARSE_FAILED', 'The subscription could not be parsed.'],
    ['SUBSCRIPTION_NO_USABLE_NODES', 'The subscription contains no usable nodes; the previous snapshot was retained.'],
  ])('preserves the service error category %s with stable redacted copy', async (code, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: code, message: 'untrusted upstream detail with token=fictional-secret' }), { status: 502 })))
    const provider = new ServerRuntimeProvider({ baseUrl: 'http://runtime.example', token: 'fictional-runtime-token' }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    await expect(provider.fetch('https://example.com/sub?token=fictional-secret')).rejects.toMatchObject({ code, message })
  })

  it('classifies an unreachable or incompatible Runtime Service separately from source network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch a sensitive URL') }))
    const provider = new ServerRuntimeProvider({ baseUrl: 'http://runtime.example', token: 'fictional-runtime-token' }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    const error = await provider.fetch('https://example.com/sub?token=fictional-secret').catch((cause: unknown) => cause)
    expect(error).toMatchObject({ code: 'SUBSCRIPTION_RUNTIME_UNAVAILABLE', message: 'The Runtime Service is unavailable.' })
    expect(JSON.stringify(error)).not.toContain('fictional-secret')
  })

  it('maps unknown Runtime API failures to a stable unavailable category', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'RUNTIME_INTERNAL_ERROR', message: 'untrusted token=fictional-secret' }), { status: 500 })))
    const provider = new ServerRuntimeProvider({ baseUrl: 'http://runtime.example', token: 'fictional-runtime-token' }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    await expect(provider.fetch('https://example.com/sub')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_RUNTIME_UNAVAILABLE', message: 'The Runtime Service is unavailable or rejected the request.',
    })
  })

  it('confirms and discards pending empty results through explicit actions', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    const provider = new ServerRuntimeProvider({ baseUrl: 'http://runtime.example', token: 'fictional-runtime-token' }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    await provider.confirmEmpty()
    await provider.discardEmpty()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://runtime.example/api/v1/projects/project/sources/source/confirm-empty', expect.anything())
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://runtime.example/api/v1/projects/project/sources/source/discard-empty', expect.anything())
  })

  it('discovers a same-origin service without exposing a token to JavaScript', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, service: 'proxyflow-runtime' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    await expect(detectSameOriginRuntime(fetch as typeof globalThis.fetch)).resolves.toEqual({ baseUrl: '', token: '', sameOrigin: true })
    expect(fetch).toHaveBeenCalledWith('/api/v1/self-hosted', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('uses the HttpOnly same-origin session instead of an Authorization header', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ outcome: 'success', text: 'proxies: []' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const provider = new ServerRuntimeProvider({ baseUrl: '', token: '', sameOrigin: true }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    await provider.fetch('https://example.com/sub')
    expect(fetch).toHaveBeenCalledWith('/api/v1/subscriptions/fetch', expect.objectContaining({
      credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    }))
  })

  it('rebootstraps an expired same-origin session once and retries the gateway request', async () => {
    let gatewayAttempts = 0
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === '/api/v1/self-hosted') {
        return new Response(JSON.stringify({ ok: true, service: 'proxyflow-runtime' }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      gatewayAttempts += 1
      return gatewayAttempts === 1
        ? new Response(JSON.stringify({ error: 'RUNTIME_UNAUTHORIZED', message: 'session expired' }), { status: 401 })
        : new Response(JSON.stringify({ outcome: 'success', text: 'proxies: []' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetch)
    const provider = new ServerRuntimeProvider({ baseUrl: '', token: '', sameOrigin: true }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    await expect(provider.fetch('https://example.com/sub')).resolves.toEqual(expect.objectContaining({ text: 'proxies: []' }))
    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/v1/subscriptions/fetch', '/api/v1/self-hosted', '/api/v1/subscriptions/fetch',
    ])
  })

  it('does not loop when same-origin session rebootstrap fails', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => String(input) === '/api/v1/self-hosted'
      ? new Response(JSON.stringify({ ok: false }), { status: 503, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ error: 'RUNTIME_UNAUTHORIZED' }), { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    const provider = new ServerRuntimeProvider({ baseUrl: '', token: '', sameOrigin: true }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    await expect(provider.fetch('https://example.com/sub')).rejects.toMatchObject({ code: 'SUBSCRIPTION_RUNTIME_UNAVAILABLE' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
