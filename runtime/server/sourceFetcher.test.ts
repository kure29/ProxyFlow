import { describe, expect, it, vi } from 'vitest'
import { SubscriptionFetchError } from '../../src/core/subscription/errors'
import { createValidatedLookup, ServerSourceFetcher } from './sourceFetcher'
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
