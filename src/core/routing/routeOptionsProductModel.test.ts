import { describe, expect, it } from 'vitest'
import { getRouteNoResolveUiState, isRouteMatcherConfigured, routeNoResolveOptionsPatch } from './routeOptionsProductModel'

describe('Surge no-resolve Product model', () => {
  it('allows creation only for Surge and configured supported matchers', () => {
    const base = { matcherKind: 'ip-cidr' as const, hasConfiguredMatcher: true, hasPersistedIntent: false }
    expect(getRouteNoResolveUiState({ ...base, primaryTarget: 'surge' }).canCreate).toBe(true)
    expect(getRouteNoResolveUiState({ ...base, primaryTarget: 'mihomo' }).canCreate).toBe(false)
    expect(getRouteNoResolveUiState({ ...base, matcherKind: 'domain', primaryTarget: 'surge' }).toggleDisabled).toBe(true)
    expect(getRouteNoResolveUiState({ ...base, hasConfiguredMatcher: false, primaryTarget: 'surge' }).toggleDisabled).toBe(true)
  })

  it('keeps persisted intent removable across target and matcher changes', () => {
    const context = { matcherKind: 'domain' as const, hasConfiguredMatcher: true, hasPersistedIntent: true }
    const nonSurge = getRouteNoResolveUiState({ ...context, primaryTarget: 'mihomo' })
    expect(nonSurge.isTargetMismatch).toBe(true)
    expect(nonSurge.canCreate).toBe(false)
    expect(nonSurge.canRemove).toBe(true)
    expect(nonSurge.toggleDisabled).toBe(false)

    const unsupported = getRouteNoResolveUiState({ ...context, primaryTarget: 'surge' })
    expect(unsupported.isIncompatible).toBe(true)
    expect(unsupported.canRemove).toBe(true)
    expect(unsupported.toggleDisabled).toBe(false)
  })

  it('recognizes typed matcher configuration and patches intent without inference', () => {
    expect(isRouteMatcherConfigured('service', { services: ['openai'] })).toBe(true)
    expect(isRouteMatcherConfigured('service', { services: [] })).toBe(false)
    expect(isRouteMatcherConfigured('ip-cidr', { routeMatcherValue: '203.0.113.0/24' })).toBe(true)
    expect(isRouteMatcherConfigured('port', { routeMatcherPort: 443 })).toBe(true)
    expect(isRouteMatcherConfigured(undefined, {})).toBe(false)
    expect(routeNoResolveOptionsPatch(true)).toEqual({ targetNativeRouteOptions: { target: 'surge', kind: 'route-options', noResolve: true } })
    expect(routeNoResolveOptionsPatch(false)).toEqual({ targetNativeRouteOptions: undefined })
  })
})
