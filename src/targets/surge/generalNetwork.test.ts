import { describe, expect, it } from 'vitest'
import type { TargetNativeSurgeGeneralNetworkIR } from '../../core/targetNative'
import { compileSurgeGeneralNetwork, composeSurgeGeneral } from './general'
import { isSurgeGeneralEntry } from './model'
import type { CompatibilityIssue } from '../../types/project'

const ir = (overrides: Partial<TargetNativeSurgeGeneralNetworkIR> = {}): TargetNativeSurgeGeneralNetworkIR => {
  const value: TargetNativeSurgeGeneralNetworkIR = { outputNodeId: 'output', target: 'surge', kind: 'general-network', ipv6: true, ipv6Vif: 'auto', icmpForwarding: false }
  for (const key of ['ipv6', 'ipv6Vif', 'icmpForwarding'] as const) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      if (overrides[key] === undefined) delete value[key]
      else value[key] = overrides[key] as never
    }
  }
  return value
}

describe('Surge General Network lowering', () => {
  it('emits only explicit values in deterministic ipv6/VIF/ICMP order', () => {
    expect(compileSurgeGeneralNetwork(ir())).toEqual([
      { key: 'ipv6', value: true },
      { key: 'ipv6-vif', value: 'auto' },
      { key: 'icmp-forwarding', value: false },
    ])
    expect(compileSurgeGeneralNetwork(ir({ ipv6: undefined, ipv6Vif: 'always', icmpForwarding: undefined }))).toEqual([
      { key: 'ipv6-vif', value: 'always' },
    ])
    expect(compileSurgeGeneralNetwork(ir({ ipv6: false, ipv6Vif: 'disabled' }))).toEqual([
      { key: 'ipv6', value: false },
      { key: 'ipv6-vif', value: 'disabled' },
      { key: 'icmp-forwarding', value: false },
    ])
  })

  it('composes G1 with existing groups without relying on object enumeration', () => {
    const issues: CompatibilityIssue[] = []
    expect(composeSurgeGeneral([
      [{ key: 'proxy-test-url', value: 'https://example.com/ping' }],
      compileSurgeGeneralNetwork(ir({ ipv6: false, ipv6Vif: 'always', icmpForwarding: true })),
      [{ key: 'dns-server', value: { kind: 'list', items: ['1.1.1.1'] } }],
    ], issues)).toEqual([
      { key: 'proxy-test-url', value: 'https://example.com/ping' },
      { key: 'ipv6', value: false },
      { key: 'ipv6-vif', value: 'always' },
      { key: 'icmp-forwarding', value: true },
      { key: 'dns-server', value: { kind: 'list', items: ['1.1.1.1'] } },
    ])
    expect(issues).toEqual([])
  })

  it('keeps the G0 key/value boundary exhaustive for all G1 keys', () => {
    expect(isSurgeGeneralEntry({ key: 'ipv6', value: true })).toBe(true)
    expect(isSurgeGeneralEntry({ key: 'ipv6', value: 'true' })).toBe(false)
    expect(isSurgeGeneralEntry({ key: 'icmp-forwarding', value: false })).toBe(true)
    expect(isSurgeGeneralEntry({ key: 'icmp-forwarding', value: 0 })).toBe(false)
    expect(isSurgeGeneralEntry({ key: 'ipv6-vif', value: 'disabled' })).toBe(true)
    expect(isSurgeGeneralEntry({ key: 'ipv6-vif', value: 'off' })).toBe(false)
    expect(isSurgeGeneralEntry({ key: 'ipv6-vif', value: 'AUTO' })).toBe(false)
    expect(isSurgeGeneralEntry({ key: 'always-real-ip', value: { kind: 'list', items: ['example.com', '*.example.com'] } })).toBe(true)
    expect(isSurgeGeneralEntry({ key: 'always-real-ip', value: { kind: 'list', items: ['example.com\n[Proxy]'] } })).toBe(false)
  })
})
