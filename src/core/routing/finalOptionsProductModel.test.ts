import { describe, expect, it } from 'vitest'
import type { GraphNode } from '../../types/project'
import { finalDnsFailedOptionsPatch, getFinalDnsFailedUiState, isFinalTargetConfigured } from './finalOptionsProductModel'

const context = (overrides: Partial<Parameters<typeof getFinalDnsFailedUiState>[0]> = {}) => ({
  primaryTarget: 'surge' as const,
  finalTargetKind: 'strategy' as const,
  hasConfiguredFinalTarget: true,
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

  it('blocks an unconfigured Final while keeping a persisted intent removable', () => {
    expect(getFinalDnsFailedUiState(context({ hasConfiguredFinalTarget: false }))).toMatchObject({
      isFinalTargetConfigured: false, isFinalTargetMissing: true, canCreate: false, toggleDisabled: true,
    })
    expect(getFinalDnsFailedUiState(context({ hasConfiguredFinalTarget: false, hasPersistedIntent: true }))).toMatchObject({
      isFinalTargetConfigured: false, isFinalTargetMissing: true, canCreate: false, canRemove: true, toggleDisabled: false,
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

  it('resolves only typed, present, enabled Final references', () => {
    const target = (id: string, disabled = false): GraphNode => ({
      id, type: 'block', position: { x: 0, y: 0 },
      data: { blockType: 'manual-select', category: 'strategy', title: id, subtitle: '', icon: 'list', disabled },
    })
    const strategy = target('strategy')
    const disabled = target('disabled', true)
    expect(isFinalTargetConfigured('direct', undefined, [])).toBe(true)
    expect(isFinalTargetConfigured('reject', undefined, [])).toBe(true)
    expect(isFinalTargetConfigured('strategy', 'strategy', [strategy])).toBe(true)
    expect(isFinalTargetConfigured('strategy', 'disabled', [disabled])).toBe(false)
    expect(isFinalTargetConfigured('strategy', undefined, [strategy])).toBe(false)
    expect(isFinalTargetConfigured(undefined, 'strategy', [strategy])).toBe(false)
  })
})
