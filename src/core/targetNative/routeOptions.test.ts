import { describe, expect, it } from 'vitest'
import {
  isTargetNativeRouteOptionsConfig,
  isTargetNativeRouteOptionsIR,
  targetNativeRouteOptionsConfigToIR,
} from './routeOptions'

describe('target-native route options', () => {
  const config = { target: 'surge' as const, kind: 'route-options' as const, noResolve: true as const }

  it('accepts only the exact enabled config shape', () => {
    expect(isTargetNativeRouteOptionsConfig(config)).toBe(true)
    expect(isTargetNativeRouteOptionsConfig({ ...config, noResolve: false })).toBe(false)
    expect(isTargetNativeRouteOptionsConfig({ ...config, kind: 'final-options' })).toBe(false)
    expect(isTargetNativeRouteOptionsConfig({ ...config, target: 'mihomo' })).toBe(false)
  })

  it('binds config provenance to one route', () => {
    const options = targetNativeRouteOptionsConfigToIR('route-1', config)
    expect(options).toEqual({ routeId: 'route-1', ...config })
    expect(isTargetNativeRouteOptionsIR(options)).toBe(true)
    expect(isTargetNativeRouteOptionsIR({ ...options, routeId: '' })).toBe(false)
  })
})
