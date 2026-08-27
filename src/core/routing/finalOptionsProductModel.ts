import type { BlockNodeData } from '../../types/project'
import type { PrimaryTarget } from '../capabilities'
import type { TargetNativeFinalOptionsConfig } from '../targetNative'

/**
 * The Product UI needs to distinguish creating a new incompatible intent from
 * removing one that is already persisted.  Keep that policy separate from the
 * compiler: the compiler remains the authoritative safety boundary.
 */
export interface FinalDnsFailedUiContext {
  primaryTarget: PrimaryTarget | null | undefined
  finalTargetKind: BlockNodeData['targetKind']
  finalTargetNativeKind?: 'smart' | 'subnet'
  hasPersistedIntent: boolean
}

export interface FinalDnsFailedUiState {
  hasPersistedIntent: boolean
  isSurgeTarget: boolean
  isDirectFinal: boolean
  isTargetMismatch: boolean
  isIncompatible: boolean
  canCreate: boolean
  canRemove: boolean
  toggleDisabled: boolean
}

export function getFinalDnsFailedUiState(context: FinalDnsFailedUiContext): FinalDnsFailedUiState {
  const isSurgeTarget = context.primaryTarget === 'surge'
  const isDirectFinal = context.finalTargetKind === 'direct'
  const isTargetMismatch = context.hasPersistedIntent && !isSurgeTarget
  const isIncompatible = context.hasPersistedIntent && isSurgeTarget && isDirectFinal
  const canCreate = !context.hasPersistedIntent && isSurgeTarget && !isDirectFinal
  const canRemove = context.hasPersistedIntent
  return {
    hasPersistedIntent: context.hasPersistedIntent,
    isSurgeTarget,
    isDirectFinal,
    isTargetMismatch,
    isIncompatible,
    canCreate,
    canRemove,
    toggleDisabled: !context.hasPersistedIntent && !canCreate,
  }
}

export function finalDnsFailedOptionsPatch(enabled: boolean): { targetNativeFinalOptions: TargetNativeFinalOptionsConfig | undefined } {
  return enabled
    ? { targetNativeFinalOptions: { target: 'surge', kind: 'final-options', dnsFailed: true } }
    : { targetNativeFinalOptions: undefined }
}
