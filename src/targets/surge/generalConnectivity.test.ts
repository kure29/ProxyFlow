import { describe, expect, it } from 'vitest'
import type { TargetNativeSurgeGeneralConnectivityIR } from '../../core/targetNative'
import { compileSurgeGeneralConnectivity, composeSurgeGeneral } from './general'
import { isSurgeGeneralEntry } from './model'

const connectivity = (overrides: Partial<TargetNativeSurgeGeneralConnectivityIR> = {}): TargetNativeSurgeGeneralConnectivityIR => ({
  outputNodeId: 'output', target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://example.test/ping', ...overrides,
})

describe('Surge General Connectivity lowering', () => {
  it('emits only explicitly authored internet-test-url', () => {
    expect(compileSurgeGeneralConnectivity(connectivity())).toEqual([{ key: 'internet-test-url', value: 'https://example.test/ping' }])
    expect(compileSurgeGeneralConnectivity(undefined)).toEqual([])
    expect(compileSurgeGeneralConnectivity(connectivity({ internetTestUrl: 'https://other.example.test/check' }))).toEqual([{ key: 'internet-test-url', value: 'https://other.example.test/check' }])
  })

  it('composes independently with proxy-test-url and G1 without duplicate keys', () => {
    const issues: never[] = []
    const entries = composeSurgeGeneral([
      [{ key: 'proxy-test-url', value: 'https://proxy.example.test' }],
      compileSurgeGeneralConnectivity(connectivity()),
      [{ key: 'ipv6', value: true }],
    ], issues)
    expect(entries).toEqual([
      { key: 'proxy-test-url', value: 'https://proxy.example.test' },
      { key: 'internet-test-url', value: 'https://example.test/ping' },
      { key: 'ipv6', value: true },
    ])
    expect(entries.every((entry) => isSurgeGeneralEntry(entry))).toBe(true)
  })
})
