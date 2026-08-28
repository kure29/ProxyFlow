import type { PrimaryTarget } from '../capabilities'
import {
  isTargetNativeSurgeGeneralConnectivityConfig,
  type TargetNativeSurgeGeneralConnectivityConfig,
} from '../targetNative'

export interface SurgeGeneralConnectivityUiState {
  hasPersistedIntent: boolean
  isTargetMismatch: boolean
  canCreate: boolean
  canRemove: boolean
}

export function getSurgeGeneralConnectivityUiState({
  primaryTarget,
  hasPersistedIntent,
}: { primaryTarget: PrimaryTarget | null | undefined; hasPersistedIntent: boolean }): SurgeGeneralConnectivityUiState {
  return {
    hasPersistedIntent,
    isTargetMismatch: hasPersistedIntent && primaryTarget !== 'surge',
    canCreate: primaryTarget === 'surge',
    canRemove: hasPersistedIntent,
  }
}

export function surgeGeneralConnectivityOptionsPatch(
  _config: unknown,
  url: string,
): { targetNativeSurgeGeneralConnectivity: TargetNativeSurgeGeneralConnectivityConfig | undefined } {
  return commitSurgeGeneralConnectivityDraft(url) ?? { targetNativeSurgeGeneralConnectivity: undefined }
}

/**
 * Commit a transient editor draft without allowing partial or invalid text to
 * cross the typed Project Config boundary. `undefined` means "keep the
 * existing persisted value and show feedback"; an explicit patch removing the
 * field represents a deliberate blank/default commit.
 */
export function commitSurgeGeneralConnectivityDraft(
  draft: string,
): { targetNativeSurgeGeneralConnectivity: TargetNativeSurgeGeneralConnectivityConfig | undefined } | undefined {
  if (!draft.trim()) return { targetNativeSurgeGeneralConnectivity: undefined }
  const candidate = { target: 'surge' as const, kind: 'general-connectivity' as const, internetTestUrl: draft }
  return isTargetNativeSurgeGeneralConnectivityConfig(candidate)
    ? { targetNativeSurgeGeneralConnectivity: candidate }
    : undefined
}

export function removeSurgeGeneralConnectivityOptions() {
  return { targetNativeSurgeGeneralConnectivity: undefined }
}

export function hasSurgeGeneralConnectivitySemanticValue(value: unknown): value is { internetTestUrl: string } {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'internetTestUrl'))
}
