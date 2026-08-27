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
  if (!value || typeof value !== 'object') return false
  const candidate = value as unknown as Record<string, unknown>
  return candidate.target === 'surge'
    && candidate.kind === 'final-options'
    && candidate.dnsFailed === true
}

export function isTargetNativeFinalOptionsIR(value: unknown): value is TargetNativeFinalOptionsIR {
  if (!isTargetNativeFinalOptionsConfig(value)) return false
  const candidate = value as unknown as Record<string, unknown>
  return typeof candidate.finalNodeId === 'string' && Boolean(candidate.finalNodeId.trim())
}

export function targetNativeFinalOptionsConfigToIR(
  finalNodeId: string,
  config: TargetNativeFinalOptionsConfig,
): TargetNativeFinalOptionsIR {
  return { finalNodeId, ...structuredClone(config) }
}
