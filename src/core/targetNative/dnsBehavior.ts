import { isSafeSurgeSerializedString } from './safety'

export type TargetNativeSurgeDnsBehaviorTarget = 'surge'
export type TargetNativeSurgeDnsBehaviorKind = 'dns-behavior'

/** DNS-node-owned Surge Host List intent. */
export interface TargetNativeSurgeDnsBehaviorConfig {
  target: TargetNativeSurgeDnsBehaviorTarget
  kind: TargetNativeSurgeDnsBehaviorKind
  alwaysRealIp: string[]
}

export interface TargetNativeSurgeDnsBehaviorIR extends TargetNativeSurgeDnsBehaviorConfig {
  /** Compiler-owned effective DNS graph owner identity. */
  dnsNodeId: string
}

const CONFIG_KEYS = ['target', 'kind', 'alwaysRealIp'] as const
const IR_KEYS = ['dnsNodeId', 'target', 'kind', 'alwaysRealIp'] as const

export function isTargetNativeSurgeDnsBehaviorConfig(
  value: unknown,
): value is TargetNativeSurgeDnsBehaviorConfig {
  return isDnsBehaviorShape(value, false)
}

export function isTargetNativeSurgeDnsBehaviorIR(
  value: unknown,
): value is TargetNativeSurgeDnsBehaviorIR {
  return isDnsBehaviorShape(value, true)
}

/** Bind a validated Project config to the compiler-selected DNS owner. */
export function targetNativeSurgeDnsBehaviorConfigToIR(
  dnsNodeId: string,
  config: TargetNativeSurgeDnsBehaviorConfig,
): TargetNativeSurgeDnsBehaviorIR {
  const snapshot = structuredClone(config)
  return { ...snapshot, alwaysRealIp: deduplicateAlwaysRealIpPatterns(snapshot.alwaysRealIp), dnsNodeId }
}

/** Canonicalize authored lines without changing pattern semantics. */
export function parseSurgeAlwaysRealIpDraft(value: unknown):
  | { ok: true; patterns: string[] }
  | { ok: false; invalidPattern: string } {
  if (typeof value !== 'string') return { ok: false, invalidPattern: '<invalid draft>' }
  const patterns = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  for (const pattern of patterns) {
    if (!isSupportedSurgeAlwaysRealIpPattern(pattern)) return { ok: false, invalidPattern: pattern }
  }
  return { ok: true, patterns: deduplicateAlwaysRealIpPatterns(patterns) }
}

export function deduplicateAlwaysRealIpPatterns(values: readonly string[]) {
  return [...new Set(values)]
}

/** Conservative positive-domain Host List subset for Surge always-real-ip. */
export function isSupportedSurgeAlwaysRealIpPattern(value: unknown): value is string {
  if (!isSafeSurgeSerializedString(value) || !value || value !== value.trim() || value.length > 253) return false
  if (value.includes(',') || /\s/.test(value)) return false
  if (value === '*' || value === '?') return true
  const labels = value.split('.')
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63)) return false
  // Keep this Slice domain-only; IP literals/ranges and CIDRs are outside the
  // proven positive-domain Host List subset.
  if (labels.every((label) => /^\d+$/.test(label))) return false
  return labels.every((label) => /^[A-Za-z0-9*?-]+$/.test(label)
    && !label.startsWith('-') && !label.endsWith('-'))
}

function isDnsBehaviorShape(
  value: unknown,
  ir: boolean,
): value is TargetNativeSurgeDnsBehaviorConfig | TargetNativeSurgeDnsBehaviorIR {
  try {
    if (!isPlainRecord(value)) return false
    const candidate = value as Record<string, unknown>
    const allowed = ir ? IR_KEYS : CONFIG_KEYS
    const required = ir ? IR_KEYS : CONFIG_KEYS
    if (!hasExactKeys(value, allowed) || !required.every((key) => hasOwn(candidate, key))) return false
    if (candidate.target !== 'surge' || candidate.kind !== 'dns-behavior') return false
    if (ir && !hasNonEmptyString(candidate.dnsNodeId)) return false
    if (!Array.isArray(candidate.alwaysRealIp) || candidate.alwaysRealIp.length === 0) return false
    if (Object.getPrototypeOf(candidate.alwaysRealIp) !== Array.prototype
      || Object.getOwnPropertySymbols(candidate.alwaysRealIp).length > 0) return false
    const patterns = candidate.alwaysRealIp as string[]
    const names = Object.getOwnPropertyNames(patterns)
    if (names.some((name) => name !== 'length' && !isArrayIndex(name, patterns.length))) return false
    for (let index = 0; index < patterns.length; index += 1) {
      if (!hasOwn(patterns, String(index))) return false
      if (!isSupportedSurgeAlwaysRealIpPattern(patterns[index])) return false
    }
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

function isArrayIndex(name: string, length: number) {
  if (!/^(?:0|[1-9]\d*)$/.test(name)) return false
  const index = Number(name)
  return Number.isSafeInteger(index) && index >= 0 && index < length
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

export type TargetNativeDnsBehaviorConfig = TargetNativeSurgeDnsBehaviorConfig
export type TargetNativeDnsBehaviorIR = TargetNativeSurgeDnsBehaviorIR
export const isTargetNativeDnsBehaviorConfig = isTargetNativeSurgeDnsBehaviorConfig
export const isTargetNativeDnsBehaviorIR = isTargetNativeSurgeDnsBehaviorIR
export const targetNativeDnsBehaviorConfigToIR = targetNativeSurgeDnsBehaviorConfigToIR
