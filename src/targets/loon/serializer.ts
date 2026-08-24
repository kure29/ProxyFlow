import type {
  LoonGeneralEntry,
  LoonQuotedLiteral,
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
  const type = rule.type === 'FINAL' ? 'final' : rule.type === 'GEOIP' ? 'geoip' : rule.type
  const components = rule.type === 'FINAL'
    ? [type, serializeLoonToken(rule.policy)]
    : [type, serializeLoonToken(rule.payload), serializeLoonToken(rule.policy), ...(rule.noResolve ? ['no-resolve'] : [])]
  return components.join(',')
}

export function serializeLoonToken(value: LoonScalar) {
  if (typeof value === 'object') {
    if (!isLoonQuotedLiteral(value)) {
      throw new Error('Loon quoted literals require a valid quoted scalar value.')
    }
    assertSafeLoonQuotedLiteral(value.value)
    // The pinned manual proves this fixed field form, but does not prove an
    // escaping grammar. The value is therefore emitted exactly as validated.
    return `"${value.value}"`
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Loon numeric tokens must be finite values.')
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  assertSafeToken(value)
  return value
}

function isLoonQuotedLiteral(value: unknown): value is LoonQuotedLiteral {
  return typeof value === 'object'
    && value !== null
    && (value as { kind?: unknown }).kind === 'quoted'
    && typeof (value as { value?: unknown }).value === 'string'
}

function assertSafeLoonQuotedLiteral(value: string) {
  if (!isProvenAscii(value)
    || !value
    || value !== value.trim()
    || /[,="\\]/.test(value)
    || /^(?:#|;|\/\/)/.test(value)
    || /\s(?:#|;|\/\/)/.test(value)) {
    throw new Error('Loon quoted literals require a non-empty printable ASCII value without delimiters, quotes, backslashes, control characters, Unicode, or outer whitespace.')
  }
}

export function isSafeLoonPolicyName(value: string) {
  return Boolean(value)
    && value === value.trim()
    && isProvenAscii(value)
    && !/[,=\r\n\u0000-\u001f\u007f-\u009f\u2028\u2029"\\]/.test(value)
    && !/^(?:#|;|\/\/)/.test(value)
    && !/\s(?:#|;|\/\/)/.test(value)
}

function serializeSection(name: string, lines: string[]) {
  return `[${name}]${lines.length ? `\n${lines.join('\n')}` : ''}`
}

function assertSafeKey(value: string, owner: string) {
  assertSafeToken(value)
  if (!/^[a-z][a-z0-9-]*$/i.test(value)) throw new Error(`${owner} keys must use letters, numbers, and hyphens only.`)
}

function assertSafeToken(value: string) {
  if (!isProvenAscii(value)
    || !value
    || value !== value.trim()
    || /[,="\\]/.test(value)
    || /^(?:#|;|\/\/)/.test(value)
    || /\s(?:#|;|\/\/)/.test(value)) {
    throw new Error('Loon tokens require a non-empty printable ASCII value without delimiters, quotes, backslashes, or ambiguous comments.')
  }
}

function isProvenAscii(value: string) {
  // The pinned manual shows simple ASCII examples but does not prove Unicode
  // round-tripping or an escape grammar for arbitrary token values.
  return /^[\x20-\x7e]*$/.test(value)
}
