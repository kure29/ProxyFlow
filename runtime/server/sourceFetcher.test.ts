import { describe, expect, it } from 'vitest'
import { SubscriptionFetchError } from '../../src/core/subscription/errors'
import { ServerSourceFetcher } from './sourceFetcher'

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
    await expect(fetcher.fetch('https://example.com/start')).rejects.toMatchObject({ code: 'SUBSCRIPTION_INVALID_URL' })
    expect(calls).toEqual(['https://example.com/start'])
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
})
