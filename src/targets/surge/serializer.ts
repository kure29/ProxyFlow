import { isSurgeGeneralEntry, type SurgeGeneralEntry, type SurgePolicyEntry, type SurgeProfile, type SurgeSmartPolicyEntry, type SurgeSubnetPolicyEntry } from './model'

export function serializeSurgeProfile(profile: SurgeProfile) {
  assertValidGeneralEntries((profile as { general?: unknown } | null | undefined)?.general)
  assertUniqueGeneralKeys(profile.general)
  return [
    serializeSection('General', profile.general.map(serializeGeneralEntry)),
    serializeSection('Proxy', profile.proxies.map(serializePolicyEntry)),
    serializeSection('Proxy Group', profile.proxyGroups.map(serializePolicyEntry)),
    serializeSection('Rule', profile.rules),
  ].join('\n\n') + '\n'
}

function assertValidGeneralEntries(value: unknown): asserts value is SurgeGeneralEntry[] {
  if (!Array.isArray(value)) throw new Error('Surge [General] entries must be an array.')
  for (const [index, entry] of value.entries()) {
    if (!isSurgeGeneralEntry(entry)) throw new Error(`Invalid Surge [General] entry at index ${index}.`)
  }
}

function serializeGeneralEntry({ key, value }: SurgeGeneralEntry) {
  if (typeof value === 'object') {
    if (value.items.length === 0) throw new Error(`Surge [General] list “${key}” must not be empty.`)
    return `${key} = ${value.items.map(serializeSurgeToken).join(', ')}`
  }
  return `${key} = ${serializeSurgeToken(value)}`
}

function assertUniqueGeneralKeys(entries: SurgeGeneralEntry[]) {
  const keys = new Set<string>()
  for (const entry of entries) {
    const normalized = entry.key.toLowerCase()
    if (keys.has(normalized)) throw new Error(`Duplicate Surge [General] key: ${entry.key}`)
    keys.add(normalized)
  }
}

export function serializePolicyEntry(entry: SurgePolicyEntry) {
  if (entry.type === 'subnet' && isTypedSubnetEntry(entry)) return serializeSubnetPolicyEntry(entry)
  if (entry.type === 'smart' && isTypedSmartEntry(entry)) return serializeSmartPolicyEntry(entry)
  const components = [
    entry.type,
    ...entry.arguments.map(serializeSurgeToken),
    ...(entry.parameters ?? []).map(({ key, value }) => `${key}=${serializeSurgeToken(value)}`),
  ]
  return `${entry.name} = ${components.join(', ')}`
}

/** Serialize the native Subnet grammar (`matcher = policy`) from typed data. */
function serializeSubnetPolicyEntry(entry: SurgeSubnetPolicyEntry) {
  const conditions = entry.conditions.map(({ expression, policy }) => `${serializeSurgeToken(expression)} = ${serializeSurgeToken(policy)}`)
  const mappings = [`default = ${serializeSurgeToken(entry.defaultPolicy)}`, ...conditions]
  const parameters = (entry.parameters ?? []).map(({ key, value }) => `${key}=${serializeSurgeToken(value)}`)
  return `${entry.name} = subnet, ${[...mappings, ...parameters].join(', ')}`
}

/** Serialize Smart members and its modeled optional scoring parameters. */
function serializeSmartPolicyEntry(entry: SurgeSmartPolicyEntry) {
  const components = [
    'smart',
    ...entry.arguments.map(serializeSurgeToken),
    ...(entry.policyPriority?.length
      ? [`policy-priority=${serializeSurgeQuotedToken(entry.policyPriority.map(({ pattern, factor }) => `${pattern}:${factor}`).join(';'))}`]
      : []),
    ...(entry.evaluateBeforeUse === undefined ? [] : [`evaluate-before-use=${entry.evaluateBeforeUse ? 'true' : 'false'}`]),
    ...(entry.parameters ?? []).map(({ key, value }) => `${key}=${serializeSurgeToken(value)}`),
  ]
  return `${entry.name} = ${components.join(', ')}`
}

function isTypedSubnetEntry(entry: SurgePolicyEntry): entry is SurgeSubnetPolicyEntry {
  return 'defaultPolicy' in entry && typeof (entry as { defaultPolicy?: unknown }).defaultPolicy === 'string'
    && Array.isArray((entry as { conditions?: unknown }).conditions)
}

function isTypedSmartEntry(entry: SurgePolicyEntry): entry is SurgeSmartPolicyEntry {
  if (entry.type !== 'smart') return false
  const candidate = entry as { policyPriority?: unknown; evaluateBeforeUse?: unknown }
  if (candidate.policyPriority !== undefined && !Array.isArray(candidate.policyPriority)) return false
  if (candidate.evaluateBeforeUse !== undefined && typeof candidate.evaluateBeforeUse !== 'boolean') return false
  return true
}

export interface SurgeRuleOptions {
  noResolve?: true
}

export function serializeSurgeRule(type: string, payload: string | undefined, policy: string, options: SurgeRuleOptions = {}) {
  if (options.noResolve !== undefined && options.noResolve !== true) throw new Error('Surge rule options are invalid.')
  if (options.noResolve && !['IP-CIDR', 'IP-CIDR6', 'GEOIP', 'IP-ASN', 'RULE-SET'].includes(type)) throw new Error(`Surge no-resolve is not supported for ${type} rules.`)
  assertSurgeRuleTokens([type, payload, policy])
  return [type, ...(payload === undefined ? [] : [serializeSurgeToken(payload)]), serializeSurgeToken(policy), ...(options.noResolve ? ['no-resolve'] : [])].join(',')
}

export interface SurgeFinalRuleOptions {
  dnsFailed?: true
}

/** Serialize the typed Surge FINAL grammar, including target-native modifiers. */
export function serializeSurgeFinalRule(policy: string, options: SurgeFinalRuleOptions = {}) {
  if (options.dnsFailed !== undefined && options.dnsFailed !== true) throw new Error('Surge FINAL options are invalid.')
  if (!options.dnsFailed) return serializeSurgeRule('FINAL', undefined, policy)
  assertSurgeRuleTokens(['FINAL', policy, 'dns-failed'], true)
  return ['FINAL', serializeSurgeToken(policy), 'dns-failed'].join(',')
}

export function serializeSurgeToken(value: string | number | boolean) {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (!needsQuoting(value)) return value
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function serializeSurgeQuotedToken(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

export function isSafeSurgePolicyName(value: string) {
  return Boolean(value)
    && value === value.trim()
    && !/[,=\r\n\u0000-\u001f\u007f"\\]/.test(value)
    && !/^(?:#|;|\/\/)/.test(value)
    && !/\s(?:#|;|\/\/)/.test(value)
}

function serializeSection(name: string, lines: string[]) {
  return `[${name}]${lines.length ? `\n${lines.join('\n')}` : ''}`
}

function assertSurgeRuleTokens(values: Array<string | undefined>, rejectControls = false) {
  for (const value of values) {
    const unsafe = rejectControls ? /[\u0000-\u001f\u007f]/ : /[\r\n\u0000]/
    if (value !== undefined && unsafe.test(value)) throw new Error('Surge rule tokens must be single-line values.')
  }
}

function needsQuoting(value: string) {
  return value.length === 0
    || value !== value.trim()
    || /[,="\\]/.test(value)
    || /\s(?:#|;|\/\/)/.test(value)
}
