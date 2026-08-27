/**
 * Surge source-port routing stays outside Universal TrafficMatcherIR.
 *
 * Surge's SRC-PORT grammar is proven for the product baseline, while the
 * other active targets do not have a proven equivalent in this repository.
 * Keep the persisted intent typed and bind its owner in the graph compiler.
 */

export interface TargetNativeSourcePortConfig {
  target: 'surge'
  kind: 'source-port'
  /** Exact source port; ranges and comparison expressions are deferred. */
  port: number
}

export interface TargetNativeSourcePortIR extends TargetNativeSourcePortConfig {
  /** Project graph route that owns this matcher. */
  routeId: string
}

const CONFIG_KEYS = ['target', 'kind', 'port'] as const
const IR_KEYS = ['routeId', ...CONFIG_KEYS] as const

function hasExactKeys(value: object, allowed: readonly string[]) {
  const keys = Reflect.ownKeys(value)
  return keys.length === allowed.length
    && keys.every((key) => typeof key === 'string' && allowed.includes(key))
}

export function isValidSourcePort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65_535
}

export function isTargetNativeSourcePortConfig(value: unknown): value is TargetNativeSourcePortConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return hasExactKeys(value, CONFIG_KEYS)
    && candidate.target === 'surge'
    && candidate.kind === 'source-port'
    && isValidSourcePort(candidate.port)
}

export function isTargetNativeSourcePortIR(value: unknown): value is TargetNativeSourcePortIR {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, IR_KEYS)) return false
  const candidate = value as Record<string, unknown>
  return candidate.target === 'surge'
    && candidate.kind === 'source-port'
    && isValidSourcePort(candidate.port)
    && typeof candidate.routeId === 'string'
    && Boolean(candidate.routeId.trim())
}

export function targetNativeSourcePortConfigToIR(
  routeId: string,
  config: TargetNativeSourcePortConfig,
): TargetNativeSourcePortIR {
  return { ...structuredClone(config), routeId }
}

/** Runtime guard for the target-native matcher carried by a route record. */
export function isTargetNativeSourcePortMatcher(value: unknown): value is { kind: 'source-port'; port: number } {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, ['kind', 'port'])) return false
  const candidate = value as Record<string, unknown>
  return candidate.kind === 'source-port' && isValidSourcePort(candidate.port)
}
