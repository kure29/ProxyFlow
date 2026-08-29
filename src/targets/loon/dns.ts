import type { DnsIR } from '../../core/ir'
import { projectDnsOwnership, type SharedDnsResolverIntent } from '../../core/dns/ownership'
import type { CompatibilityIssue } from '../../types/project'
import { loonIssue } from './errors'
import type { LoonGeneralEntry } from './model'

export interface LoonDnsPlan {
  general: LoonGeneralEntry[]
  issues: CompatibilityIssue[]
}

type ParsedResolver = {
  resolver: SharedDnsResolverIntent
  transport: 'traditional' | 'doh'
  value: string
  identity: string
}

export function planLoonDns(dns: DnsIR | undefined): LoonDnsPlan {
  const ownership = projectDnsOwnership(dns)
  const shared = ownership.shared
  if (!shared || shared.mode === 'automatic') return { general: [], issues: [] }

  const issues: CompatibilityIssue[] = []
  const rawResolvers = dns?.resolvers ?? []
  const resolvers = shared.resolvers ?? []
  const { directResolvers, fallbackResolvers } = ownership.targetSpecific.mihomo
  if (rawResolvers.length === 0) {
    issues.push(loonIssue(
      'LOON_DNS_CUSTOM_EMPTY', 'error', 'dns',
      'Custom DNS mode requires at least one resolver before it can be lowered to Loon.', 'dns',
    ))
    return { general: [], issues }
  }

  const resolverIds = new Set<string>()
  for (const resolver of rawResolvers) {
    if (resolverIds.has(resolver.id)) issues.push(loonIssue(
      'LOON_DNS_RESOLVER_ID_DUPLICATE', 'error', 'dns',
      `DNS resolver id "${resolver.id}" occurs more than once and cannot be lowered deterministically.`, resolver.id,
    ))
    resolverIds.add(resolver.id)
  }

  for (const resolver of directResolvers) issues.push(loonIssue(
    'LOON_DNS_DIRECT_RESOLVER_UNSUPPORTED', 'error', 'dns',
    `DNS resolver "${resolverLabel(resolver)}" is scoped to Direct lookups, but Loon's audited global DNS keys do not preserve that role.`, resolver.id,
  ))
  for (const resolver of fallbackResolvers) issues.push(loonIssue(
    'LOON_DNS_FALLBACK_RESOLVER_UNSUPPORTED', 'error', 'dns',
    `DNS resolver "${resolverLabel(resolver)}" is scoped as Fallback, but Loon's audited global DNS keys do not preserve that role.`, resolver.id,
  ))
  for (const resolver of rawResolvers.filter(hasInvalidRole)) issues.push(loonIssue(
    'LOON_DNS_RESOLVER_ROLE_UNSUPPORTED', 'error', 'dns',
    `DNS resolver "${resolver.name?.trim() || resolver.id}" has an unsupported resolver role.`, resolver.id,
  ))

  const parsed: ParsedResolver[] = []
  for (const resolver of resolvers) {
    const result = parseResolver(resolver)
    if ('issue' in result) issues.push(result.issue)
    else parsed.push(result)
  }

  if (new Set(parsed.map((resolver) => resolver.transport)).size > 1) issues.push(loonIssue(
    'LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED', 'error', 'dns',
    'Traditional and DoH resolver sets cannot be combined losslessly because Loon gives the two global keys target-specific selection and fallback semantics.', 'dns',
  ))

  const identities = new Set<string>()
  const unique: ParsedResolver[] = []
  for (const resolver of parsed) {
    if (identities.has(resolver.identity)) {
      issues.push(loonIssue(
        'LOON_DNS_RESOLVER_DUPLICATE', 'error', 'dns',
        `DNS resolver "${resolverLabel(resolver.resolver)}" duplicates an earlier endpoint and cannot be emitted with proven semantics.`, resolver.resolver.id,
      ))
      continue
    }
    identities.add(resolver.identity)
    unique.push(resolver)
  }

  if (issues.some((issue) => issue.severity === 'error') || unique.length === 0) return { general: [], issues }
  const key = unique[0].transport === 'traditional' ? 'dns-server' : 'doh-server'
  return {
    general: [{ key, value: { kind: 'list', items: unique.map((resolver) => resolver.value) } }],
    issues,
  }
}

function parseResolver(resolver: SharedDnsResolverIntent): ParsedResolver | { issue: CompatibilityIssue } {
  if (resolver.kind === 'system') {
    const rawAddress = resolver.address
    if (rawAddress !== undefined && hasUnsafeAddressCharacters(rawAddress)) return invalidAddress(
      resolver, `System DNS resolver "${resolverLabel(resolver)}" contains unsafe address characters.`,
    )
    const address = rawAddress?.trim()
    if (address !== undefined && address !== '' && address !== 'system') return invalidAddress(
      resolver, `System DNS resolver "${resolverLabel(resolver)}" must omit its address or use the canonical "system" sentinel.`,
    )
    return { resolver, transport: 'traditional', value: 'system', identity: 'traditional:system' }
  }

  const rawAddress = resolver.address
  if (!rawAddress || hasUnsafeAddressCharacters(rawAddress)) return invalidAddress(
    resolver, `DNS resolver "${resolverLabel(resolver)}" has an invalid or unsafe address.`,
  )
  const address = rawAddress.trim()
  if (!address) return invalidAddress(resolver, `DNS resolver "${resolverLabel(resolver)}" has an empty address.`)
  if (/\s/.test(address)) return invalidAddress(
    resolver, `DNS resolver "${resolverLabel(resolver)}" contains whitespace inside its address.`,
  )

  if (resolver.kind === 'dot') return { issue: loonIssue(
    'LOON_DNS_DOT_UNSUPPORTED', 'error', 'dns',
    `DoT resolver "${resolverLabel(resolver)}" has no proven mapping in the audited Loon DNS syntax.`, resolver.id,
  ) }

  if (resolver.kind === 'udp') return parseUdpResolver(resolver, address)
  if (resolver.kind === 'doh') return parseDohResolver(resolver, address)
  return invalidAddress(resolver, `DNS resolver "${resolverLabel(resolver)}" uses an unknown resolver kind.`)
}

