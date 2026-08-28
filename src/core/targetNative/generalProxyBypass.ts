import { parseCidr, parseCidrAuthoring } from '../network/cidr'
import { isSafeSurgeSerializedString } from './safety'

export type TargetNativeSurgeGeneralProxyBypassTarget = 'surge'
export type TargetNativeSurgeGeneralProxyBypassKind = 'general-proxy-bypass'

/** Output-owned Surge system-proxy/takeover compatibility intent. */
export interface TargetNativeSurgeGeneralProxyBypassConfig {
  target: TargetNativeSurgeGeneralProxyBypassTarget
  kind: TargetNativeSurgeGeneralProxyBypassKind
  /** Strict persisted positive Host List subset, in authored order. */
  skipProxy?: string[]
  /** Omitted means Surge's default false; explicit false is retained. */
  excludeSimpleHostnames?: boolean
}

export interface TargetNativeSurgeGeneralProxyBypassIR extends TargetNativeSurgeGeneralProxyBypassConfig {
  /** Compiler-owned effective Output identity. */
  outputNodeId: string
}

export const SURGE_PROXY_BYPASS_MAX_ITEMS = 512
export const SURGE_PROXY_BYPASS_MAX_ITEM_BYTES = 256
export const SURGE_PROXY_BYPASS_MAX_SERIALIZED_BYTES = 32 * 1024

export type SurgeProxyBypassValidationCode =
  | 'SURGE_PROXY_BYPASS_HOST_INVALID'
  | 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED'
  | 'SURGE_PROXY_BYPASS_DUPLICATE'
  | 'SURGE_PROXY_BYPASS_LIST_TOO_LARGE'

const CONFIG_KEYS = ['target', 'kind', 'skipProxy', 'excludeSimpleHostnames'] as const
const IR_KEYS = ['outputNodeId', ...CONFIG_KEYS] as const

export function isTargetNativeSurgeGeneralProxyBypassConfig(
  value: unknown,
): value is TargetNativeSurgeGeneralProxyBypassConfig {
  return isProxyBypassShape(value, false)
}

export function isTargetNativeSurgeGeneralProxyBypassIR(
  value: unknown,
): value is TargetNativeSurgeGeneralProxyBypassIR {
  return isProxyBypassShape(value, true)
}

/** Independent typed Surge wire-value guard for the `skip-proxy` Host List. */
export function isSurgeProxyBypassHostListValue(value: unknown): value is { kind: 'host-list'; items: string[] } {
  try {
    if (!isPlainRecord(value) || !hasExactKeys(value, ['kind', 'items'])
      || !hasOwn(value, 'kind') || !hasOwn(value, 'items') || value.kind !== 'host-list') return false
    return validateSkipProxyList(value.items).ok
  } catch {
    return false
  }
}

/** Bind compiler provenance without parsing, normalizing, or repairing data. */
export function targetNativeSurgeGeneralProxyBypassConfigToIR(
  outputNodeId: string,
  config: TargetNativeSurgeGeneralProxyBypassConfig,
): TargetNativeSurgeGeneralProxyBypassIR {
  return { ...structuredClone(config), outputNodeId }
}

export function selectTargetNativeSurgeGeneralProxyBypass(
  records: readonly TargetNativeSurgeGeneralProxyBypassIR[] | undefined,
  outputNodeId: string | undefined,
): TargetNativeSurgeGeneralProxyBypassIR | undefined {
  if (!Array.isArray(records) || typeof outputNodeId !== 'string' || !outputNodeId.trim()) return undefined
  if (!records.every((record) => isTargetNativeSurgeGeneralProxyBypassIR(record))) return undefined
  const matches = records.filter((record) => record.outputNodeId === outputNodeId)
  if (matches.length !== 1) return undefined
  try { return structuredClone(matches[0]) } catch { return undefined }
}

/** Parse a multiline authoring draft, preserving order and first exact duplicate. */
export function parseSurgeProxyBypassDraft(value: unknown):
  | { ok: true; skipProxy: string[] }
  | { ok: false; invalid?: string; code: SurgeProxyBypassValidationCode } {
  if (typeof value !== 'string') return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
  const skipProxy: string[] = []
  const seen = new Set<string>()
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parsed = parseSkipProxyItem(line, 'authoring')
    if (!parsed.ok) return { ok: false, invalid: line, code: parsed.code }
    if (!seen.has(parsed.value)) {
      seen.add(parsed.value)
      skipProxy.push(parsed.value)
    }
  }
  const size = serializedListBytes(skipProxy)
  if (skipProxy.length > SURGE_PROXY_BYPASS_MAX_ITEMS || size > SURGE_PROXY_BYPASS_MAX_SERIALIZED_BYTES) {
    return { ok: false, code: 'SURGE_PROXY_BYPASS_LIST_TOO_LARGE' }
  }
  return { ok: true, skipProxy }
}

