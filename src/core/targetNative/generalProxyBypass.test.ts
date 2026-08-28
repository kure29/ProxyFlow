import { describe, expect, it } from 'vitest'
import {
  classifySurgeProxyBypassIssue,
  isTargetNativeSurgeGeneralProxyBypassConfig,
  isTargetNativeSurgeGeneralProxyBypassIR,
  isSurgeProxyBypassHostListValue,
  parseSurgeProxyBypassDraft,
  selectTargetNativeSurgeGeneralProxyBypass,
  targetNativeSurgeGeneralProxyBypassConfigToIR,
} from './generalProxyBypass'

const base = { target: 'surge' as const, kind: 'general-proxy-bypass' as const }

describe('Surge G3-C target-native boundaries', () => {
  it('admits the exact positive v1.4 subset and canonicalizes CIDR only at authoring', () => {
    expect(parseSurgeProxyBypassDraft('apple.com\nstore.apple.com\nlocalhost\n*apple.com\n*.local\n192.168.2.11\n192.168.2.*\n192.168.2.123/24')).toEqual({
      ok: true,
      skipProxy: ['apple.com', 'store.apple.com', 'localhost', '*apple.com', '*.local', '192.168.2.11', '192.168.2.*', '192.168.2.0/24'],
    })
    expect(isTargetNativeSurgeGeneralProxyBypassConfig({ ...base, skipProxy: ['localhost'], excludeSimpleHostnames: false })).toBe(true)
    expect(isTargetNativeSurgeGeneralProxyBypassConfig({ ...base, excludeSimpleHostnames: false })).toBe(true)
  })

  it('rejects malformed and intentionally deferred Host List syntax', () => {
    for (const value of ['-*.example.com', 'app?.example.com', 'apple.com:8443', 'apple.com:0', '2001:db8::1', '2001:db8::/32', '<simple-hostname>', '*', '?', 'foo.*.example.com', '192.168.*.1', '192.168.2.1-20']) {
      expect(parseSurgeProxyBypassDraft(value)).toMatchObject({ ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' })
    }
    for (const value of ['apple..com', '.example.com', 'example-.com', '192.168.2.999', '01.02.03.04', 'comma,injection']) {
      expect(parseSurgeProxyBypassDraft(value)).toMatchObject({ ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' })
    }
  })

  it('preserves authored order and exact first-occurrence dedupe', () => {
    expect(parseSurgeProxyBypassDraft('Apple.com\napple.com\n192.168.2.123/24\n192.168.2.0/24')).toEqual({ ok: true, skipProxy: ['Apple.com', 'apple.com', '192.168.2.0/24'] })
  })

  it('keeps Config and IR provenance boundaries separate', () => {
    const config = { ...base, skipProxy: ['localhost'] }
    const ir = targetNativeSurgeGeneralProxyBypassConfigToIR('output-a', config)
    expect(ir).toEqual({ ...config, outputNodeId: 'output-a' })
    expect(isTargetNativeSurgeGeneralProxyBypassConfig(ir)).toBe(false)
    expect(isTargetNativeSurgeGeneralProxyBypassIR(ir)).toBe(true)
    expect(selectTargetNativeSurgeGeneralProxyBypass([ir, { ...ir, outputNodeId: 'output-b' }], 'output-a')).toEqual(ir)
    expect(selectTargetNativeSurgeGeneralProxyBypass([ir, ir], 'output-a')).toBeUndefined()
    expect(isTargetNativeSurgeGeneralProxyBypassConfig({ ...config, outputNodeId: 'spoofed' })).toBe(false)
    expect(isTargetNativeSurgeGeneralProxyBypassConfig({ ...config, nodeId: 'spoofed' })).toBe(false)
  })

  it('guards typed Host List values independently and classifies only recognizable family intent', () => {
    expect(isSurgeProxyBypassHostListValue({ kind: 'host-list', items: ['localhost', '192.168.2.0/24'] })).toBe(true)
    expect(isSurgeProxyBypassHostListValue({ kind: 'host-list', items: ['localhost', 'localhost'] })).toBe(false)
    expect(isSurgeProxyBypassHostListValue({ kind: 'list', items: ['localhost'] })).toBe(false)
    expect(classifySurgeProxyBypassIssue(null)).toBeUndefined()
    expect(classifySurgeProxyBypassIssue('bad')).toBeUndefined()
    expect(classifySurgeProxyBypassIssue({ ...base, skipProxy: ['bad value'] })).toBe('SURGE_PROXY_BYPASS_HOST_INVALID')
    expect(classifySurgeProxyBypassIssue({ ...base, skipProxy: ['<simple-hostname>'] })).toBe('SURGE_PROXY_BYPASS_HOST_UNSUPPORTED')
  })

  it('classifies hostile accessor values without executing accessors', () => {
    const value: Record<string, unknown> = { ...base }
    Object.defineProperty(value, 'skipProxy', {
      enumerable: true,
      get() { throw new Error('must not execute') },
    })
    expect(() => classifySurgeProxyBypassIssue(value)).not.toThrow()
    expect(classifySurgeProxyBypassIssue(value)).toBeUndefined()
  })
})
