import { describe, expect, it } from 'vitest'
import { finalDnsFailedOptionsPatch, getFinalDnsFailedUiState } from './finalOptionsProductModel'

const context = (overrides: Partial<Parameters<typeof getFinalDnsFailedUiState>[0]> = {}) => ({
  primaryTarget: 'surge' as const,
  finalTargetKind: 'strategy' as const,
  hasPersistedIntent: false,
  ...overrides,
})

describe('Final dns-failed Product UI policy', () => {
  it.each([
    ['strategy', undefined],
    ['reject', undefined],
    ['strategy', 'smart'],
    ['strategy', 'subnet'],
  ] as const)('allows creation for Surge %s Final%s', (finalTargetKind, finalTargetNativeKind) => {
    expect(getFinalDnsFailedUiState(context({ finalTargetKind, finalTargetNativeKind }))).toMatchObject({
      canCreate: true, canRemove: false, toggleDisabled: false, isIncompatible: false,
    })
  })

  it('blocks creating a new intent for DIRECT while allowing removal of an existing one', () => {
    expect(getFinalDnsFailedUiState(context({ finalTargetKind: 'direct' }))).toMatchObject({
      canCreate: false, canRemove: false, toggleDisabled: true, isIncompatible: false,
    })
    expect(getFinalDnsFailedUiState(context({ finalTargetKind: 'direct', hasPersistedIntent: true }))).toMatchObject({
      canCreate: false, canRemove: true, toggleDisabled: false, isIncompatible: true,
    })
  })

  it('blocks creating a new intent for non-Surge targets but keeps persisted intent removable', () => {
    expect(getFinalDnsFailedUiState(context({ primaryTarget: 'mihomo' }))).toMatchObject({
      canCreate: false, canRemove: false, toggleDisabled: true, isTargetMismatch: false,
    })
    expect(getFinalDnsFailedUiState(context({ primaryTarget: 'mihomo', hasPersistedIntent: true }))).toMatchObject({
      canCreate: false, canRemove: true, toggleDisabled: false, isTargetMismatch: true,
    })
  })

  it('writes the existing typed config on enable and removes the extension on disable', () => {
    expect(finalDnsFailedOptionsPatch(true)).toEqual({
      targetNativeFinalOptions: { target: 'surge', kind: 'final-options', dnsFailed: true },
    })
    expect(finalDnsFailedOptionsPatch(false)).toEqual({ targetNativeFinalOptions: undefined })
  })
})
