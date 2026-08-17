import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServerRuntimeProvider } from './serverRuntimeProvider'

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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'SUBSCRIPTION_HTTP_ERROR', message: 'HTTP 403' }), { status: 502 })))
    const provider = new ServerRuntimeProvider({ baseUrl: 'http://runtime.example', token: 'fictional-runtime-token' }, { projectId: 'project', sourceId: 'source', sourceName: 'Source' })
    await expect(provider.fetch('https://example.com/sub?token=fictional-secret')).rejects.toMatchObject({ code: 'SUBSCRIPTION_HTTP_ERROR', message: 'HTTP 403' })
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
})
