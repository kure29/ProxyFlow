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
  config: unknown,
  url: string,
): { targetNativeSurgeGeneralConnectivity: TargetNativeSurgeGeneralConnectivityConfig | undefined } {
  if (!url.trim()) return { targetNativeSurgeGeneralConnectivity: undefined }
  if (isTargetNativeSurgeGeneralConnectivityConfig(config)) {
    return { targetNativeSurgeGeneralConnectivity: { ...structuredClone(config), internetTestUrl: url } }
  }
  return { targetNativeSurgeGeneralConnectivity: { target: 'surge', kind: 'general-connectivity', internetTestUrl: url } }
}

export function removeSurgeGeneralConnectivityOptions() {
  return { targetNativeSurgeGeneralConnectivity: undefined }
}

export function hasSurgeGeneralConnectivitySemanticValue(value: unknown): value is { internetTestUrl: string } {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'internetTestUrl'))
}
