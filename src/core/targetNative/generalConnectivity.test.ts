import { describe, expect, it } from 'vitest'
import {
  isTargetNativeSurgeGeneralConnectivityConfig,
  isTargetNativeSurgeGeneralConnectivityIR,
  selectTargetNativeSurgeGeneralConnectivity,
  targetNativeSurgeGeneralConnectivityConfigToIR,
} from './generalConnectivity'

const base = { target: 'surge' as const, kind: 'general-connectivity' as const }

describe('target-native Surge General Connectivity boundaries', () => {
  it('accepts safe HTTP(S) URLs and rejects unsafe or unsupported values', () => {
    for (const url of ['http://example.test/ping', 'https://example.test/ping']) {
      expect(isTargetNativeSurgeGeneralConnectivityConfig({ ...base, internetTestUrl: url })).toBe(true)
    }
    for (const url of [
      '', 'ftp://example.test', 'file:///tmp/test', 'data:text/plain,x',
      'https://user:pass@example.test', 'https://example.test/\r', 'https://example.test/\n',
      `https://example.test/${String.fromCharCode(0)}`, `https://example.test/${String.fromCharCode(0x7f)}`,
      `https://example.test/${String.fromCharCode(0x80)}`, `https://example.test/${String.fromCharCode(0x2028)}`,
      `https://example.test/${String.fromCharCode(0x2029)}`,
    ]) expect(isTargetNativeSurgeGeneralConnectivityConfig({ ...base, internetTestUrl: url })).toBe(false)
  })

  it('keeps Config and IR shapes separate and rejects second-owner fields', () => {
    const config = { ...base, internetTestUrl: 'https://example.test/ping' }
    const ir = targetNativeSurgeGeneralConnectivityConfigToIR('output-a', config)
    expect(isTargetNativeSurgeGeneralConnectivityConfig(ir)).toBe(false)
    expect(isTargetNativeSurgeGeneralConnectivityIR(config)).toBe(false)
    expect(isTargetNativeSurgeGeneralConnectivityIR(ir)).toBe(true)
    expect(isTargetNativeSurgeGeneralConnectivityConfig({ ...config, proxyTestUrl: config.internetTestUrl })).toBe(false)
    expect(isTargetNativeSurgeGeneralConnectivityConfig({ ...config, testTimeout: 5 })).toBe(false)
    const symbol = Symbol('future')
    expect(isTargetNativeSurgeGeneralConnectivityConfig({ ...config, [symbol]: true })).toBe(false)
    expect(isTargetNativeSurgeGeneralConnectivityConfig({ ...base })).toBe(false)
    expect(isTargetNativeSurgeGeneralConnectivityIR({ ...ir, outputNodeId: '' })).toBe(false)
  })

  it('rejects inherited/custom-prototype values and malformed hostile accessors', () => {
    const inherited = Object.create({ internetTestUrl: 'https://example.test' }) as Record<string, unknown>
    inherited.target = 'surge'; inherited.kind = 'general-connectivity'
    expect(isTargetNativeSurgeGeneralConnectivityConfig(inherited)).toBe(false)
    const custom = Object.create({}) as Record<string, unknown>
    Object.assign(custom, { ...base, internetTestUrl: 'https://example.test' })
    expect(isTargetNativeSurgeGeneralConnectivityConfig(custom)).toBe(false)
    const hostile = new Proxy({ ...base, internetTestUrl: 'https://example.test' }, { get() { throw new Error('hostile') } })
    expect(isTargetNativeSurgeGeneralConnectivityConfig(hostile)).toBe(false)
  })

  it('selects exactly one owner and rejects malformed siblings or ambiguity', () => {
    const first = targetNativeSurgeGeneralConnectivityConfigToIR('output-a', { ...base, internetTestUrl: 'https://a.example.test' })
    const second = targetNativeSurgeGeneralConnectivityConfigToIR('output-b', { ...base, internetTestUrl: 'https://b.example.test' })
    expect(selectTargetNativeSurgeGeneralConnectivity([first, second], 'output-a')).toEqual(first)
    expect(selectTargetNativeSurgeGeneralConnectivity([first, first], 'output-a')).toBeUndefined()
    expect(selectTargetNativeSurgeGeneralConnectivity([first, { ...second, proxyTestUrl: 'https://bad.example.test' } as never], 'output-a')).toBeUndefined()
  })
})
