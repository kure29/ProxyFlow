import type { PrimaryTarget } from '../capabilities'
import {
  isTargetNativeSurgeGeneralProxyBypassConfig,
  parseSurgeProxyBypassDraft,
  type TargetNativeSurgeGeneralProxyBypassConfig,
} from '../targetNative'

export interface SurgeGeneralProxyBypassUiState {
  hasPersistedIntent: boolean
  isTargetMismatch: boolean
  canCreate: boolean
  canRemove: boolean
}

export function getSurgeGeneralProxyBypassUiState({
  primaryTarget,
  hasPersistedIntent,
}: { primaryTarget: PrimaryTarget | null | undefined; hasPersistedIntent: boolean }): SurgeGeneralProxyBypassUiState {
  return {
    hasPersistedIntent,
    isTargetMismatch: hasPersistedIntent && primaryTarget !== 'surge',
    canCreate: primaryTarget === 'surge',
    canRemove: hasPersistedIntent,
  }
}

/** Return a stable primitive snapshot for React draft synchronization. */
export function surgeGeneralProxyBypassDraft(config: unknown) {
  if (!isTargetNativeSurgeGeneralProxyBypassConfig(config)) return ''
  return Array.isArray(config.skipProxy) ? config.skipProxy.join('\n') : ''
}

/** Commit one multiline Host List draft; invalid input leaves the persisted value untouched. */
export function commitSurgeGeneralProxyBypassDraft(
  config: unknown,
  draft: string,
): { targetNativeSurgeGeneralProxyBypass: TargetNativeSurgeGeneralProxyBypassConfig | undefined } | undefined {
  const parsed = parseSurgeProxyBypassDraft(draft)
  if (!parsed.ok) return undefined
  const current = isTargetNativeSurgeGeneralProxyBypassConfig(config)
    ? structuredClone(config)
    : { target: 'surge' as const, kind: 'general-proxy-bypass' as const }
  if (parsed.skipProxy.length === 0) delete current.skipProxy
  else current.skipProxy = parsed.skipProxy
  if (!Object.prototype.hasOwnProperty.call(current, 'skipProxy')
    && !Object.prototype.hasOwnProperty.call(current, 'excludeSimpleHostnames')) {
    return { targetNativeSurgeGeneralProxyBypass: undefined }
  }
  return isTargetNativeSurgeGeneralProxyBypassConfig(current)
    ? { targetNativeSurgeGeneralProxyBypass: current }
    : undefined
}

export function surgeGeneralProxyBypassOptionsPatch(
  config: unknown,
  value: string,
) {
  return commitSurgeGeneralProxyBypassDraft(config, value)
}

export function excludeSimpleHostnamesChoice(config: unknown): 'default' | 'enabled' | 'disabled' {
  if (!isTargetNativeSurgeGeneralProxyBypassConfig(config)) return 'default'
  if (!Object.prototype.hasOwnProperty.call(config, 'excludeSimpleHostnames')) return 'default'
  return config.excludeSimpleHostnames ? 'enabled' : 'disabled'
}

export function surgeGeneralProxyBypassBooleanPatch(
  config: unknown,
  choice: 'default' | 'enabled' | 'disabled',
): { targetNativeSurgeGeneralProxyBypass: TargetNativeSurgeGeneralProxyBypassConfig | undefined } {
  const current = isTargetNativeSurgeGeneralProxyBypassConfig(config)
    ? structuredClone(config)
    : { target: 'surge' as const, kind: 'general-proxy-bypass' as const }
  delete current.excludeSimpleHostnames
  if (choice === 'enabled') current.excludeSimpleHostnames = true
  if (choice === 'disabled') current.excludeSimpleHostnames = false
  if (!Object.prototype.hasOwnProperty.call(current, 'skipProxy')) return { targetNativeSurgeGeneralProxyBypass: choice === 'default' ? undefined : current }
  return isTargetNativeSurgeGeneralProxyBypassConfig(current)
    ? { targetNativeSurgeGeneralProxyBypass: current }
    : { targetNativeSurgeGeneralProxyBypass: undefined }
}

export function removeSurgeGeneralProxyBypassOptions() {
  return { targetNativeSurgeGeneralProxyBypass: undefined }
}
