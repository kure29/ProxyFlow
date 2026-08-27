import { describe, expect, it } from 'vitest'
import {
  isPolicyReference,
  isTargetNativeStrategyConfig,
  isTargetNativeStrategyIR,
  targetNativeStrategyConfigToIR,
} from './strategy'

describe('target-native strategy runtime boundaries', () => {
  const smartConfig = {
    target: 'surge' as const,
    kind: 'smart' as const,
    members: [{ kind: 'proxy' as const, id: 'proxy-1' }],
  }
  const subnetConfig = {
    target: 'surge' as const,
    kind: 'subnet' as const,
    conditions: [{ matcher: { kind: 'ssid' as const, value: 'Home' }, policy: { kind: 'builtin' as const, id: 'DIRECT' as const } }],
    defaultPolicy: { kind: 'builtin' as const, id: 'REJECT' as const },
  }

  it('keeps Project Config and runtime IR exact shapes separate', () => {
    expect(isTargetNativeStrategyConfig(smartConfig)).toBe(true)
    expect(isTargetNativeStrategyConfig({ ...smartConfig, id: 'spoofed' })).toBe(false)
    expect(isTargetNativeStrategyConfig({ ...smartConfig, name: 'spoofed' })).toBe(false)
    expect(isTargetNativeStrategyConfig({ ...smartConfig, sourceId: 'spoofed' })).toBe(false)
    expect(isTargetNativeStrategyConfig({ ...smartConfig, finalNodeId: 'spoofed' })).toBe(false)
    expect(isTargetNativeStrategyConfig({ ...smartConfig, extendedMatching: true })).toBe(false)
    expect(isTargetNativeStrategyConfig({ ...smartConfig, unknownOption: true })).toBe(false)

    const ir = { ...smartConfig, id: 'smart-1', name: 'Smart' }
    expect(isTargetNativeStrategyIR(ir)).toBe(true)
    expect(isTargetNativeStrategyIR({ ...ir, unknownOption: true })).toBe(false)
    expect(isTargetNativeStrategyIR({ ...ir, [Symbol('semantic')]: true })).toBe(false)
    expect(isTargetNativeStrategyIR({ ...ir, id: '' })).toBe(false)
    expect(isTargetNativeStrategyIR({ ...ir, name: 42 })).toBe(false)
  })

  it('rejects symbol and inherited required fields', () => {
    const symbol = Symbol('semantic')
    const withSymbol = { ...smartConfig, [symbol]: true }
    expect(isTargetNativeStrategyConfig(withSymbol)).toBe(false)

    const inherited = Object.create({ members: smartConfig.members }) as Record<string, unknown>
    inherited.target = 'surge'
    inherited.kind = 'smart'
    expect(isTargetNativeStrategyConfig(inherited)).toBe(false)

    const inheritedOptional = Object.create({ policyPriority: [{ pattern: 'Spoof', factor: 1 }] }) as Record<string, unknown>
    Object.assign(inheritedOptional, smartConfig)
    expect(isTargetNativeStrategyConfig(inheritedOptional)).toBe(false)

    const inheritedIR = Object.create({ id: 'smart-1' }) as Record<string, unknown>
    Object.assign(inheritedIR, { ...smartConfig, name: 'Smart' })
    expect(isTargetNativeStrategyIR(inheritedIR)).toBe(false)
  })

  it('enforces exact nested PolicyReference, policy-priority, Subnet condition, and matcher shapes', () => {
    expect(isPolicyReference({ kind: 'proxy', id: 'proxy-1', hiddenOption: true })).toBe(false)
    expect(isPolicyReference({ kind: 'strategy', id: 'group', target: 'DIRECT' })).toBe(false)
    expect(isPolicyReference({ kind: 'builtin', id: 'DIRECT', hiddenOption: true })).toBe(false)

    expect(isTargetNativeStrategyConfig({
      ...smartConfig,
      policyPriority: [{ pattern: 'Premium', factor: 1, semanticExtra: true }],
    })).toBe(false)
    expect(isTargetNativeStrategyConfig({
      ...subnetConfig,
      conditions: [{ ...subnetConfig.conditions[0], semanticExtra: true }],
    })).toBe(false)
    expect(isTargetNativeStrategyConfig({
      ...subnetConfig,
      conditions: [{ ...subnetConfig.conditions[0], matcher: { kind: 'ssid', value: 'Home', semanticExtra: true } }],
    })).toBe(false)
  })

  it('binds compiler-owned strategy id and name last', () => {
    const spoofed = { ...smartConfig, id: 'spoofed', name: 'Spoofed' } as never
    const ir = targetNativeStrategyConfigToIR('compiler-id', 'Compiler name', spoofed)
    expect(ir.id).toBe('compiler-id')
    expect(ir.name).toBe('Compiler name')
    expect(isTargetNativeStrategyIR(ir)).toBe(true)
  })
})