/** Validate a family-shaped value and return a focused grammar code when applicable. */
export function validateSurgeProxyBypassConfig(value: unknown): { ok: true } | { ok: false; code: SurgeProxyBypassValidationCode } {
  try {
    if (!isPlainRecord(value)) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
    const candidate = value as Record<string, unknown>
    if (!hasExactKeys(value, CONFIG_KEYS)) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
    if (!hasOwn(candidate, 'target') || !hasOwn(candidate, 'kind') || candidate.target !== 'surge' || candidate.kind !== 'general-proxy-bypass') return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
    if (!hasOwn(candidate, 'skipProxy') && !hasOwn(candidate, 'excludeSimpleHostnames')) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
    if (hasOwn(candidate, 'excludeSimpleHostnames') && typeof candidate.excludeSimpleHostnames !== 'boolean') return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
    if (hasOwn(candidate, 'skipProxy')) {
      const listResult = validateSkipProxyList(candidate.skipProxy)
      if (!listResult.ok) return listResult
    }
    return { ok: true }
  } catch {
    return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
  }
}

/** Safely classify only recognizable G3-C data; generic malformed values stay family-level. */
export function classifySurgeProxyBypassIssue(value: unknown): SurgeProxyBypassValidationCode | undefined {
  try {
    if (!isPlainRecord(value)) return undefined
    const target = Object.getOwnPropertyDescriptor(value, 'target')
    const kind = Object.getOwnPropertyDescriptor(value, 'kind')
    if (!target || !('value' in target) || target.value !== 'surge' || !kind || !('value' in kind) || kind.value !== 'general-proxy-bypass') return undefined
    const skip = Object.getOwnPropertyDescriptor(value, 'skipProxy')
    const simple = Object.getOwnPropertyDescriptor(value, 'excludeSimpleHostnames')
    if (!skip && !simple) return undefined
    if ((skip && !('value' in skip)) || (simple && !('value' in simple))) return undefined
    const candidate: Record<string, unknown> = { target: 'surge', kind: 'general-proxy-bypass' }
    if (skip && 'value' in skip) candidate.skipProxy = skip.value
    if (simple && 'value' in simple) candidate.excludeSimpleHostnames = simple.value
    const validation = validateSurgeProxyBypassConfig(candidate)
    return validation.ok ? undefined : validation.code
  } catch {
    return undefined
  }
}

function isProxyBypassShape(value: unknown, ir: boolean): value is TargetNativeSurgeGeneralProxyBypassConfig | TargetNativeSurgeGeneralProxyBypassIR {
  try {
    if (!isPlainRecord(value)) return false
    const candidate = value as Record<string, unknown>
    const allowed = ir ? IR_KEYS : CONFIG_KEYS
    if (!hasExactKeys(value, allowed)) return false
    if (!hasOwn(candidate, 'target') || !hasOwn(candidate, 'kind')) return false
    if (candidate.target !== 'surge' || candidate.kind !== 'general-proxy-bypass') return false
    if (ir && !hasNonEmptyString(candidate.outputNodeId)) return false
    if (!hasOwn(candidate, 'skipProxy') && !hasOwn(candidate, 'excludeSimpleHostnames')) return false
    if (hasOwn(candidate, 'excludeSimpleHostnames') && typeof candidate.excludeSimpleHostnames !== 'boolean') return false
    if (hasOwn(candidate, 'skipProxy') && !validateSkipProxyList(candidate.skipProxy).ok) return false
    return true
  } catch {
    return false
  }
}

function validateSkipProxyList(value: unknown): { ok: true } | { ok: false; code: SurgeProxyBypassValidationCode } {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
    const ownNames = Object.getOwnPropertyNames(value)
    if (ownNames.some((name) => name !== 'length' && !isArrayIndex(name, value.length))) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
    if (value.length > SURGE_PROXY_BYPASS_MAX_ITEMS) return { ok: false, code: 'SURGE_PROXY_BYPASS_LIST_TOO_LARGE' }
    const seen = new Set<string>()
    for (let index = 0; index < value.length; index += 1) {
      if (!hasOwn(value, String(index)) || typeof value[index] !== 'string') return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
      const parsed = parseSkipProxyItem(value[index], 'strict')
      if (!parsed.ok) return { ok: false, code: parsed.code }
      if (parsed.value !== value[index]) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
      if (seen.has(value[index])) return { ok: false, code: 'SURGE_PROXY_BYPASS_DUPLICATE' }
      seen.add(value[index])
    }
    if (serializedListBytes(value) > SURGE_PROXY_BYPASS_MAX_SERIALIZED_BYTES) return { ok: false, code: 'SURGE_PROXY_BYPASS_LIST_TOO_LARGE' }
    return { ok: true }
  } catch {
    return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
  }
}

