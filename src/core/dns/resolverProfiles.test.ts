import { describe, expect, it } from 'vitest'
import {
  countEnabledDnsResolvers, createCustomDnsResolver, createDnsResolver, DNS_RESOLVER_PRESETS,
  isDnsResolverConfig, normalizeDnsResolvers, resolveDnsResolverRegion,
} from './resolverProfiles'

describe('DNS resolver profiles', () => {
  it('provides the required presets with safe protocol metadata', () => {
    expect(DNS_RESOLVER_PRESETS.map(({ id }) => id)).toEqual([
      'system', 'cloudflare', 'google', 'quad9', 'alidns', 'dnspod', 'adguard',
    ])
    expect(DNS_RESOLVER_PRESETS.filter(({ kind }) => kind === 'doh').every(({ address }) => address?.startsWith('https://'))).toBe(true)
  })

  it('creates stable unique resolver ids without exposing storage semantics', () => {
    const first = createDnsResolver('cloudflare')!
    const second = createDnsResolver('cloudflare', 'default', [first])!
    expect(first).toEqual(expect.objectContaining({ id: 'cloudflare-default', role: 'default', enabled: true, region: 'global' }))
    expect(second.id).toBe('cloudflare-default-2')
    expect(resolveDnsResolverRegion(first)).toBe('global')
  })

  it('adapts a legacy single resolver without requiring schema migration', () => {
    expect(normalizeDnsResolvers(undefined, 'https://dns.example.com/dns-query')).toEqual([
      expect.objectContaining({ id: 'legacy-default', kind: 'doh', role: 'default', enabled: true }),
    ])
    expect(normalizeDnsResolvers([], 'https://ignored.example.com/dns-query')).toEqual([])
    expect(countEnabledDnsResolvers(undefined, 'https://dns.example.com/dns-query')).toBe(1)
    expect(countEnabledDnsResolvers([], 'https://dns.example.com/dns-query')).toBe(0)
  })

  it('creates a custom resolver draft with a unique stable id', () => {
    const first = createCustomDnsResolver()
    const second = createCustomDnsResolver([first])
    expect(first).toEqual(expect.objectContaining({ id: 'custom-default', kind: 'doh', role: 'default', address: '' }))
    expect(second.id).toBe('custom-default-2')
  })

  it('rejects malformed imported resolver shapes without throwing', () => {
    expect(isDnsResolverConfig({ id: 'bad', name: 'Bad', kind: 'doh', role: 'default', address: 53, enabled: true })).toBe(false)
    expect(isDnsResolverConfig({ id: 'bad-region', name: 'Bad', kind: 'doh', role: 'default', enabled: true, region: 'private' })).toBe(false)
    expect(normalizeDnsResolvers({ invalid: true } as never, 'https://dns.example.com/dns-query')).toEqual([])
    expect(normalizeDnsResolvers([{ id: 'bad' }] as never)).toEqual([])
  })
})
