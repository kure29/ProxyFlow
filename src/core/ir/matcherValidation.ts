import type { TrafficMatcherIR } from './routing'

export type MatcherValidationCode =
  | 'ROUTE_DOMAIN_INVALID'
  | 'ROUTE_CIDR_INVALID'
  | 'ROUTE_PORT_INVALID'
  | 'ROUTE_ASN_INVALID'
  | 'ROUTE_GEO_INVALID'
  | 'ROUTE_MATCHER_INVALID'

export type CustomMatcherKind = Exclude<TrafficMatcherIR['kind'], 'service'>

export type NormalizedCustomMatcher = Exclude<TrafficMatcherIR, { kind: 'service' }>

export type MatcherValidationResult =
  | { ok: true; matcher: NormalizedCustomMatcher }
  | { ok: false; code: MatcherValidationCode }

export function normalizeCustomMatcher(kind: CustomMatcherKind, rawValue?: unknown, rawPort?: unknown): MatcherValidationResult {
  if (kind === 'port') {
    const port = normalizeInteger(rawPort)
    return Number.isInteger(port) && port >= 1 && port <= 65_535
      ? { ok: true, matcher: { kind, port } }
      : { ok: false, code: 'ROUTE_PORT_INVALID' }
  }

  const value = typeof rawValue === 'string' ? rawValue.trim() : ''
  if (!value) return { ok: false, code: 'ROUTE_MATCHER_INVALID' }

  if (kind === 'asn') {
    const match = value.match(/^(?:AS)?(\d+)$/i)
    const number = match ? Number(match[1]) : NaN
    return Number.isSafeInteger(number) && number >= 1 && number <= 4_294_967_295
      ? { ok: true, matcher: { kind, value: number } }
      : { ok: false, code: 'ROUTE_ASN_INVALID' }
  }

  if (kind === 'geo-ip') {
    return /^[A-Za-z]{2}$/.test(value)
      ? { ok: true, matcher: { kind, countryCode: value.toUpperCase() } }
      : { ok: false, code: 'ROUTE_GEO_INVALID' }
  }

  if (kind === 'geo-site') {
    return isSafePayload(value)
      ? { ok: true, matcher: { kind, category: value } }
      : { ok: false, code: 'ROUTE_GEO_INVALID' }
  }

  if (kind === 'rule-set') {
    return isSafePayload(value)
      ? { ok: true, matcher: { kind, id: value } }
      : { ok: false, code: 'ROUTE_MATCHER_INVALID' }
  }

  if (kind === 'ip-cidr' || kind === 'ip-cidr6') {
    const valid = kind === 'ip-cidr' ? isCidr(value, false) : isCidr(value, true)
    return valid
      ? { ok: true, matcher: { kind, value } }
      : { ok: false, code: 'ROUTE_CIDR_INVALID' }
  }

  if (kind === 'domain' || kind === 'domain-suffix' || kind === 'domain-keyword') {
    return isDomainValue(value, kind)
      ? { ok: true, matcher: { kind, value } }
      : { ok: false, code: 'ROUTE_DOMAIN_INVALID' }
  }

  return { ok: false, code: 'ROUTE_MATCHER_INVALID' }
}

export function validateMatcherIR(matcher: TrafficMatcherIR): MatcherValidationCode | undefined {
  if (matcher.kind === 'service') return matcher.serviceIds.length ? undefined : 'ROUTE_MATCHER_INVALID'
  const result = matcher.kind === 'port'
    ? normalizeCustomMatcher(matcher.kind, undefined, matcher.port)
    : matcher.kind === 'asn'
      ? normalizeCustomMatcher(matcher.kind, String(matcher.value))
      : matcher.kind === 'geo-ip'
        ? normalizeCustomMatcher(matcher.kind, matcher.countryCode)
        : matcher.kind === 'geo-site'
          ? normalizeCustomMatcher(matcher.kind, matcher.category)
          : matcher.kind === 'rule-set'
            ? normalizeCustomMatcher(matcher.kind, matcher.id)
            : normalizeCustomMatcher(matcher.kind, matcher.value)
  return result.ok ? undefined : result.code
}

