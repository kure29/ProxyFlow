import { isSafeSurgeHttpUrl, isSafeSurgeSerializedString } from './safety'
import { isSupportedSurgeAlwaysRealIpPattern, SURGE_VIF_ROUTE_MAX_ITEMS, SURGE_VIF_ROUTE_MAX_SERIALIZED_BYTES } from '../../core/targetNative'
import { isCanonicalCidr } from '../../core/network/cidr'

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
  'internet-test-url': string
  'dns-server': SurgeGeneralList<string>
  'encrypted-dns-server': SurgeGeneralList<string>
  'always-real-ip': SurgeGeneralList<string>
  ipv6: boolean
  'ipv6-vif': 'disabled' | 'auto' | 'always'
  'icmp-forwarding': boolean
  'tun-excluded-routes': SurgeGeneralList<string>
  'tun-included-routes': SurgeGeneralList<string>
}

export type SurgeGeneralEntry = {
  [Key in keyof SurgeGeneralValueMap]: { key: Key; value: SurgeGeneralValueMap[Key] }
}[keyof SurgeGeneralValueMap]

const GENERAL_ENTRY_KEYS = ['key', 'value'] as const
const GENERAL_LIST_KEYS = ['kind', 'items'] as const
const GENERAL_KEYS = new Set<keyof SurgeGeneralValueMap>([
  'proxy-test-url', 'internet-test-url', 'dns-server', 'encrypted-dns-server', 'always-real-ip', 'ipv6', 'ipv6-vif', 'icmp-forwarding', 'tun-excluded-routes', 'tun-included-routes',
])

/** Runtime guard for the exact current Surge [General] entry boundary. */
export function isSurgeGeneralEntry(value: unknown): value is SurgeGeneralEntry {
  if (!isExactRecord(value, GENERAL_ENTRY_KEYS)) return false
  const key = value.key
  if (typeof key !== 'string') return false
  if (!GENERAL_KEYS.has(key as keyof SurgeGeneralValueMap)) return false
  if (key === 'proxy-test-url' || key === 'internet-test-url') return isSafeSurgeHttpUrl(value.value)
  if (key === 'dns-server' || key === 'encrypted-dns-server') return isSurgeGeneralList(value.value)
  if (key === 'always-real-ip') return isSurgeAlwaysRealIpList(value.value)
  if (key === 'tun-excluded-routes' || key === 'tun-included-routes') return isSurgeVifRouteList(value.value)
  if (key === 'ipv6' || key === 'icmp-forwarding') return typeof value.value === 'boolean'
  return value.value === 'disabled' || value.value === 'auto' || value.value === 'always'
}

function isSurgeVifRouteList(value: unknown): value is SurgeGeneralList<string> {
  if (!isSurgeGeneralList(value)) return false
  let serializedBytes = Number.POSITIVE_INFINITY
  try { serializedBytes = new TextEncoder().encode(JSON.stringify(value.items)).byteLength } catch { return false }
  return value.items.length <= SURGE_VIF_ROUTE_MAX_ITEMS
    && serializedBytes <= SURGE_VIF_ROUTE_MAX_SERIALIZED_BYTES
    && value.items.every((item) => isCanonicalCidr(item))
    && new Set(value.items).size === value.items.length
}

function isSurgeAlwaysRealIpList(value: unknown): value is SurgeGeneralList<string> {
  if (!isSurgeGeneralList(value)) return false
  return value.items.every((item) => isSupportedSurgeAlwaysRealIpPattern(item))
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
