/**
 * Typed Surge General Network / VIF intent.
 *
 * This semantic family deliberately lives outside Universal IR.  The project
 * stores only explicitly authored values; omission means that Surge's own
 * default remains in effect.
 */

export type TargetNativeSurgeGeneralNetworkTarget = 'surge'
export type TargetNativeSurgeGeneralNetworkKind = 'general-network'
export type TargetNativeSurgeIpv6Vif = 'disabled' | 'auto' | 'always'

export interface TargetNativeSurgeGeneralNetworkConfig {
  target: TargetNativeSurgeGeneralNetworkTarget
  kind: TargetNativeSurgeGeneralNetworkKind
  ipv6?: boolean
  ipv6Vif?: TargetNativeSurgeIpv6Vif
  icmpForwarding?: boolean
}

export interface TargetNativeSurgeGeneralNetworkIR extends TargetNativeSurgeGeneralNetworkConfig {
  /** Compiler-owned Output node identity. */
  outputNodeId: string
}

const CONFIG_REQUIRED_KEYS = ['target', 'kind'] as const
const CONFIG_OPTIONAL_KEYS = ['ipv6', 'ipv6Vif', 'icmpForwarding'] as const
const IR_REQUIRED_KEYS = ['outputNodeId', 'target', 'kind'] as const

/** Runtime guard for persisted Project data. */
export function isTargetNativeSurgeGeneralNetworkConfig(
  value: unknown,
): value is TargetNativeSurgeGeneralNetworkConfig {
  return isGeneralNetworkShape(value, false)
}

/** Runtime guard for compiler/headless data.  This is intentionally separate
 * from the Project Config guard so an IR owner can never be self-authorized by
 * accidentally passing a Config object through the runtime boundary.
 */
export function isTargetNativeSurgeGeneralNetworkIR(
  value: unknown,
): value is TargetNativeSurgeGeneralNetworkIR {
  return isGeneralNetworkShape(value, true)
}

/** Bind a validated Project config to the compiler-owned Output node. */
export function targetNativeSurgeGeneralNetworkConfigToIR(
  outputNodeId: string,
  config: TargetNativeSurgeGeneralNetworkConfig,
): TargetNativeSurgeGeneralNetworkIR {
  return { ...structuredClone(config), outputNodeId }
}

/** Select exactly one compiler record for an Output.  Ambiguous records are
 * rejected rather than resolved by graph order.
 */
export function selectTargetNativeSurgeGeneralNetwork(
  records: readonly TargetNativeSurgeGeneralNetworkIR[] | undefined,
  outputNodeId: string | undefined,
): TargetNativeSurgeGeneralNetworkIR | undefined {
  if (!Array.isArray(records) || typeof outputNodeId !== 'string' || !outputNodeId.trim()) return undefined
  // A caller must never receive a record that has not crossed the exact IR
  // boundary.  Reject the complete collection when one record is malformed so
  // an invalid sibling cannot be silently stripped while another is selected.
  if (!records.every((record) => isTargetNativeSurgeGeneralNetworkIR(record))) return undefined
  const matches = records.filter((record) => record.outputNodeId === outputNodeId)
  if (matches.length !== 1) return undefined
  try {
    return structuredClone(matches[0])
  } catch {
    return undefined
  }
}

/** Whether a config has at least one explicitly authored semantic value. */
export function hasTargetNativeSurgeGeneralNetworkValue(value: unknown): value is {
  ipv6?: boolean
  ipv6Vif?: TargetNativeSurgeIpv6Vif
  icmpForwarding?: boolean
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return hasOwn(candidate, 'ipv6') || hasOwn(candidate, 'ipv6Vif') || hasOwn(candidate, 'icmpForwarding')
}

function isGeneralNetworkShape(value: unknown, ir: boolean): value is TargetNativeSurgeGeneralNetworkConfig | TargetNativeSurgeGeneralNetworkIR {
  try {
    if (!isPlainRecord(value)) return false
    const candidate = value as Record<string, unknown>
    const required = ir ? IR_REQUIRED_KEYS : CONFIG_REQUIRED_KEYS
    const allowed = [...required, ...CONFIG_OPTIONAL_KEYS]
    if (!hasExactKeys(value, allowed) || !required.every((key) => hasOwn(candidate, key))) return false
    if (ir && (!hasNonEmptyString(candidate.outputNodeId))) return false
    if (candidate.target !== 'surge' || candidate.kind !== 'general-network') return false

    const semanticKeys = CONFIG_OPTIONAL_KEYS.filter((key) => hasOwn(candidate, key))
    // An object containing only target/kind is a non-effective no-op and is
    // not allowed across either runtime boundary.
    if (semanticKeys.length === 0) return false
    if (hasOwn(candidate, 'ipv6') && typeof candidate.ipv6 !== 'boolean') return false
    if (hasOwn(candidate, 'ipv6Vif')
      && candidate.ipv6Vif !== 'disabled'
      && candidate.ipv6Vif !== 'auto'
      && candidate.ipv6Vif !== 'always') return false
    if (hasOwn(candidate, 'icmpForwarding') && typeof candidate.icmpForwarding !== 'boolean') return false
    return true
  } catch {
    // Deserialized/headless values can be proxies or otherwise hostile
    // objects.  Runtime validation must fail closed, never escape an accessor.
    return false
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0
}

function hasExactKeys(value: object, allowed: readonly string[]) {
  const keys = Reflect.ownKeys(value)
  return keys.length <= allowed.length
    && keys.every((key) => typeof key === 'string' && allowed.includes(key))
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

// Compatibility aliases make the boundary discoverable to integrations that
// use the shorter "General Network" naming while retaining the explicit
// Surge ownership in the canonical types above.
export type TargetNativeGeneralNetworkConfig = TargetNativeSurgeGeneralNetworkConfig
export type TargetNativeGeneralNetworkIR = TargetNativeSurgeGeneralNetworkIR
export const isTargetNativeGeneralNetworkConfig = isTargetNativeSurgeGeneralNetworkConfig
export const isTargetNativeGeneralNetworkIR = isTargetNativeSurgeGeneralNetworkIR
export const targetNativeGeneralNetworkConfigToIR = targetNativeSurgeGeneralNetworkConfigToIR
