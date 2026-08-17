import { describe, expect, it } from 'vitest'
import { normalizeCustomMatcher, validateMatcherIR } from './matcherValidation'

describe('routing matcher validation', () => {
  it('accepts exact, suffix, keyword and IDN-like domain values without mixing semantics', () => {
    expect(normalizeCustomMatcher('domain', 'api.example.com').ok).toBe(true)
    expect(normalizeCustomMatcher('domain-suffix', '例え.テスト').ok).toBe(true)
    expect(normalizeCustomMatcher('domain-keyword', 'localhost').ok).toBe(true)
    expect(normalizeCustomMatcher('domain', 'https://example.com/path').ok).toBe(false)
    expect(normalizeCustomMatcher('domain-suffix', '*.example.com').ok).toBe(false)
    expect(normalizeCustomMatcher('domain', 'example.com:443').ok).toBe(false)
  })

  it('enforces IPv4/IPv6 families and prefix ranges', () => {
    expect(normalizeCustomMatcher('ip-cidr', '192.0.2.0/24').ok).toBe(true)
    expect(normalizeCustomMatcher('ip-cidr', '2001:db8::/32').ok).toBe(false)
    expect(normalizeCustomMatcher('ip-cidr', '192.0.2.0/33').ok).toBe(false)
    expect(normalizeCustomMatcher('ip-cidr6', '2001:db8::/32').ok).toBe(true)
    expect(normalizeCustomMatcher('ip-cidr6', '192.0.2.0/24').ok).toBe(false)
    expect(normalizeCustomMatcher('ip-cidr6', '2001:db8::/129').ok).toBe(false)
  })

  it('supports one numeric port only and rejects ranges/lists', () => {
    expect(normalizeCustomMatcher('port', undefined, 443).ok).toBe(true)
    expect(normalizeCustomMatcher('port', undefined, 1).ok).toBe(true)
    expect(normalizeCustomMatcher('port', undefined, 65_535).ok).toBe(true)
    expect(normalizeCustomMatcher('port', undefined, 0).ok).toBe(false)
    expect(normalizeCustomMatcher('port', undefined, 70_000).ok).toBe(false)
    expect(normalizeCustomMatcher('port', undefined, '80-90').ok).toBe(false)
    expect(normalizeCustomMatcher('port', undefined, '80,443').ok).toBe(false)
  })

  it('normalizes ASN and Geo values with explicit bounds', () => {
    expect(normalizeCustomMatcher('asn', 'AS15169')).toEqual({ ok: true, matcher: { kind: 'asn', value: 15169 } })
    expect(normalizeCustomMatcher('asn', '0').ok).toBe(false)
    expect(normalizeCustomMatcher('asn', '4294967296').ok).toBe(false)
    expect(normalizeCustomMatcher('geo-ip', 'us')).toEqual({ ok: true, matcher: { kind: 'geo-ip', countryCode: 'US' } })
    expect(normalizeCustomMatcher('geo-ip', 'USA').ok).toBe(false)
    expect(normalizeCustomMatcher('geo-site', 'geolocation-!cn').ok).toBe(true)
  })

  it('validates matcher IR independently of the graph compiler', () => {
    expect(validateMatcherIR({ kind: 'domain', value: 'api.example.com' })).toBeUndefined()
    expect(validateMatcherIR({ kind: 'ip-cidr6', value: '192.0.2.0/24' })).toBe('ROUTE_CIDR_INVALID')
    expect(validateMatcherIR({ kind: 'port', port: 70_000 })).toBe('ROUTE_PORT_INVALID')
  })
})
