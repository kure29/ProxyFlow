import { describe, expect, it } from 'vitest'
import {
  isTargetNativeSurgeGeneralNetworkConfig,
  isTargetNativeSurgeGeneralNetworkIR,
  selectTargetNativeSurgeGeneralNetwork,
  targetNativeSurgeGeneralNetworkConfigToIR,
} from './generalNetwork'

const base = {
  target: 'surge' as const,
  kind: 'general-network' as const,
}

describe('target-native Surge General Network runtime boundaries', () => {
  it('accepts every explicit G1 scalar and enum value, including false/default values', () => {
    const values = [
      { ...base, ipv6: true },
      { ...base, ipv6: false },
      { ...base, ipv6Vif: 'disabled' as const },
      { ...base, ipv6Vif: 'auto' as const },
      { ...base, ipv6Vif: 'always' as const },
      { ...base, icmpForwarding: true },
      { ...base, icmpForwarding: false },
      { ...base, ipv6: false, ipv6Vif: 'always' as const, icmpForwarding: true },
    ]
    for (const value of values) expect(isTargetNativeSurgeGeneralNetworkConfig(value)).toBe(true)
    expect(isTargetNativeSurgeGeneralNetworkConfig({ ...base })).toBe(false)
  })

  it('keeps Config and IR exact shapes separate', () => {
    const config = { ...base, ipv6: false }
    const ir = targetNativeSurgeGeneralNetworkConfigToIR('output-a', config)
    expect(ir).toEqual({ ...config, outputNodeId: 'output-a' })
    expect(isTargetNativeSurgeGeneralNetworkConfig(ir)).toBe(false)
    expect(isTargetNativeSurgeGeneralNetworkIR(ir)).toBe(true)
    expect(isTargetNativeSurgeGeneralNetworkIR(config)).toBe(false)
    expect(isTargetNativeSurgeGeneralNetworkIR({ ...ir, outputNodeId: '' })).toBe(false)
    expect(isTargetNativeSurgeGeneralNetworkIR({ ...ir, outputNodeId: '   ' })).toBe(false)
  })

  it('binds compiler ownership last and cannot be spoofed by persisted fields', () => {
    const spoofed = { ...base, ipv6: true, outputNodeId: 'spoofed' } as never
    expect(isTargetNativeSurgeGeneralNetworkConfig(spoofed)).toBe(false)
    expect(targetNativeSurgeGeneralNetworkConfigToIR('compiler-output', spoofed).outputNodeId).toBe('compiler-output')
  })

  it('rejects unknown, Symbol, inherited, and malformed fields', () => {
    const valid = { ...base, ipv6: true }
    const symbol = Symbol('future-semantic')
    expect(isTargetNativeSurgeGeneralNetworkConfig({ ...valid, extendedMatching: true })).toBe(false)
    expect(isTargetNativeSurgeGeneralNetworkConfig({ ...valid, [symbol]: true })).toBe(false)

    const inherited = Object.create({ ipv6: true }) as Record<string, unknown>
    inherited.target = 'surge'
    inherited.kind = 'general-network'
    expect(isTargetNativeSurgeGeneralNetworkConfig(inherited)).toBe(false)

    for (const value of [
      null,
      undefined,
      42,
      'config',
      [],
      { ...base, ipv6: 'true' },
      { ...base, ipv6: 1 },
      { ...base, ipv6Vif: 'off' },
      { ...base, ipv6Vif: 'AUTO' },
      { ...base, ipv6Vif: 1 },
      { ...base, icmpForwarding: 1 },
      { ...base, ipv6: undefined },
    ]) expect(isTargetNativeSurgeGeneralNetworkConfig(value)).toBe(false)
  })

  it('allows null-prototype plain objects but rejects custom prototypes and symbols in IR', () => {
    const nullPrototype = Object.create(null) as Record<string, unknown>
    Object.assign(nullPrototype, { ...base, ipv6Vif: 'auto' })
    expect(isTargetNativeSurgeGeneralNetworkConfig(nullPrototype)).toBe(true)

    const customPrototype = Object.create({}) as Record<string, unknown>
    Object.assign(customPrototype, { ...base, ipv6Vif: 'auto' })
    expect(isTargetNativeSurgeGeneralNetworkConfig(customPrototype)).toBe(false)

    const ir = targetNativeSurgeGeneralNetworkConfigToIR('output-a', { ...base, ipv6Vif: 'auto' })
    const symbol = Symbol('future')
    expect(isTargetNativeSurgeGeneralNetworkIR({ ...ir, [symbol]: true })).toBe(false)
    expect(isTargetNativeSurgeGeneralNetworkIR({ ...ir, extendedMatching: true })).toBe(false)
  })

  it('selects exactly one valid record for an output and fails closed on ambiguity', () => {
    const first = targetNativeSurgeGeneralNetworkConfigToIR('output-a', { ...base, ipv6: true })
    const second = targetNativeSurgeGeneralNetworkConfigToIR('output-b', { ...base, icmpForwarding: false })
    expect(selectTargetNativeSurgeGeneralNetwork([first, second], 'output-a')).toEqual(first)
    expect(selectTargetNativeSurgeGeneralNetwork([first, first], 'output-a')).toBeUndefined()
    expect(selectTargetNativeSurgeGeneralNetwork([first, { ...second, extendedMatching: true } as never], 'output-a')).toBeUndefined()
    expect(selectTargetNativeSurgeGeneralNetwork([first], undefined)).toBeUndefined()
  })
})
