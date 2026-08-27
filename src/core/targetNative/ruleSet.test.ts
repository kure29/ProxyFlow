import { describe, expect, it } from 'vitest'
import {
  isTargetNativeRuleSetSourceConfig,
  isTargetNativeRuleSetSourceIR,
  targetNativeRuleSetSourceConfigToIR,
} from './ruleSet'

describe('target-native built-in Rule Set runtime boundaries', () => {
  const config = { target: 'surge' as const, kind: 'builtin-rule-set' as const, name: 'LAN' as const }

  it('keeps Config and IR exact shapes separate', () => {
    expect(isTargetNativeRuleSetSourceConfig(config)).toBe(true)
    expect(isTargetNativeRuleSetSourceConfig({ ...config, sourceId: 'spoofed' })).toBe(false)
    expect(isTargetNativeRuleSetSourceConfig({ ...config, extendedMatching: true })).toBe(false)
    expect(isTargetNativeRuleSetSourceConfig({ ...config, unknownOption: true })).toBe(false)

    const ir = { ...config, sourceId: 'source-lan' }
    expect(isTargetNativeRuleSetSourceIR(ir)).toBe(true)
    expect(isTargetNativeRuleSetSourceIR({ ...ir, unknownOption: true })).toBe(false)
    expect(isTargetNativeRuleSetSourceIR({ ...ir, sourceId: '' })).toBe(false)
  })

  it('rejects symbol and inherited required fields', () => {
    const symbol = Symbol('semantic')
    expect(isTargetNativeRuleSetSourceConfig({ ...config, [symbol]: true })).toBe(false)
    expect(isTargetNativeRuleSetSourceIR({ ...config, sourceId: 'source-lan', [symbol]: true })).toBe(false)
    const inherited = Object.create({ name: 'LAN' }) as Record<string, unknown>
    Object.assign(inherited, { target: 'surge', kind: 'builtin-rule-set' })
    expect(isTargetNativeRuleSetSourceConfig(inherited)).toBe(false)
  })

  it('binds compiler-owned sourceId last', () => {
    const spoofed = { ...config, sourceId: 'spoofed' } as never
    const ir = targetNativeRuleSetSourceConfigToIR('compiler-source', spoofed)
    expect(ir.sourceId).toBe('compiler-source')
    expect(isTargetNativeRuleSetSourceIR(ir)).toBe(true)
  })
})
