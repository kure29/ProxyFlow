import { describe, expect, it } from 'vitest'
import {
  isTargetNativeSourcePortConfig,
  isTargetNativeSourcePortIR,
  targetNativeSourcePortConfigToIR,
} from './sourcePort'

describe('target-native Surge SRC-PORT', () => {
  const config = { target: 'surge' as const, kind: 'source-port' as const, port: 443 }

  it('accepts only the exact single-port config shape', () => {
    expect(isTargetNativeSourcePortConfig(config)).toBe(true)
    expect(isTargetNativeSourcePortConfig({ ...config, routeId: 'spoofed' })).toBe(false)
    expect(isTargetNativeSourcePortConfig({ ...config, extendedMatching: true })).toBe(false)
    expect(isTargetNativeSourcePortConfig({ ...config, port: 0 })).toBe(false)
    expect(isTargetNativeSourcePortConfig({ ...config, port: 443.5 })).toBe(false)
  })

  it('binds compiler ownership after copied config fields', () => {
    const ir = targetNativeSourcePortConfigToIR('route-1', config)
    expect(ir).toEqual({ target: 'surge', kind: 'source-port', port: 443, routeId: 'route-1' })
    expect(isTargetNativeSourcePortIR(ir)).toBe(true)
    expect(isTargetNativeSourcePortIR({ ...ir, extendedMatching: true })).toBe(false)
    expect(isTargetNativeSourcePortIR({ ...ir, routeId: '' })).toBe(false)
    expect(targetNativeSourcePortConfigToIR('route-1', { ...config, routeId: 'spoofed' } as never).routeId).toBe('route-1')
  })
})
