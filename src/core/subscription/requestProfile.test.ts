import { describe, expect, it } from 'vitest'
import { sourceConfigFingerprint } from './hash'
import {
  isSubscriptionRequestProfile, normalizeSubscriptionRequestProfile, subscriptionRequestUserAgents,
} from './requestProfile'

describe('subscription request profiles', () => {
  it('maps only the four compatibility profiles to fixed User-Agent allowlists', () => {
    expect(subscriptionRequestUserAgents('auto')).toEqual(['Clash.Meta', 'mihomo', 'sing-box', 'ProxyFlow-Runtime/1.0'])
    expect(subscriptionRequestUserAgents('mihomo')).toEqual(['Clash.Meta'])
    expect(subscriptionRequestUserAgents('sing-box')).toEqual(['sing-box'])
    expect(subscriptionRequestUserAgents('generic')).toEqual(['ProxyFlow-Runtime/1.0'])
  })

  it('defaults missing and untrusted project values to Auto without accepting arbitrary strings', () => {
    expect(normalizeSubscriptionRequestProfile(undefined)).toBe('auto')
    expect(normalizeSubscriptionRequestProfile('custom-user-agent')).toBe('auto')
    expect(isSubscriptionRequestProfile('custom-user-agent')).toBe(false)
    expect(isSubscriptionRequestProfile('mihomo')).toBe(true)
  })

  it('includes the request profile in URL source identity while preserving the missing-field Auto default', async () => {
    const url = 'https://example.com/sub'
    await expect(sourceConfigFingerprint('url', url)).resolves.toBe(await sourceConfigFingerprint('url', url, 'auto'))
    await expect(sourceConfigFingerprint('url', url, 'generic')).resolves.not.toBe(await sourceConfigFingerprint('url', url, 'auto'))
  })
})
