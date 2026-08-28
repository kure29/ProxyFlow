import { describe, expect, it } from 'vitest'
import {
  getSurgeGeneralNetworkUiState,
  removeSurgeGeneralNetworkOptions,
  surgeGeneralNetworkFieldChoice,
  surgeGeneralNetworkOptionsPatch,
} from './generalNetworkProductModel'

const base = { target: 'surge' as const, kind: 'general-network' as const }

describe('Surge General Network Product model', () => {
  it('separates creation permission from removal permission', () => {
    expect(getSurgeGeneralNetworkUiState({ primaryTarget: 'surge', hasPersistedIntent: false })).toEqual({
      hasPersistedIntent: false, isTargetMismatch: false, canCreate: true, canRemove: false,
    })
    expect(getSurgeGeneralNetworkUiState({ primaryTarget: 'mihomo', hasPersistedIntent: false })).toEqual({
      hasPersistedIntent: false, isTargetMismatch: false, canCreate: false, canRemove: false,
    })
    expect(getSurgeGeneralNetworkUiState({ primaryTarget: 'mihomo', hasPersistedIntent: true })).toEqual({
      hasPersistedIntent: true, isTargetMismatch: true, canCreate: false, canRemove: true,
    })
  })

  it('creates exact typed values and preserves explicit defaults', () => {
    const enabled = surgeGeneralNetworkOptionsPatch(undefined, 'ipv6', 'enabled')
    expect(enabled).toEqual({ targetNativeSurgeGeneralNetwork: { ...base, ipv6: true } })
    expect(surgeGeneralNetworkOptionsPatch(enabled.targetNativeSurgeGeneralNetwork, 'ipv6', 'disabled'))
      .toEqual({ targetNativeSurgeGeneralNetwork: { ...base, ipv6: false } })
    expect(surgeGeneralNetworkOptionsPatch(undefined, 'ipv6Vif', 'disabled'))
      .toEqual({ targetNativeSurgeGeneralNetwork: { ...base, ipv6Vif: 'disabled' } })
    expect(surgeGeneralNetworkOptionsPatch(undefined, 'icmpForwarding', 'disabled'))
      .toEqual({ targetNativeSurgeGeneralNetwork: { ...base, icmpForwarding: false } })
  })

  it('removes one field without changing the other G1 intent', () => {
    const config = { ...base, ipv6: false, ipv6Vif: 'always' as const, icmpForwarding: true }
    expect(surgeGeneralNetworkOptionsPatch(config, 'ipv6Vif', 'default'))
      .toEqual({ targetNativeSurgeGeneralNetwork: { ...base, ipv6: false, icmpForwarding: true } })
    expect(surgeGeneralNetworkOptionsPatch({ ...base, ipv6: false }, 'ipv6', 'default'))
      .toEqual({ targetNativeSurgeGeneralNetwork: undefined })
    expect(removeSurgeGeneralNetworkOptions()).toEqual({ targetNativeSurgeGeneralNetwork: undefined })
  })

  it('round-trips unset, explicit enum, and boolean states', () => {
    for (const [field, value, choice] of [
      ['ipv6', undefined, 'default'],
      ['ipv6', true, 'enabled'],
      ['ipv6', false, 'disabled'],
      ['ipv6Vif', undefined, 'default'],
      ['ipv6Vif', 'disabled', 'disabled'],
      ['ipv6Vif', 'auto', 'auto'],
      ['ipv6Vif', 'always', 'always'],
      ['icmpForwarding', undefined, 'default'],
      ['icmpForwarding', true, 'enabled'],
      ['icmpForwarding', false, 'disabled'],
    ] as const) {
      const config = value === undefined ? undefined : { ...base, [field]: value }
      expect(surgeGeneralNetworkFieldChoice(config, field)).toBe(choice)
    }
  })

  it('does not silently mutate a valid config for an invalid UI choice', () => {
    const config = { ...base, ipv6: true }
    expect(surgeGeneralNetworkOptionsPatch(config, 'ipv6', 'always')).toEqual({
      targetNativeSurgeGeneralNetwork: config,
    })
    expect(surgeGeneralNetworkOptionsPatch(config, 'ipv6Vif', 'enabled')).toEqual({
      targetNativeSurgeGeneralNetwork: config,
    })
  })
})
