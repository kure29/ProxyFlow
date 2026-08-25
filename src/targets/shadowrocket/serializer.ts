import type { ShadowrocketGeneralEntry, ShadowrocketPolicyEntry, ShadowrocketProfile, ShadowrocketRule, ShadowrocketScalar } from './model'

export function serializeShadowrocketProfile(profile: ShadowrocketProfile) {
  assertUniqueKeys(profile.general)
  assertUniquePolicyNames([...profile.proxies, ...profile.proxyGroups])
  return [
    serializeSection('General', profile.general.map(serializeGeneral)),
    serializeSection('Proxy', profile.proxies.map(serializePolicy)),
    serializeSection('Proxy Group', profile.proxyGroups.map(serializePolicy)),
    serializeSection('Rule', profile.rules.map(serializeRule)),
  ].join('\n\n') + '\n'
}

function serializeGeneral(entry: ShadowrocketGeneralEntry) {
  assertSafeKey(entry.key)
  const value = typeof entry.value === 'object'
    ? entry.value.items.map(serializeToken).join(',')
    : serializeToken(entry.value)
  if (typeof entry.value === 'object' && entry.value.items.length === 0) throw new Error(`Shadowrocket [General] list "${entry.key}" must not be empty.`)
  return `${entry.key} = ${value}`
}

function serializePolicy(entry: ShadowrocketPolicyEntry) {
  assertSafeName(entry.name)
  assertSafeToken(entry.type)
  const group = ['select', 'url-test', 'fallback', 'load-balance'].includes(entry.type)
  const values = [entry.type, ...entry.arguments.map((value) => group && typeof value === 'string' ? serializeReference(value) : serializeToken(value)), ...(entry.parameters ?? []).map(({ key, value }) => {
    assertSafeKey(key)
    return `${key}=${serializeToken(value)}`
  })]
  return `${entry.name} = ${values.join(', ')}`
}

function serializeReference(value: string) {
  assertSafeName(value)
  return value
}

function serializeRule(rule: ShadowrocketRule) {
  assertSafeToken(rule.type)
  if (rule.payload !== undefined) assertSafeToken(rule.payload)
  assertSafeName(rule.policy)
  return [rule.type, ...(rule.payload === undefined ? [] : [serializeToken(rule.payload)]), rule.policy].join(',')
}

function serializeSection(name: string, lines: string[]) {
  return `[${name}]${lines.length ? `\n${lines.join('\n')}` : ''}`
}

export function serializeShadowrocketToken(value: ShadowrocketScalar) {
  return serializeToken(value)
}

function serializeToken(value: ShadowrocketScalar) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Shadowrocket numeric tokens must be finite.')
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  assertSafeToken(value)
  return /[,=\s]/.test(value) ? `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : value
}

export function isSafeShadowrocketPolicyName(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value) && value === value.trim() && !/[\r\n\u0000-\u001f\u007f]/.test(value)
    && !/[=,\\"]/.test(value) && !/^(?:#|;|\/\/)/.test(value)
}

function assertSafeName(value: string) {
  if (!isSafeShadowrocketPolicyName(value)) throw new Error('Shadowrocket policy names contain unsafe delimiters or control characters.')
}

function assertSafeKey(value: string) {
  if (!/^[a-z][a-z0-9-]*$/i.test(value)) throw new Error('Shadowrocket keys must use letters, numbers, and hyphens only.')
}

function assertSafeToken(value: string) {
  if (!value || value !== value.trim() || /[\r\n\u0000-\u001f\u007f]/.test(value) || /[,=\\"]/.test(value)) {
    throw new Error('Shadowrocket tokens contain an unsafe delimiter or control character.')
  }
}

function assertUniqueKeys(entries: ShadowrocketGeneralEntry[]) {
  const seen = new Set<string>()
  for (const entry of entries) {
    const key = entry.key.toLowerCase()
    if (seen.has(key)) throw new Error(`Duplicate Shadowrocket [General] key: ${entry.key}`)
    seen.add(key)
  }
}

function assertUniquePolicyNames(entries: ShadowrocketPolicyEntry[]) {
  const seen = new Set<string>()
  for (const entry of entries) {
    assertSafeName(entry.name)
    const key = entry.name.toLowerCase()
    if (seen.has(key)) throw new Error(`Duplicate Shadowrocket policy name: ${entry.name}`)
    seen.add(key)
  }
}
