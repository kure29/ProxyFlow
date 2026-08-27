import type { BlockNodeData, GraphNode } from '../../types/project'
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
  /** Whether the typed Final target resolves to a usable Product graph node. */
  hasConfiguredFinalTarget: boolean
  hasPersistedIntent: boolean
}

export interface FinalDnsFailedUiState {
  hasPersistedIntent: boolean
  isSurgeTarget: boolean
  isDirectFinal: boolean
  isFinalTargetConfigured: boolean
  isFinalTargetMissing: boolean
  isTargetMismatch: boolean
  isIncompatible: boolean
  canCreate: boolean
  canRemove: boolean
  toggleDisabled: boolean
}

export function getFinalDnsFailedUiState(context: FinalDnsFailedUiContext): FinalDnsFailedUiState {
  const isSurgeTarget = context.primaryTarget === 'surge'
  const isDirectFinal = context.finalTargetKind === 'direct'
  const isFinalTargetConfigured = context.hasConfiguredFinalTarget
  const isFinalTargetMissing = !isFinalTargetConfigured
  const isTargetMismatch = context.hasPersistedIntent && !isSurgeTarget
  const isIncompatible = context.hasPersistedIntent && isSurgeTarget && isDirectFinal
  const canCreate = !context.hasPersistedIntent && isSurgeTarget && isFinalTargetConfigured && !isDirectFinal
  const canRemove = context.hasPersistedIntent
  return {
    hasPersistedIntent: context.hasPersistedIntent,
    isSurgeTarget,
    isDirectFinal,
    isFinalTargetConfigured,
    isFinalTargetMissing,
    isTargetMismatch,
    isIncompatible,
    canCreate,
    canRemove,
    toggleDisabled: !context.hasPersistedIntent && !canCreate,
  }
}

/** Resolves Product-layer Final references without inferring from labels or titles. */
export function isFinalTargetConfigured(
  finalTargetKind: BlockNodeData['targetKind'],
  finalTargetId: string | undefined,
  targetNodes: readonly GraphNode[],
) {
  if (finalTargetKind === 'direct' || finalTargetKind === 'reject') return true
  if (finalTargetKind !== 'strategy' || !finalTargetId) return false
  const target = targetNodes.find((node) => node.id === finalTargetId)
  return Boolean(target && !target.data.disabled)
}

export function finalDnsFailedOptionsPatch(enabled: boolean): { targetNativeFinalOptions: TargetNativeFinalOptionsConfig | undefined } {
  return enabled
    ? { targetNativeFinalOptions: { target: 'surge', kind: 'final-options', dnsFailed: true } }
    : { targetNativeFinalOptions: undefined }
}
