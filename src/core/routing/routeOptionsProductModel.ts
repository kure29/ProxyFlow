import type { BlockNodeData } from '../../types/project'
import type { PrimaryTarget } from '../capabilities'
import type { TargetNativeRouteOptionsConfig } from '../targetNative'
import { isTargetNativeSourcePortConfig } from '../targetNative'

/** Matcher kinds for which Surge documents the native `no-resolve` modifier. */
export const SURGE_NO_RESOLVE_MATCHERS = [
  'service', 'ip-cidr', 'ip-cidr6', 'asn', 'geo-ip', 'rule-set',
] as const

export type SurgeNoResolveMatcher = typeof SURGE_NO_RESOLVE_MATCHERS[number]

export interface RouteNoResolveUiContext {
  primaryTarget: PrimaryTarget | null | undefined
  matcherKind: BlockNodeData['routeMatcherKind']
  /** Whether the matcher has enough typed data to be exported. */
  hasConfiguredMatcher: boolean
  hasPersistedIntent: boolean
}

export interface RouteNoResolveUiState {
  hasPersistedIntent: boolean
  isSurgeTarget: boolean
  isMatcherSupported: boolean
  isMatcherConfigured: boolean
  isMatcherMissing: boolean
  isTargetMismatch: boolean
  isIncompatible: boolean
  canCreate: boolean
  canRemove: boolean
  toggleDisabled: boolean
}

export function isSurgeNoResolveMatcher(value: BlockNodeData['routeMatcherKind']): value is SurgeNoResolveMatcher {
  return (SURGE_NO_RESOLVE_MATCHERS as readonly string[]).includes(value ?? '')
}

export function isRouteMatcherConfigured(
  matcherKind: BlockNodeData['routeMatcherKind'],
  data: Pick<BlockNodeData, 'services' | 'routeMatcherValue' | 'routeMatcherPort' | 'customRuleSource' | 'targetNativeRuleSet' | 'targetNativeSourcePort'>,
) {
  if (!matcherKind) return false
  if (matcherKind === 'service') return (data.services ?? []).some((service) => typeof service === 'string' && service.trim().length > 0)
  if (matcherKind === 'port') return Number.isInteger(data.routeMatcherPort) && data.routeMatcherPort! >= 1 && data.routeMatcherPort! <= 65535
  if (matcherKind === 'source-port') return isTargetNativeSourcePortConfig(data.targetNativeSourcePort)
  if (matcherKind === 'rule-set') return Boolean(data.customRuleSource?.id?.trim() || data.routeMatcherValue?.trim())
  return Boolean(data.routeMatcherValue?.trim())
}

export function getRouteNoResolveUiState(context: RouteNoResolveUiContext): RouteNoResolveUiState {
  const isSurgeTarget = context.primaryTarget === 'surge'
  const isMatcherSupported = isSurgeNoResolveMatcher(context.matcherKind)
  const isMatcherConfigured = context.hasConfiguredMatcher
  const isMatcherMissing = !isMatcherConfigured
  const isTargetMismatch = context.hasPersistedIntent && !isSurgeTarget
  const isIncompatible = context.hasPersistedIntent && isSurgeTarget && (!isMatcherSupported || !isMatcherConfigured)
  const canCreate = !context.hasPersistedIntent && isSurgeTarget && isMatcherSupported && isMatcherConfigured
  const canRemove = context.hasPersistedIntent
  return {
    hasPersistedIntent: context.hasPersistedIntent,
    isSurgeTarget,
    isMatcherSupported,
    isMatcherConfigured,
    isMatcherMissing,
    isTargetMismatch,
    isIncompatible,
    canCreate,
    canRemove,
    toggleDisabled: !context.hasPersistedIntent && !canCreate,
  }
}

export function routeNoResolveOptionsPatch(enabled: boolean): { targetNativeRouteOptions: TargetNativeRouteOptionsConfig | undefined } {
  return enabled
    ? { targetNativeRouteOptions: { target: 'surge', kind: 'route-options', noResolve: true } }
    : { targetNativeRouteOptions: undefined }
}

/** Backwards-friendly aliases for callers that name the modifier directly. */
export const noResolveOptionsPatch = routeNoResolveOptionsPatch
