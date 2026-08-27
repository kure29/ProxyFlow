import { describe, expect, it } from 'vitest'
import {
  isTargetNativeFinalOptionsConfig,
  isTargetNativeFinalOptionsIR,
  targetNativeFinalOptionsConfigToIR,
} from './final'

describe('target-native Final options', () => {
  const config = { target: 'surge' as const, kind: 'final-options' as const, dnsFailed: true as const }

  it('accepts only the exact enabled config shape', () => {
    expect(isTargetNativeFinalOptionsConfig(config)).toBe(true)
    expect(isTargetNativeFinalOptionsConfig({ ...config, dnsFailed: false })).toBe(false)
    expect(isTargetNativeFinalOptionsConfig({ target: 'surge', kind: 'final-options' })).toBe(false)
    expect(isTargetNativeFinalOptionsConfig({ ...config, kind: 'route-options' })).toBe(false)
    expect(isTargetNativeFinalOptionsConfig({ ...config, target: 'mihomo' })).toBe(false)
  })

  it('binds config provenance to one Final node deterministically', () => {
    const first = targetNativeFinalOptionsConfigToIR('final', config)
    const second = targetNativeFinalOptionsConfigToIR('final', config)
    expect(first).toEqual({ finalNodeId: 'final', ...config })
    expect(second).toEqual(first)
    expect(isTargetNativeFinalOptionsIR(first)).toBe(true)
    expect(isTargetNativeFinalOptionsIR({ ...first, finalNodeId: '' })).toBe(false)
  })
})
