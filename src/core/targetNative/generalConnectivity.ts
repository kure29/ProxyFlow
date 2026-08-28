import { isSafeSurgeHttpUrl } from './safety'

export type TargetNativeSurgeGeneralConnectivityTarget = 'surge'
export type TargetNativeSurgeGeneralConnectivityKind = 'general-connectivity'

/** Output-owned Surge Internet/DIRECT connectivity-testing intent. */
export interface TargetNativeSurgeGeneralConnectivityConfig {
  target: TargetNativeSurgeGeneralConnectivityTarget
  kind: TargetNativeSurgeGeneralConnectivityKind
  internetTestUrl?: string
}

export interface TargetNativeSurgeGeneralConnectivityIR extends TargetNativeSurgeGeneralConnectivityConfig {
  /** Compiler-owned concrete Output identity. */
  outputNodeId: string
  internetTestUrl: string
}

const CONFIG_KEYS = ['target', 'kind', 'internetTestUrl'] as const
const IR_KEYS = ['outputNodeId', 'target', 'kind', 'internetTestUrl'] as const

export function isTargetNativeSurgeGeneralConnectivityConfig(
  value: unknown,
): value is TargetNativeSurgeGeneralConnectivityConfig {
  return isConnectivityShape(value, false)
}

export function isTargetNativeSurgeGeneralConnectivityIR(
  value: unknown,
): value is TargetNativeSurgeGeneralConnectivityIR {
  return isConnectivityShape(value, true)
}

export function targetNativeSurgeGeneralConnectivityConfigToIR(
  outputNodeId: string,
  config: TargetNativeSurgeGeneralConnectivityConfig,
): TargetNativeSurgeGeneralConnectivityIR {
  return { ...structuredClone(config), outputNodeId, internetTestUrl: config.internetTestUrl! }
}

export function selectTargetNativeSurgeGeneralConnectivity(
  records: readonly TargetNativeSurgeGeneralConnectivityIR[] | undefined,
  outputNodeId: string | undefined,
): TargetNativeSurgeGeneralConnectivityIR | undefined {
  if (!Array.isArray(records) || typeof outputNodeId !== 'string' || !outputNodeId.trim()) return undefined
  if (!records.every((record) => isTargetNativeSurgeGeneralConnectivityIR(record))) return undefined
  const matches = records.filter((record) => record.outputNodeId === outputNodeId)
  if (matches.length !== 1) return undefined
  try { return structuredClone(matches[0]) } catch { return undefined }
}

function isConnectivityShape(
  value: unknown,
  ir: boolean,
): value is TargetNativeSurgeGeneralConnectivityConfig | TargetNativeSurgeGeneralConnectivityIR {
  try {
    if (!isPlainRecord(value)) return false
    const candidate = value as Record<string, unknown>
    const allowed = ir ? IR_KEYS : CONFIG_KEYS
    const required = ir ? IR_KEYS : ['target', 'kind', 'internetTestUrl'] as const
    if (!hasExactKeys(value, allowed) || !required.every((key) => hasOwn(candidate, key))) return false
    if (candidate.target !== 'surge' || candidate.kind !== 'general-connectivity') return false
    if (!isSafeSurgeHttpUrl(candidate.internetTestUrl)) return false
    if (ir && !hasNonEmptyString(candidate.outputNodeId)) return false
    return true
  } catch {
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
  return keys.length === allowed.length && keys.every((key) => typeof key === 'string' && allowed.includes(key))
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

export type TargetNativeGeneralConnectivityConfig = TargetNativeSurgeGeneralConnectivityConfig
export type TargetNativeGeneralConnectivityIR = TargetNativeSurgeGeneralConnectivityIR
export const isTargetNativeGeneralConnectivityConfig = isTargetNativeSurgeGeneralConnectivityConfig
export const isTargetNativeGeneralConnectivityIR = isTargetNativeSurgeGeneralConnectivityIR
export const targetNativeGeneralConnectivityConfigToIR = targetNativeSurgeGeneralConnectivityConfigToIR
export const selectTargetNativeGeneralConnectivity = selectTargetNativeSurgeGeneralConnectivity