function parseUdpResolver(
  resolver: SharedDnsResolverIntent,
  address: string,
): ParsedResolver | { issue: CompatibilityIssue } {
  if (isIpv4(address)) return {
    resolver, transport: 'traditional', value: address, identity: `traditional:${address}`,
  }

  const withPort = /^([^:]+):(\d+)$/.exec(address)
  if (withPort && isIpv4(withPort[1]) && isValidPort(withPort[2])) return { issue: loonIssue(
    'LOON_DNS_UDP_PORT_UNPROVEN', 'error', 'dns',
    `UDP DNS resolver "${resolverLabel(resolver)}" specifies a port, but the current Loon foundation only proves bare IPv4 resolver syntax.`, resolver.id,
  ) }

  const bracketedIpv6 = /^\[([^\]]+)\](?::\d+)?$/.exec(address)
  const possibleIpv6 = bracketedIpv6?.[1] ?? address
  if (isIpv6(possibleIpv6)) return { issue: loonIssue(
    'LOON_DNS_IPV6_UDP_UNPROVEN', 'error', 'dns',
    `UDP DNS resolver "${resolverLabel(resolver)}" uses IPv6 syntax that has not been proven for Loon's dns-server parser.`, resolver.id,
  ) }

  if (looksLikeHostnameEndpoint(address)) return { issue: loonIssue(
    'LOON_DNS_UDP_HOSTNAME_UNSUPPORTED', 'error', 'dns',
    `UDP DNS resolver "${resolverLabel(resolver)}" uses a hostname, while the audited Loon subset accepts an IPv4 literal only.`, resolver.id,
  ) }

  return invalidAddress(
    resolver, `UDP DNS resolver "${resolverLabel(resolver)}" must be a bare valid IPv4 literal in the current Loon foundation.`,
  )
}

function parseDohResolver(
  resolver: SharedDnsResolverIntent,
  address: string,
): ParsedResolver | { issue: CompatibilityIssue } {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return invalidAddress(resolver, `DoH resolver "${resolverLabel(resolver)}" must be a valid absolute HTTPS URL.`)
  }
  if (url.protocol !== 'https:') return { issue: loonIssue(
    'LOON_DNS_RESOLVER_SCHEME_MISMATCH', 'error', 'dns',
    `DoH resolver "${resolverLabel(resolver)}" must use HTTPS rather than "${url.protocol || '(missing)'}".`, resolver.id,
  ) }
  if (!address.startsWith('https://') || !hasValidUrlAuthority(address, 'https://')) return invalidAddress(
    resolver, `DoH resolver "${resolverLabel(resolver)}" must use the explicit lowercase "https://" authority form.`,
  )
  if (!isSafeDnsHost(url.hostname) || url.username || url.password || address.includes('#')) return invalidAddress(
    resolver, `DoH resolver "${resolverLabel(resolver)}" contains an unsupported host, credential, or fragment.`,
  )
  return { resolver, transport: 'doh', value: address, identity: `doh:${url.href}` }
}

function invalidAddress(resolver: SharedDnsResolverIntent, message: string) {
  return { issue: loonIssue('LOON_DNS_RESOLVER_ADDRESS_INVALID', 'error', 'dns', message, resolver.id) }
}

function hasValidUrlAuthority(value: string, prefix: string) {
  const remainder = value.slice(prefix.length)
  const boundary = remainder.search(/[/?#]/)
  const authority = boundary < 0 ? remainder : remainder.slice(0, boundary)
  if (!authority || authority.includes('@')) return false
  const match = /^([^:]+)(?::(\d+))?$/.exec(authority)
  return Boolean(match && (match[2] === undefined || isValidPort(match[2])))
}

function hasUnsafeAddressCharacters(value: string) {
  return /[\u0000-\u001f\u007f-\u009f\u2028\u2029,"\\]/.test(value)
}

function looksLikeHostnameEndpoint(value: string) {
  const host = value.replace(/:\d+$/, '')
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) && /[a-z]/i.test(host)
}

function isSafeDnsHost(value: string) {
  if (isIpv4(value)) return true
  return value.length > 0 && value.length <= 253 && value.split('.').every((label) => (
    label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ))
}

function isValidPort(value: string) {
  return /^(?:[1-9]\d{0,4})$/.test(value) && Number(value) <= 65_535
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

function resolverLabel(resolver: SharedDnsResolverIntent) {
  return resolver.name?.trim() || resolver.id
}

function hasInvalidRole(resolver: NonNullable<DnsIR['resolvers']>[number]) {
  const role = (resolver as { role?: unknown }).role
  return role !== undefined && role !== 'default' && role !== 'direct' && role !== 'fallback'
}
