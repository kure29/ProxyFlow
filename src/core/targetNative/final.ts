/**
 * Target-native Final rule options live outside Universal FinalRouteIR.
 *
 * The project stores only the explicit Surge modifier intent. The Final
 * target itself remains owned by FinalRouteIR or nativeFinalRoute.
 */

export interface TargetNativeFinalOptionsConfig {
  target: 'surge'
  kind: 'final-options'
  /** Presence of this config means the modifier is enabled. */
  dnsFailed: true
}

export interface TargetNativeFinalOptionsIR extends TargetNativeFinalOptionsConfig {
  /** Project graph node that owns this modifier. */
  finalNodeId: string
}

export function isTargetNativeFinalOptionsConfig(value: unknown): value is TargetNativeFinalOptionsConfig {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, ['target', 'kind', 'dnsFailed'])) return false
  const candidate = value as Record<string, unknown>
  return candidate.target === 'surge'
    && candidate.kind === 'final-options'
    && candidate.dnsFailed === true
}

export function isTargetNativeFinalOptionsIR(value: unknown): value is TargetNativeFinalOptionsIR {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, ['finalNodeId', 'target', 'kind', 'dnsFailed'])) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.finalNodeId === 'string'
    && Boolean(candidate.finalNodeId.trim())
    && candidate.target === 'surge'
    && candidate.kind === 'final-options'
    && candidate.dnsFailed === true
}

export function targetNativeFinalOptionsConfigToIR(
  finalNodeId: string,
  config: TargetNativeFinalOptionsConfig,
): TargetNativeFinalOptionsIR {
  return { ...structuredClone(config), finalNodeId }
}

function hasExactKeys(value: object, allowed: readonly string[]) {
  const keys = Reflect.ownKeys(value)
  return keys.length === allowed.length
    && keys.every((key) => typeof key === 'string' && allowed.includes(key))
}
