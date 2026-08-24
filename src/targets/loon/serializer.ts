import type {
  LoonGeneralEntry,
  LoonQuotedLiteral,
  LoonPolicyEntry,
  LoonProfile,
  LoonRemoteRule,
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
    serializeSection('Remote Rule', profile.remoteRules.map(serializeLoonRemoteRule)),
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
    throw new Error('Loon policy names must be non-empty, trimmed values without delimiters, quotes, backslashes, comments, or control characters; syntax-safe Unicode is allowed.')
  }
  const groupArguments = isPolicyGroupType(entry.type)
  const components = [
    serializeLoonToken(entry.type),
    ...entry.arguments.map((value) => groupArguments ? serializeLoonPolicyReference(value) : serializeLoonToken(value)),
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
    ? [type, serializeLoonPolicyReference(rule.policy)]
    : [type, serializeLoonToken(rule.payload), serializeLoonPolicyReference(rule.policy), ...(rule.noResolve ? ['no-resolve'] : [])]
  return components.join(',')
}

export function serializeLoonRemoteRule(rule: LoonRemoteRule) {
  if (rule.enabled !== true) throw new Error('Loon Remote Rules must be explicitly enabled.')
  if (!isSafeLoonRemoteRuleUrl(rule.url)) {
    throw new Error('Loon Remote Rule URLs must be absolute HTTPS URLs without credentials, delimiters, whitespace, or control characters.')
  }
  return `${rule.url},policy=${serializeLoonPolicyReference(rule.policy)},enabled=true`
}

export function isSafeLoonRemoteRuleUrl(value: string) {
  const authority = value.startsWith('https://')
    ? value.slice('https://'.length).split(/[/?#]/, 1)[0]
    : ''
  if (!value
    || !/^https:\/\/[^/?#]+(?:[/?#]|$)/.test(value)
    || authority.includes('@')
    || value !== value.trim()
    || !/^[\x21-\x7e]+$/.test(value)
    || /[,"\\]/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

export function serializeLoonToken(value: LoonScalar) {
  if (typeof value === 'object') {
    if (!isLoonQuotedLiteral(value)) {
      throw new Error('Loon quoted literals require a valid quoted scalar value.')
    }
    assertSafeLoonQuotedLiteral(value.value, value.grammar)
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
    && ((value as { grammar?: unknown }).grammar === undefined || (value as { grammar?: unknown }).grammar === 'http-username')
}

function assertSafeLoonQuotedLiteral(value: string, grammar?: LoonQuotedLiteral['grammar']) {
  if (!isProvenAscii(value)
    || !value
    || value !== value.trim()
    || (grammar !== 'http-username' && value.includes(','))
    || /["\\]/.test(value)
    || /^(?:#|;|\/\/)/.test(value)
    || /\s(?:#|;|\/\/)/.test(value)) {
    throw new Error('Loon quoted literals require a non-empty printable ASCII value without unproven commas, quotes, backslashes, control characters, Unicode, or outer whitespace.')
  }
}

export function isSafeLoonPolicyName(value: string) {
  return Boolean(value)
    && value === value.trim()
    && !hasUnpairedSurrogate(value)
    && !/[,=\r\n\u0000-\u001f\u007f-\u009f\u2028\u2029"\\]/.test(value)
    && !/^(?:#|;|\/\/)/.test(value)
    && !/\s(?:#|;|\/\/)/.test(value)
}

/** Policy/group references use the same left-hand name grammar verbatim. */
export function serializeLoonPolicyReference(value: LoonScalar) {
  if (typeof value !== 'string') {
    throw new Error('Loon policy references must be string policy names.')
  }
  if (!isSafeLoonPolicyName(value)) {
    throw new Error('Loon policy references must use a non-empty, trimmed policy name without delimiters, comments, or control characters.')
  }
  return value
}

function isPolicyGroupType(type: string): type is 'select' | 'url-test' | 'fallback' | 'load-balance' {
  return type === 'select' || type === 'url-test' || type === 'fallback' || type === 'load-balance'
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

function hasUnpairedSurrogate(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}