function parseSkipProxyItem(value: string, mode: 'authoring' | 'strict'):
  | { ok: true; value: string }
  | { ok: false; code: SurgeProxyBypassValidationCode } {
  if (!isSafeSurgeSerializedString(value) || !value || value !== value.trim() || new TextEncoder().encode(value).byteLength > SURGE_PROXY_BYPASS_MAX_ITEM_BYTES) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
  if (value.includes(',') || /[\u0000-\u001f\u007f\s]/.test(value)) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
  if (value.startsWith('<') || value.endsWith('>') || value.includes('<') || value.includes('>')) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' }
  if (value.startsWith('-')) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' }
  if (value === '*' || value === '?') return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' }
  if (value.includes(':')) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' }
  if (/^(?:\d{1,3}\.){3}\d{1,3}-\d{1,3}$/.test(value)) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' }
  if (value.includes('/')) {
    const parsed = mode === 'authoring' ? parseCidrAuthoring(value) : parseCidr(value, 'strict')
    if (!parsed.ok) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
    if (parsed.cidr.family !== 'ipv4') return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' }
    return { ok: true, value: parsed.cidr.value }
  }
  if (value.includes('?')) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' }
  if (value.includes('*')) {
    if (isIpv4Wildcard(value)) return { ok: true, value }
    if (isIpv4Candidate(value)) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' }
    if (!value.startsWith('*') || value.slice(1).includes('*')) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_UNSUPPORTED' }
    const remainder = value.slice(1).startsWith('.') ? value.slice(2) : value.slice(1)
    if (!isHostname(remainder)) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
    return { ok: true, value }
  }
  if (isIpv4Candidate(value)) return isStrictIpv4(value) ? { ok: true, value } : { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
  if (!isHostname(value)) return { ok: false, code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }
  return { ok: true, value }
}

function isHostname(value: string) {
  if (!value || value.length > 253) return false
  const labels = value.split('.')
  return labels.every((label) => label.length >= 1 && label.length <= 63
    && /^[A-Za-z0-9-]+$/.test(label)
    && !label.startsWith('-') && !label.endsWith('-'))
}

function isIpv4Candidate(value: string) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)
    || /^(?:\d{1,3}\.){3}\*$/.test(value)
    || value.split('.').length === 4 && value.split('.').some((part) => /^\d+$/.test(part)) && value.includes('*')
}

function isStrictIpv4(value: string) {
  const parts = value.split('.')
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
}

function isIpv4Wildcard(value: string) {
  const parts = value.split('.')
  return parts.length === 4 && parts[3] === '*' && parts.slice(0, 3).every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
}

function serializedListBytes(value: readonly string[]) {
  try { return new TextEncoder().encode(value.join(', ')).byteLength } catch { return Number.POSITIVE_INFINITY }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null) && Object.getOwnPropertySymbols(value).length === 0
}

function hasExactKeys(value: object, allowed: readonly string[]) {
  const keys = Reflect.ownKeys(value)
  return keys.length <= allowed.length && keys.every((key) => typeof key === 'string' && allowed.includes(key))
}

function hasOwn(value: object, key: string) { return Object.prototype.hasOwnProperty.call(value, key) }
function hasNonEmptyString(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()) }

function isArrayIndex(name: string, length: number) {
  if (!/^(?:0|[1-9]\d*)$/.test(name)) return false
  const index = Number(name)
  return Number.isSafeInteger(index) && index >= 0 && index < length
}

export type TargetNativeGeneralProxyBypassConfig = TargetNativeSurgeGeneralProxyBypassConfig
export type TargetNativeGeneralProxyBypassIR = TargetNativeSurgeGeneralProxyBypassIR
export const isTargetNativeGeneralProxyBypassConfig = isTargetNativeSurgeGeneralProxyBypassConfig
export const isTargetNativeGeneralProxyBypassIR = isTargetNativeSurgeGeneralProxyBypassIR
export const targetNativeGeneralProxyBypassConfigToIR = targetNativeSurgeGeneralProxyBypassConfigToIR
