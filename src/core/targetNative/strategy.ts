/**
 * Target-native strategy semantics live outside Universal StrategyIR.
 *
 * Project graph nodes store the small, serialisable config below. The graph
 * compiler lifts it into TargetNativeStrategyIR and target adapters consume
 * that extension explicitly. This keeps target syntax from becoming a
 * universal strategy kind while leaving room for future native adapters.
 */

import type { RouteTargetIR, TrafficMatcherIR } from '../ir'
import { isExactTrafficMatcherIR } from '../ir'
import { isTargetNativeSourcePortIR, isTargetNativeSourcePortMatcher } from './sourcePort'

export type TargetNativeStrategyTarget = 'surge'

export type BuiltinPolicy = 'DIRECT' | 'REJECT'

export type PolicyReference =
  | { kind: 'proxy'; id: string }
  | { kind: 'strategy'; id: string }
  | { kind: 'builtin'; id: BuiltinPolicy }

export type SurgeNativeStrategyConfig =
  | {
      target: 'surge'
      kind: 'smart'
      members: Array<Extract<PolicyReference, { kind: 'proxy' }>>
      /** Ordered regex multipliers; the first matching rule wins. */
      policyPriority?: SurgePolicyPriorityRule[]
      /** Surge defaults this to false when omitted. */
      evaluateBeforeUse?: boolean
    }
  | {
      target: 'surge'
      kind: 'subnet'
      conditions: SurgeSubnetCondition[]
      defaultPolicy: PolicyReference
    }

export type TargetNativeStrategyConfig = SurgeNativeStrategyConfig

export interface SurgeSubnetCondition {
  matcher: SurgeSubnetMatcher
  policy: PolicyReference
}

export interface SurgePolicyPriorityRule {
  pattern: string
  factor: number
}

export type SurgeSubnetMatcher =
  | { kind: 'ssid'; value: string }
  | { kind: 'bssid'; value: string }
  | { kind: 'router'; value: string }
  | { kind: 'mccmnc'; value: string }
  | { kind: 'network-type'; value: 'WIFI' | 'WIRED' | 'CELLULAR' }

export interface TargetNativeStrategyIRBase {
  id: string
  name: string
  target: TargetNativeStrategyTarget
}

/** Routing records whose target is a native strategy stay in this extension. */
export interface TargetNativeRouteIR {
  id: string
  name: string
  matcher: TrafficMatcherIR | { kind: 'source-port'; port: number }
  target: RouteTargetIR
  priority: number
  /** Compiler-owned rank among all emitted Project routes, including Universal routes. */
  routingOrder: number
  /** Exact typed provenance for a Surge-native source-port matcher. */
  targetNativeSourcePort?: import('./sourcePort').TargetNativeSourcePortIR
}

/** A native Final is not an ordinary ordered route and has no matcher/order. */
export interface TargetNativeFinalRouteIR {
  id: string
  name: string
  target: Extract<RouteTargetIR, { kind: 'strategy' }>
}

export type TargetNativeStrategyIR = TargetNativeStrategyIRBase & SurgeNativeStrategyConfig

export function isTargetNativeStrategyConfig(value: unknown): value is TargetNativeStrategyConfig {
  return isTargetNativeStrategyShape(value, false)
}

export function isTargetNativeStrategyIR(value: unknown): value is TargetNativeStrategyIR {
  return isTargetNativeStrategyShape(value, true)
}

export function isPolicyReference(value: unknown): value is PolicyReference {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'proxy' || candidate.kind === 'strategy') {
    return hasExactKeys(value, ['kind', 'id'])
      && typeof candidate.id === 'string'
      && Boolean(candidate.id.trim())
  }
  return candidate.kind === 'builtin'
    && hasExactKeys(value, ['kind', 'id'])
    && (candidate.id === 'DIRECT' || candidate.id === 'REJECT')
}

export function subnetMatcherExpression(matcher: SurgeSubnetMatcher) {
  const prefix = matcher.kind === 'network-type' ? 'TYPE' : matcher.kind.toUpperCase()
  return `${prefix}:${matcher.value}`
}

/**
 * Surge documents MCCMNC as MCC (3 digits) followed by MNC (2 or 3 digits).
 * Keep this strict so malformed carrier selectors cannot silently compile to
 * a different network condition.
 */
export function isValidSurgeMccmnc(value: string) {
  return /^\d{5,6}$/.test(value)
}

export function targetNativeStrategyConfigToIR(
  id: string,
  name: string,
  config: TargetNativeStrategyConfig,
): TargetNativeStrategyIR {
  return { ...structuredClone(config), id, name } as TargetNativeStrategyIR
}

const SMART_CONFIG_REQUIRED_KEYS = ['target', 'kind', 'members'] as const
const SMART_OPTIONAL_KEYS = ['policyPriority', 'evaluateBeforeUse'] as const
const SMART_IR_REQUIRED_KEYS = ['id', 'name', ...SMART_CONFIG_REQUIRED_KEYS] as const
const SUBNET_CONFIG_KEYS = ['target', 'kind', 'conditions', 'defaultPolicy'] as const
const SUBNET_IR_KEYS = ['id', 'name', ...SUBNET_CONFIG_KEYS] as const

