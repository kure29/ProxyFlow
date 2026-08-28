import { describe, expect, it } from 'vitest'
import {
  deduplicateAlwaysRealIpPatterns,
  isSupportedSurgeAlwaysRealIpPattern,
  isTargetNativeSurgeDnsBehaviorConfig,
  isTargetNativeSurgeDnsBehaviorIR,
  parseSurgeAlwaysRealIpDraft,
  targetNativeSurgeDnsBehaviorConfigToIR,
  type TargetNativeSurgeDnsBehaviorConfig,
} from './dnsBehavior'

const config = (overrides: Record<string, unknown> = {}) => ({
  target: 'surge' as const, kind: 'dns-behavior' as const, alwaysRealIp: ['example.com'], ...overrides,
}) as TargetNativeSurgeDnsBehaviorConfig

describe('Surge always-real-ip target-native boundary', () => {
  it('separates Config from compiler-owned IR', () => {
    expect(isTargetNativeSurgeDnsBehaviorConfig(config())).toBe(true)
    expect(isTargetNativeSurgeDnsBehaviorConfig(config({ dnsNodeId: 'dns' }))).toBe(false)
    expect(isTargetNativeSurgeDnsBehaviorConfig(config({ alwaysRealIp: ['example.com', 'example.com'] }))).toBe(false)
    expect(isTargetNativeSurgeDnsBehaviorIR({ ...config(), dnsNodeId: 'dns' })).toBe(true)
    expect(isTargetNativeSurgeDnsBehaviorIR({ ...config({ alwaysRealIp: ['example.com', 'example.com'] }), dnsNodeId: 'dns' })).toBe(false)
    expect(isTargetNativeSurgeDnsBehaviorIR(config())).toBe(false)
    expect(targetNativeSurgeDnsBehaviorConfigToIR('dns', config())).toEqual({
      target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['example.com'], dnsNodeId: 'dns',
    })
  })

  it('rejects no-op, unknown, sparse, and hostile records', () => {
    expect(isTargetNativeSurgeDnsBehaviorConfig(config({ alwaysRealIp: [] }))).toBe(false)
    expect(isTargetNativeSurgeDnsBehaviorConfig({ target: 'surge', kind: 'dns-behavior' })).toBe(false)
    expect(isTargetNativeSurgeDnsBehaviorConfig(config({ extra: true }))).toBe(false)
    const sparse: string[] = []
    sparse.length = 1
    expect(isTargetNativeSurgeDnsBehaviorConfig(config({ alwaysRealIp: sparse }))).toBe(false)
    const proxy = new Proxy(config(), { get() { throw new Error('hostile') } })
    expect(isTargetNativeSurgeDnsBehaviorConfig(proxy)).toBe(false)
  })

  it('accepts the documented conservative wildcard subset and rejects unsafe grammar', () => {
    for (const value of ['example.com', '*.example.com', 'xbox.*.microsoft.com', 'foo?.example.com', '*', '?']) {
      expect(isSupportedSurgeAlwaysRealIpPattern(value), value).toBe(true)
    }
    for (const value of ['', ' example.com', 'example.com ', 'example', 'a..example.com', '-bad.example.com', 'bad-.example.com', 'foo bar.example.com', 'foo,example.com', 'https://example.com', '-.example.com', 'example.com/path', '192.0.2.1', '192.0.2.0/24', '192.0.2.*', '192.168.*.?', '192.?.2.1', '*.*.*.*']) {
      expect(isSupportedSurgeAlwaysRealIpPattern(value), value).toBe(false)
    }
  })

  it('trims drafts and exact-deduplicates in first-seen order', () => {
    expect(parseSurgeAlwaysRealIpDraft(' example.com\n\n*.example.com\nexample.com ')).toEqual({
      ok: true, patterns: ['example.com', '*.example.com'],
    })
    expect(parseSurgeAlwaysRealIpDraft('example.com\nnot a host')).toEqual({ ok: false, invalidPattern: 'not a host' })
    expect(deduplicateAlwaysRealIpPatterns(['example.com', '*.example.com', 'example.com'])).toEqual(['example.com', '*.example.com'])
  })
})
