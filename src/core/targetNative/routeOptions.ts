/**
 * Target-native route options stay outside Universal TrafficMatcherIR.
 *
 * The Project stores only explicit Surge option intent. The graph compiler
 * binds that intent to one route and target adapters decide whether it can be
 * emitted without changing semantics.
 */

export interface TargetNativeRouteOptionsConfig {
  target: 'surge'
  kind: 'route-options'
  /** Skip DNS resolution for unresolved domain requests at this rule. */
  noResolve: true
}

export interface TargetNativeRouteOptionsIR extends TargetNativeRouteOptionsConfig {
  /** Project graph route that owns this option. */
  routeId: string
}

const CONFIG_KEYS = ['target', 'kind', 'noResolve'] as const
const IR_KEYS = ['routeId', ...CONFIG_KEYS] as const

function hasExactKeys(value: object, allowed: readonly string[]) {
  const keys = Reflect.ownKeys(value)
  return keys.length === allowed.length
    && keys.every((key) => typeof key === 'string' && allowed.includes(key))
}

function hasValidRouteOptionFields(candidate: Record<string, unknown>) {
  return candidate.target === 'surge'
    && candidate.kind === 'route-options'
    && candidate.noResolve === true
}

export function isTargetNativeRouteOptionsConfig(value: unknown): value is TargetNativeRouteOptionsConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as unknown as Record<string, unknown>
  return hasExactKeys(value, CONFIG_KEYS) && hasValidRouteOptionFields(candidate)
}

export function isTargetNativeRouteOptionsIR(value: unknown): value is TargetNativeRouteOptionsIR {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, IR_KEYS)) return false
  const candidate = value as unknown as Record<string, unknown>
  return hasValidRouteOptionFields(candidate)
    && typeof candidate.routeId === 'string'
    && Boolean(candidate.routeId.trim())
}

export function targetNativeRouteOptionsConfigToIR(
  routeId: string,
  config: TargetNativeRouteOptionsConfig,
): TargetNativeRouteOptionsIR {
  return { ...structuredClone(config), routeId }
}