function isTargetNativeStrategyShape(value: unknown, ir: boolean) {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (ir && (!hasNonEmptyString(candidate.id) || typeof candidate.name !== 'string')) return false
  if (!ir && ('id' in candidate || 'name' in candidate)) return false
  if (candidate.target !== 'surge' || (candidate.kind !== 'smart' && candidate.kind !== 'subnet')) return false

  if (candidate.kind === 'smart') {
    if (!hasExactKeys(value, ir ? SMART_IR_REQUIRED_KEYS : SMART_CONFIG_REQUIRED_KEYS, SMART_OPTIONAL_KEYS)) return false
    if (SMART_OPTIONAL_KEYS.some((key) => !hasOwnKey(value, key) && key in candidate)) return false
    if (!Array.isArray(candidate.members) || !candidate.members.every(hasPolicyReferenceShape)) return false
    const policyPriority = hasOwnKey(value, 'policyPriority') ? candidate.policyPriority : undefined
    if (policyPriority !== undefined
      && (!Array.isArray(policyPriority) || !policyPriority.every((rule) => hasExactKeysForRecord(rule, ['pattern', 'factor'])))) return false
    return true
  }

  if (!hasExactKeys(value, ir ? SUBNET_IR_KEYS : SUBNET_CONFIG_KEYS)) return false
  if (!Array.isArray(candidate.conditions)) return false
  if (!candidate.conditions.every((condition) => (
    hasExactKeysForRecord(condition, ['matcher', 'policy'])
      && isSubnetMatcherShape((condition as Record<string, unknown>).matcher)
      && hasPolicyReferenceShape((condition as Record<string, unknown>).policy)
  ))) return false
  return hasPolicyReferenceShape(candidate.defaultPolicy)
}

function isSubnetMatcherShape(value: unknown): value is SurgeSubnetMatcher {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, ['kind', 'value'])) return false
  const candidate = value as Record<string, unknown>
  return (candidate.kind === 'ssid'
    || candidate.kind === 'bssid'
    || candidate.kind === 'router'
    || candidate.kind === 'mccmnc'
    || candidate.kind === 'network-type')
    && typeof candidate.value === 'string'
}

function hasExactKeysForRecord(value: unknown, allowed: readonly string[]) {
  return Boolean(value && typeof value === 'object') && hasExactKeys(value as object, allowed)
}

/** Structural policy-reference shape; semantic kind/id validation stays in isPolicyReference. */
function hasPolicyReferenceShape(value: unknown) {
  return Boolean(value && typeof value === 'object') && hasExactKeys(value as object, ['kind', 'id'])
}

function hasExactKeys(value: object, required: readonly string[], optional: readonly string[] = []) {
  const keys = Reflect.ownKeys(value)
  return keys.every((key) => typeof key === 'string' && (required.includes(key) || optional.includes(key)))
    && required.every((key) => keys.includes(key))
}

function hasOwnKey(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

export function isTargetNativeRouteTarget(value: unknown): value is RouteTargetIR {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'direct' || candidate.kind === 'reject') return hasExactKeys(value, ['kind'])
  return candidate.kind === 'strategy'
    && hasExactKeys(value, ['kind', 'id'])
    && hasNonEmptyString(candidate.id)
}

/** Exact runtime guard for ordinary target-native ordered routes. */
export function isTargetNativeRouteIR(value: unknown): value is TargetNativeRouteIR {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (!hasNonEmptyString(candidate.id) || typeof candidate.name !== 'string'
    || !isTargetNativeRouteTarget(candidate.target)
    || typeof candidate.priority !== 'number' || !Number.isFinite(candidate.priority)
    || typeof candidate.routingOrder !== 'number' || !Number.isSafeInteger(candidate.routingOrder)
    || candidate.routingOrder < 0) return false

  const isSourcePort = Boolean(candidate.matcher && typeof candidate.matcher === 'object'
    && (candidate.matcher as Record<string, unknown>).kind === 'source-port')
  const allowed = isSourcePort
    ? ['id', 'name', 'matcher', 'target', 'priority', 'routingOrder', 'targetNativeSourcePort']
    : ['id', 'name', 'matcher', 'target', 'priority', 'routingOrder']
  if (!hasExactKeys(value, allowed)) return false
  if (isSourcePort) {
    const matcher = candidate.matcher as Record<string, unknown>
    const provenance = candidate.targetNativeSourcePort
    return isTargetNativeSourcePortMatcher(matcher)
      && isTargetNativeSourcePortIR(provenance)
      && provenance.routeId === candidate.id
      && provenance.port === matcher.port
  }
  return isExactTrafficMatcherIR(candidate.matcher)
}

/** Exact runtime guard for a target-native Final route. */
export function isTargetNativeFinalRouteIR(value: unknown): value is TargetNativeFinalRouteIR {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return hasExactKeys(value, ['id', 'name', 'target'])
    && hasNonEmptyString(candidate.id)
    && typeof candidate.name === 'string'
    && isTargetNativeRouteTarget(candidate.target)
    && (candidate.target as RouteTargetIR).kind === 'strategy'
}