/**
 * Runtime boundary guard for deserialised matcher records.
 *
 * Universal IR validation performs semantic checks on typed values, but
 * target-native compiler extensions must also reject unknown own keys before
 * they can be silently stripped by a target serializer.
 */
export function isExactTrafficMatcherIR(value: unknown): value is TrafficMatcherIR {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const kind = candidate.kind
  if (kind === 'service') {
    if (!hasExactKeys(value, ['kind', 'serviceIds']) || !Array.isArray(candidate.serviceIds)
      || !candidate.serviceIds.every((id) => typeof id === 'string' && Boolean(id.trim()))) return false
  } else if (kind === 'domain' || kind === 'domain-suffix' || kind === 'domain-keyword'
    || kind === 'ip-cidr' || kind === 'ip-cidr6') {
    if (!hasExactKeys(value, ['kind', 'value']) || typeof candidate.value !== 'string') return false
  } else if (kind === 'port') {
    if (!hasExactKeys(value, ['kind', 'port']) || typeof candidate.port !== 'number') return false
  } else if (kind === 'asn') {
    if (!hasExactKeys(value, ['kind', 'value']) || typeof candidate.value !== 'number') return false
  } else if (kind === 'geo-ip') {
    if (!hasExactKeys(value, ['kind', 'countryCode']) || typeof candidate.countryCode !== 'string') return false
  } else if (kind === 'geo-site') {
    if (!hasExactKeys(value, ['kind', 'category']) || typeof candidate.category !== 'string') return false
  } else if (kind === 'rule-set') {
    if (!hasExactKeys(value, ['kind', 'id']) || typeof candidate.id !== 'string') return false
  } else {
    return false
  }

  return validateMatcherIR(value as TrafficMatcherIR) === undefined
}

function hasExactKeys(value: object, allowed: readonly string[]) {
  const keys = Reflect.ownKeys(value)
  return keys.length === allowed.length
    && keys.every((key) => typeof key === 'string' && allowed.includes(key))
}

function normalizeInteger(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return NaN
}

function isSafePayload(value: string) {
  return value.length > 0 && !/[\u0000-\u001f,\r\n]/.test(value)
}

function isDomainValue(value: string, kind: 'domain' | 'domain-suffix' | 'domain-keyword') {
  if (!isSafePayload(value) || value.length > 253 || /:\/\//.test(value) || /[\\/?#]/.test(value)) return false
  if (value.includes(':') || value.includes('*') || value.startsWith('.') || value.endsWith('.') || value.includes('..')) return false
  if (kind === 'domain-suffix' && value.startsWith('*.')) return false
  return value.split('.').every((label) => label.length > 0 && !/^[.-]|[-.]$/.test(label) && !/[\s:]/.test(label))
}

function isCidr(value: string, ipv6: boolean) {
  const parts = value.split('/')
  if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return false
  const prefix = Number(parts[1])
  if (ipv6) return prefix >= 0 && prefix <= 128 && isIpv6(parts[0])
  return prefix >= 0 && prefix <= 32 && isIpv4(parts[0])
}

function isIpv4(value: string) {
  const parts = value.split('.')
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
}

function isIpv6(value: string) {
  if (!value || value.includes('%')) return false
  const halves = value.split('::')
  if (halves.length > 2) return false
  const parseGroups = (part: string) => {
    if (!part) return []
    const groups = part.split(':')
    const last = groups.at(-1)!
    if (last.includes('.')) {
      if (!isIpv4(last)) return undefined
      groups.splice(-1, 1, '0', '0')
    }
    return groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group)) ? groups : undefined
  }
  const left = parseGroups(halves[0])
  const right = parseGroups(halves.length === 2 ? halves[1] : '')
  if (!left || !right) return false
  const count = left.length + right.length
  return halves.length === 2 ? count < 8 : count === 8
}
