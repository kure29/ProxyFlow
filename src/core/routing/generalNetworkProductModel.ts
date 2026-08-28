import type { PrimaryTarget } from '../capabilities'
import {
  isTargetNativeSurgeGeneralNetworkConfig,
  parseSurgeVifRouteDraft,
  type SurgeVifRouteField,
  type TargetNativeSurgeGeneralNetworkConfig,
  type TargetNativeSurgeIpv6Vif,
} from '../targetNative'

export type SurgeGeneralNetworkField = 'ipv6' | 'ipv6Vif' | 'icmpForwarding'
export type SurgeGeneralNetworkChoice = 'default' | 'enabled' | 'disabled' | 'auto' | 'always'

export interface SurgeGeneralNetworkUiContext {
  primaryTarget: PrimaryTarget | null | undefined
  hasPersistedIntent: boolean
}

export interface SurgeGeneralNetworkUiState {
  hasPersistedIntent: boolean
  isTargetMismatch: boolean
  canCreate: boolean
  canRemove: boolean
}

/** Product permissions are intentionally split: a non-Surge target cannot
 * create new Surge intent, but it may always inspect and remove retained
 * intent.
 */
export function getSurgeGeneralNetworkUiState({ primaryTarget, hasPersistedIntent }: SurgeGeneralNetworkUiContext): SurgeGeneralNetworkUiState {
  const isSurge = primaryTarget === 'surge'
  return {
    hasPersistedIntent,
    isTargetMismatch: hasPersistedIntent && !isSurge,
    canCreate: isSurge,
    canRemove: hasPersistedIntent,
  }
}

/** Return the UI choice representing the exact persisted state. */
export function surgeGeneralNetworkFieldChoice(
  config: unknown,
  field: SurgeGeneralNetworkField,
): SurgeGeneralNetworkChoice {
  if (!isTargetNativeSurgeGeneralNetworkConfig(config)) return 'default'
  if (field === 'ipv6Vif') {
    const value = config.ipv6Vif
    return value === undefined ? 'default' : value
  }
  const value = field === 'ipv6' ? config.ipv6 : config.icmpForwarding
  if (value === undefined) return 'default'
  return value ? 'enabled' : 'disabled'
}

/** Apply one explicit/default choice while preserving all other G1 values. */
export function surgeGeneralNetworkOptionsPatch(
  config: unknown,
  field: SurgeGeneralNetworkField,
  choice: SurgeGeneralNetworkChoice,
): { targetNativeSurgeGeneralNetwork: TargetNativeSurgeGeneralNetworkConfig | undefined } {
  const current = isTargetNativeSurgeGeneralNetworkConfig(config)
    ? structuredClone(config)
    : { target: 'surge' as const, kind: 'general-network' as const }

  if (field === 'ipv6') {
    if (!['default', 'enabled', 'disabled'].includes(choice)) return currentPatch(config)
    delete current.ipv6
    if (choice === 'enabled') current.ipv6 = true
    else if (choice === 'disabled') current.ipv6 = false
  } else if (field === 'ipv6Vif') {
    if (!['default', 'disabled', 'auto', 'always'].includes(choice)) return currentPatch(config)
    delete current.ipv6Vif
    if (choice === 'disabled' || choice === 'auto' || choice === 'always') current.ipv6Vif = choice
  } else {
    if (!['default', 'enabled', 'disabled'].includes(choice)) return currentPatch(config)
    delete current.icmpForwarding
    if (choice === 'enabled') current.icmpForwarding = true
    else if (choice === 'disabled') current.icmpForwarding = false
  }

  if (!hasSemanticValue(current)) return { targetNativeSurgeGeneralNetwork: undefined }
  return isTargetNativeSurgeGeneralNetworkConfig(current)
    ? { targetNativeSurgeGeneralNetwork: current }
    : currentPatch(config)
}

/** Convenience patch for clearing the whole retained family explicitly. */
export function removeSurgeGeneralNetworkOptions() {
  return { targetNativeSurgeGeneralNetwork: undefined }
}

function currentPatch(config: unknown): { targetNativeSurgeGeneralNetwork: TargetNativeSurgeGeneralNetworkConfig | undefined } {
  return isTargetNativeSurgeGeneralNetworkConfig(config)
    ? { targetNativeSurgeGeneralNetwork: structuredClone(config) }
    : { targetNativeSurgeGeneralNetwork: undefined }
}

export function hasSurgeGeneralNetworkSemanticValue(value: unknown): value is {
  ipv6?: boolean
  ipv6Vif?: TargetNativeSurgeIpv6Vif
  icmpForwarding?: boolean
  tunExcludedRoutes?: string[]
  tunIncludedRoutes?: string[]
} {
  return Boolean(value && typeof value === 'object'
    && ['ipv6', 'ipv6Vif', 'icmpForwarding', 'tunExcludedRoutes', 'tunIncludedRoutes']
      .some((key) => Object.prototype.hasOwnProperty.call(value, key)))
}

export function surgeGeneralNetworkRouteDraft(config: unknown, field: SurgeVifRouteField) {
  if (!isTargetNativeSurgeGeneralNetworkConfig(config)) return ''
  return Array.isArray(config[field]) ? config[field]!.join('\n') : ''
}

/** Commit a transient multiline route draft without persisting partial input. */
export function commitSurgeGeneralNetworkRouteDraft(
  config: unknown,
  field: SurgeVifRouteField,
  draft: string,
): { targetNativeSurgeGeneralNetwork: TargetNativeSurgeGeneralNetworkConfig | undefined } | undefined {
  const parsed = parseSurgeVifRouteDraft(draft)
  if (!parsed.ok) return undefined
  const current = isTargetNativeSurgeGeneralNetworkConfig(config)
    ? structuredClone(config)
    : { target: 'surge' as const, kind: 'general-network' as const }
  if (parsed.routes.length === 0) delete current[field]
  else current[field] = parsed.routes
  if (!hasSemanticValue(current)) return { targetNativeSurgeGeneralNetwork: undefined }
  return isTargetNativeSurgeGeneralNetworkConfig(current)
    ? { targetNativeSurgeGeneralNetwork: current }
    : undefined
}

function hasSemanticValue(value: unknown): value is TargetNativeSurgeGeneralNetworkConfig {
  return hasSurgeGeneralNetworkSemanticValue(value)
}

// Short names are useful to consumers that already scope the module to the
// Surge Output inspector.
export const generalNetworkOptionsPatch = surgeGeneralNetworkOptionsPatch
export const surgeGeneralNetworkPatch = surgeGeneralNetworkOptionsPatch
