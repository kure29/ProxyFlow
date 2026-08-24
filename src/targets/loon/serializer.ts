import type {
  LoonGeneralEntry,
  LoonPolicyEntry,
  LoonProfile,
  LoonRule,
  LoonScalar,
} from './model'

export function serializeLoonProfile(profile: LoonProfile) {
  assertUniqueGeneralKeys(profile.general)
  return [
    serializeSection('General', profile.general.map(serializeGeneralEntry)),
    serializeSection('Proxy', profile.proxies.map(serializeLoonPolicyEntry)),
    serializeSection('Proxy Group', profile.proxyGroups.map(serializeLoonPolicyEntry)),
    serializeSection('Rule', profile.rules.map(serializeLoonRule)),
  ].join('\n\n') + '\n'
}

function serializeGeneralEntry({ key, value }: LoonGeneralEntry) {
  assertSafeKey(key, 'Loon [General]')
  if (value.items.length === 0) throw new Error(`Loon [General] list "${key}" must not be empty.`)
  return `${key} = ${value.items.map(serializeLoonToken).join(',')}`
}

function assertUniqueGeneralKeys(entries: LoonGeneralEntry[]) {
  const keys = new Set<string>()
  for (const entry of entries) {
    const normalized = entry.key.toLowerCase()
    if (keys.has(normalized)) throw new Error(`Duplicate Loon [General] key: ${entry.key}`)
    keys.add(normalized)
  }
}

export function serializeLoonPolicyEntry(entry: LoonPolicyEntry) {
  if (!isSafeLoonPolicyName(entry.name)) {
    throw new Error('Loon policy names must be non-empty, trimmed values without delimiters, quotes, backslashes, comments, or control characters.')
  }
  const components = [
    serializeLoonToken(entry.type),
    ...entry.arguments.map(serializeLoonToken),
    ...(entry.parameters ?? []).map(({ key, value }) => {
      assertSafeKey(key, 'Loon parameter')
      return `${key}=${serializeLoonToken(value)}`
    }),
  ]
  return `${entry.name} = ${components.join(',')}`
}

export function serializeLoonRule(rule: LoonRule) {
  const components = rule.type === 'FINAL'
    ? [rule.type, serializeLoonToken(rule.policy)]
    : [rule.type, serializeLoonToken(rule.payload), serializeLoonToken(rule.policy), ...(rule.noResolve ? ['no-resolve'] : [])]
  return components.join(',')
}

export function serializeLoonToken(value: LoonScalar) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Loon numeric tokens must be finite values.')
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  assertSafeText(value)
  if (!needsQuoting(value)) return value
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

export function isSafeLoonPolicyName(value: string) {
  return Boolean(value)
    && value === value.trim()
    && !/[,=\r\n\u0000-\u001f\u007f-\u009f\u2028\u2029"\\]/.test(value)
    && !/^(?:#|;|\/\/)/.test(value)
    && !/\s(?:#|;|\/\/)/.test(value)
}

function serializeSection(name: string, lines: string[]) {
  return `[${name}]${lines.length ? `\n${lines.join('\n')}` : ''}`
}

function assertSafeKey(value: string, owner: string) {
  assertSafeText(value)
  if (!/^[a-z][a-z0-9-]*$/i.test(value)) throw new Error(`${owner} keys must use letters, numbers, and hyphens only.`)
}

function assertSafeText(value: string) {
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) {
    throw new Error('Loon tokens must not contain control or line-separator characters.')
  }
}

function needsQuoting(value: string) {
  return value.length === 0
    || value !== value.trim()
    || /[,="\\]/.test(value)
    || /^(?:#|;|\/\/)/.test(value)
    || /\s(?:#|;|\/\/)/.test(value)
}
