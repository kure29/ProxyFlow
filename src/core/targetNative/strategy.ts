/**
 * Target-native strategy semantics live outside Universal StrategyIR.
 *
 * Project graph nodes store the small, serialisable config below. The graph
 * compiler lifts it into TargetNativeStrategyIR and target adapters consume
 * that extension explicitly. This keeps target syntax from becoming a
 * universal strategy kind while leaving room for future native adapters.
 */

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

export type SurgeSubnetMatcher =
  | { kind: 'ssid'; value: string }
  | { kind: 'bssid'; value: string }
  | { kind: 'router'; value: string }
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
  matcher?: import('../ir').TrafficMatcherIR
  target: { kind: 'strategy'; id: string }
  priority: number
}

export type TargetNativeStrategyIR = TargetNativeStrategyIRBase & SurgeNativeStrategyConfig

export function isTargetNativeStrategyConfig(value: unknown): value is TargetNativeStrategyConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.target !== 'surge' || (candidate.kind !== 'smart' && candidate.kind !== 'subnet')) return false
  if (candidate.kind === 'smart') {
    // Keep the runtime guard structural. The Surge validator intentionally
    // reports the precise invalid policy kind (builtin/group) instead of
    // collapsing every malformed member into a generic config error.
    return Array.isArray(candidate.members)
  }
  return Array.isArray(candidate.conditions)
}

export function isPolicyReference(value: unknown): value is PolicyReference {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'proxy' || candidate.kind === 'strategy') return typeof candidate.id === 'string' && Boolean(candidate.id.trim())
  return candidate.kind === 'builtin' && (candidate.id === 'DIRECT' || candidate.id === 'REJECT')
}

export function subnetMatcherExpression(matcher: SurgeSubnetMatcher) {
  const prefix = matcher.kind === 'network-type' ? 'TYPE' : matcher.kind.toUpperCase()
  return `${prefix}:${matcher.value}`
}

export function targetNativeStrategyConfigToIR(
  id: string,
  name: string,
  config: TargetNativeStrategyConfig,
): TargetNativeStrategyIR {
  return { id, name, ...structuredClone(config) } as TargetNativeStrategyIR
}
