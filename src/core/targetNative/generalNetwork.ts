import { parseCidr, parseCidrAuthoring } from '../network/cidr'

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
  tunExcludedRoutes?: string[]
  tunIncludedRoutes?: string[]
}

export interface TargetNativeSurgeGeneralNetworkIR extends TargetNativeSurgeGeneralNetworkConfig {
  /** Compiler-owned Output node identity. */
  outputNodeId: string
}

const CONFIG_REQUIRED_KEYS = ['target', 'kind'] as const
const CONFIG_OPTIONAL_KEYS = ['ipv6', 'ipv6Vif', 'icmpForwarding', 'tunExcludedRoutes', 'tunIncludedRoutes'] as const
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
  tunExcludedRoutes?: string[]
  tunIncludedRoutes?: string[]
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return CONFIG_OPTIONAL_KEYS.some((key) => hasOwn(candidate, key))
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
    if (hasOwn(candidate, 'tunExcludedRoutes') && !isStrictRouteList(candidate.tunExcludedRoutes)) return false
    if (hasOwn(candidate, 'tunIncludedRoutes') && !isStrictRouteList(candidate.tunIncludedRoutes)) return false
    if (hasOwn(candidate, 'tunExcludedRoutes') && hasOwn(candidate, 'tunIncludedRoutes')
      && hasExactCrossListConflict(candidate.tunExcludedRoutes, candidate.tunIncludedRoutes)) return false
    if (hasOwn(candidate, 'tunExcludedRoutes') && hasOwn(candidate, 'tunIncludedRoutes')
      && serializedBytes([candidate.tunExcludedRoutes, candidate.tunIncludedRoutes]) > SURGE_VIF_ROUTE_MAX_COMBINED_BYTES) return false
    if (hasIpv6Route(candidate) && (candidate.ipv6Vif === undefined || candidate.ipv6Vif === 'disabled')) return false
    return true
  } catch {
    // Deserialized/headless values can be proxies or otherwise hostile
    // objects.  Runtime validation must fail closed, never escape an accessor.
    return false
  }
}

export const SURGE_VIF_ROUTE_MAX_ITEMS = 512
export const SURGE_VIF_ROUTE_MAX_ITEM_BYTES = 64
export const SURGE_VIF_ROUTE_MAX_SERIALIZED_BYTES = 32 * 1024
export const SURGE_VIF_ROUTE_MAX_COMBINED_BYTES = 64 * 1024

export type SurgeVifRouteField = 'tunExcludedRoutes' | 'tunIncludedRoutes'
export type SurgeVifRouteValidationCode =
  | 'SURGE_GENERAL_VIF_CIDR_INVALID'
  | 'SURGE_GENERAL_VIF_CIDR_DUPLICATE'
  | 'SURGE_GENERAL_VIF_LIST_TOO_LARGE'
  | 'SURGE_GENERAL_VIF_IPV6_VIF_REQUIRED'
  | 'SURGE_GENERAL_VIF_CROSS_LIST_CONFLICT'

/** Strict semantic validation shared by Config, IR, and compiler diagnostics. */
export function validateSurgeVifRouteConfig(value: unknown): { ok: true } | { ok: false; code: SurgeVifRouteValidationCode } {
  try {
    if (!isPlainRecord(value)) return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
    const candidate = value as Record<string, unknown>
    for (const field of ['tunExcludedRoutes', 'tunIncludedRoutes'] as const) {
      if (!hasOwn(candidate, field)) continue
      const result = validateRouteList(candidate[field])
      if (!result.ok) return result
    }
    if (hasExactCrossListConflict(candidate.tunExcludedRoutes, candidate.tunIncludedRoutes)) {
      return { ok: false, code: 'SURGE_GENERAL_VIF_CROSS_LIST_CONFLICT' }
    }
    if (hasOwn(candidate, 'tunExcludedRoutes') && hasOwn(candidate, 'tunIncludedRoutes')
      && serializedBytes([candidate.tunExcludedRoutes, candidate.tunIncludedRoutes]) > SURGE_VIF_ROUTE_MAX_COMBINED_BYTES) {
      return { ok: false, code: 'SURGE_GENERAL_VIF_LIST_TOO_LARGE' }
    }
    if (hasIpv6Route(candidate) && (candidate.ipv6Vif === undefined || candidate.ipv6Vif === 'disabled')) {
      return { ok: false, code: 'SURGE_GENERAL_VIF_IPV6_VIF_REQUIRED' }
    }
    return { ok: true }
  } catch {
    return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
  }
}

/** Parse a multiline authoring draft; blanks are removed and first duplicates win. */
export function parseSurgeVifRouteDraft(value: unknown): { ok: true; routes: string[] } | { ok: false; invalid?: string; code: SurgeVifRouteValidationCode } {
  if (typeof value !== 'string') return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
  const routes: string[] = []
  const seen = new Set<string>()
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parsed = parseCidrAuthoring(line)
    if (!parsed.ok) return { ok: false, invalid: line, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
    if (!seen.has(parsed.cidr.value)) { seen.add(parsed.cidr.value); routes.push(parsed.cidr.value) }
  }
  if (routes.length > SURGE_VIF_ROUTE_MAX_ITEMS || serializedBytes(routes) > SURGE_VIF_ROUTE_MAX_SERIALIZED_BYTES) {
    return { ok: false, code: 'SURGE_GENERAL_VIF_LIST_TOO_LARGE' }
  }
  return { ok: true, routes }
}

function validateRouteList(value: unknown): { ok: true } | { ok: false; code: SurgeVifRouteValidationCode } {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
    const ownNames = Object.getOwnPropertyNames(value)
    if (ownNames.some((name) => name !== 'length' && !isArrayIndex(name, value.length))) return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
    if (value.length > SURGE_VIF_ROUTE_MAX_ITEMS || serializedBytes(value) > SURGE_VIF_ROUTE_MAX_SERIALIZED_BYTES) return { ok: false, code: 'SURGE_GENERAL_VIF_LIST_TOO_LARGE' }
    const seen = new Set<string>()
    for (let index = 0; index < value.length; index += 1) {
      if (!hasOwn(value, String(index)) || typeof value[index] !== 'string') return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
      if (!parseCidr(value[index], 'strict').ok) return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
      if (seen.has(value[index])) return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_DUPLICATE' }
      seen.add(value[index])
    }
    return { ok: true }
  } catch {
    return { ok: false, code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }
  }
}

function isStrictRouteList(value: unknown) { return validateRouteList(value).ok }

function hasExactCrossListConflict(excluded: unknown, included: unknown) {
  if (!Array.isArray(excluded) || !Array.isArray(included)) return false
  const includedSet = new Set(included.filter((item): item is string => typeof item === 'string'))
  return excluded.some((item) => typeof item === 'string' && includedSet.has(item))
}

function hasIpv6Route(candidate: Record<string, unknown>) {
  return ['tunExcludedRoutes', 'tunIncludedRoutes'].some((field) => {
    const list = candidate[field]
    if (!Array.isArray(list)) return false
    return list.some((item) => {
      const parsed = parseCidr(item, 'strict')
      return parsed.ok && parsed.cidr.family === 'ipv6'
    })
  })
}

function serializedBytes(value: unknown) {
  const serialized = JSON.stringify(value)
  return typeof serialized === 'string' ? new TextEncoder().encode(serialized).byteLength : Number.POSITIVE_INFINITY
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

function isArrayIndex(name: string, length: number) {
  if (!/^(?:0|[1-9]\d*)$/.test(name)) return false
  const index = Number(name)
  return Number.isSafeInteger(index) && index >= 0 && index < length
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
