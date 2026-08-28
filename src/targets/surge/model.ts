import { isSafeSurgeHttpUrl, isSafeSurgeSerializedString } from './safety'

export interface SurgeParameter {
  key: string
  value: string | number | boolean
}

export interface SurgeGeneralList<Item extends string | number | boolean = string> {
  kind: 'list'
  items: Item[]
}

export interface SurgeGeneralValueMap {
  'proxy-test-url': string
  'dns-server': SurgeGeneralList<string>
  'encrypted-dns-server': SurgeGeneralList<string>
}

export type SurgeGeneralEntry = {
  [Key in keyof SurgeGeneralValueMap]: { key: Key; value: SurgeGeneralValueMap[Key] }
}[keyof SurgeGeneralValueMap]

const GENERAL_ENTRY_KEYS = ['key', 'value'] as const
const GENERAL_LIST_KEYS = ['kind', 'items'] as const
const GENERAL_KEYS = new Set<keyof SurgeGeneralValueMap>([
  'proxy-test-url', 'dns-server', 'encrypted-dns-server',
])

/** Runtime guard for the exact current Surge [General] entry boundary. */
export function isSurgeGeneralEntry(value: unknown): value is SurgeGeneralEntry {
  if (!isExactRecord(value, GENERAL_ENTRY_KEYS)) return false
  const key = value.key
  if (typeof key !== 'string') return false
  if (!GENERAL_KEYS.has(key as keyof SurgeGeneralValueMap)) return false
  if (key === 'proxy-test-url') return isSafeSurgeHttpUrl(value.value)
  return isSurgeGeneralList(value.value)
}

function isSurgeGeneralList(value: unknown): value is SurgeGeneralList<string> {
  if (!isExactRecord(value, GENERAL_LIST_KEYS) || value.kind !== 'list') return false
  const items = value.items
  if (!Array.isArray(items) || items.length === 0) return false
  if (Object.getPrototypeOf(items) !== Array.prototype || Object.getOwnPropertySymbols(items).length > 0) return false
  const ownNames = Object.getOwnPropertyNames(items)
  if (ownNames.some((name) => name !== 'length' && !isArrayIndex(name, items.length))) return false
  for (let index = 0; index < items.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(items, String(index))) return false
    if (!isSafeSurgeSerializedString(items[index])) return false
  }
  return true
}

function isArrayIndex(name: string, length: number) {
  if (!/^(?:0|[1-9]\d*)$/.test(name)) return false
  const index = Number(name)
  return Number.isSafeInteger(index) && index >= 0 && index < length
}

function isExactRecord(value: unknown, allowedKeys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  if (Object.getOwnPropertySymbols(value).length > 0) return false
  const ownKeys = Object.getOwnPropertyNames(value)
  return ownKeys.length === allowedKeys.length && ownKeys.every((key) => allowedKeys.includes(key))
}

export interface SurgePolicyEntry {
  name: string
  type: string
  arguments: Array<string | number>
  parameters?: SurgeParameter[]
}

export interface SurgeSmartPolicyEntry extends SurgePolicyEntry {
  type: 'smart'
  arguments: string[]
  policyPriority?: SurgePolicyPriorityRule[]
  evaluateBeforeUse?: boolean
}

export interface SurgeSubnetPolicyEntry extends SurgePolicyEntry {
  type: 'subnet'
  /** Subnet entries are serialized from these typed fields, never as tokens. */
  arguments: []
  defaultPolicy: string
  conditions: SurgeSubnetConditionEntry[]
}

export interface SurgePolicyPriorityRule {
  pattern: string
  factor: number
}

export interface SurgeSubnetConditionEntry {
  expression: string
  policy: string
}

export type SurgeNativePolicyEntry = SurgeSmartPolicyEntry | SurgeSubnetPolicyEntry

export interface SurgeProfile {
  general: SurgeGeneralEntry[]
  proxies: SurgePolicyEntry[]
  proxyGroups: SurgePolicyEntry[]
  rules: string[]
}
