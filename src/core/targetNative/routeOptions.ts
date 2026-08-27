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

export function isTargetNativeRouteOptionsConfig(value: unknown): value is TargetNativeRouteOptionsConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as unknown as Record<string, unknown>
  return candidate.target === 'surge'
    && candidate.kind === 'route-options'
    && candidate.noResolve === true
}

export function isTargetNativeRouteOptionsIR(value: unknown): value is TargetNativeRouteOptionsIR {
  if (!isTargetNativeRouteOptionsConfig(value)) return false
  const candidate = value as unknown as Record<string, unknown>
  return typeof candidate.routeId === 'string' && Boolean(candidate.routeId.trim())
}

export function targetNativeRouteOptionsConfigToIR(
  routeId: string,
  config: TargetNativeRouteOptionsConfig,
): TargetNativeRouteOptionsIR {
  return { routeId, ...structuredClone(config) }
}
