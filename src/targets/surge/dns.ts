import type { DnsIR } from '../../core/ir'
import { projectDnsOwnership, type SharedDnsResolverIntent } from '../../core/dns/ownership'
import type { CompatibilityIssue } from '../../types/project'
import { surgeIssue } from './errors'
import type { SurgeGeneralEntry } from './model'

export interface SurgeDnsPlan {
  general: SurgeGeneralEntry[]
  issues: CompatibilityIssue[]
}

type ParsedResolver = {
  resolver: SharedDnsResolverIntent
  transport: 'traditional' | 'encrypted'
  value: string
  identity: string
  requiresSurgeIpv6: boolean
}

export function planSurgeDns(dns: DnsIR | undefined): SurgeDnsPlan {
  const ownership = projectDnsOwnership(dns)
  const shared = ownership.shared
  if (!shared || shared.mode === 'automatic') return { general: [], issues: [] }

  const issues: CompatibilityIssue[] = []
  const rawResolvers = dns?.resolvers ?? []
  const resolvers = shared.resolvers ?? []
  const { directResolvers, fallbackResolvers } = ownership.targetSpecific.mihomo
  if (rawResolvers.length === 0) {
    issues.push(surgeIssue(
      'SURGE_DNS_CUSTOM_EMPTY', 'error', 'dns',
      'Custom DNS mode requires at least one resolver before it can be lowered to Surge.', 'dns',
    ))
    return { general: [], issues }
  }

  const resolverIds = new Set<string>()
  for (const resolver of rawResolvers) {
    if (resolverIds.has(resolver.id)) issues.push(surgeIssue(
      'SURGE_DNS_RESOLVER_ID_DUPLICATE', 'error', 'dns',
      `DNS resolver id “${resolver.id}” occurs more than once and cannot be lowered deterministically.`, resolver.id,
    ))
    resolverIds.add(resolver.id)
  }

  for (const resolver of directResolvers) issues.push(surgeIssue(
    'SURGE_DNS_DIRECT_RESOLVER_UNSUPPORTED', 'error', 'dns',
    `DNS resolver “${resolverLabel(resolver)}” is scoped to Direct lookups, but Surge has no exact global dns-server role equivalent.`, resolver.id,
  ))
  for (const resolver of fallbackResolvers) issues.push(surgeIssue(
    'SURGE_DNS_FALLBACK_RESOLVER_UNSUPPORTED', 'error', 'dns',
    `DNS resolver “${resolverLabel(resolver)}” is scoped as Fallback, but Surge's concurrent global resolver list has no fallback role.`, resolver.id,
  ))
  for (const resolver of rawResolvers.filter(hasInvalidRole)) issues.push(surgeIssue(
    'SURGE_DNS_RESOLVER_ROLE_UNSUPPORTED', 'error', 'dns',
    `DNS resolver “${resolver.name?.trim() || resolver.id}” has an unsupported resolver role.`, resolver.id,
  ))

  const parsed: ParsedResolver[] = []
  for (const resolver of resolvers) {
    const result = parseResolver(resolver)
    if ('issue' in result) issues.push(result.issue)
    else parsed.push(result)
  }

  if (new Set(parsed.map((resolver) => resolver.transport)).size > 1) issues.push(surgeIssue(
    'SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED', 'error', 'dns',
    'Traditional and encrypted default resolvers cannot be combined losslessly: Surge uses traditional DNS only for encrypted-DNS bootstrap once encrypted-dns-server is present.', 'dns',
  ))

  const identities = new Set<string>()
  const unique: ParsedResolver[] = []
  for (const resolver of parsed) {
    if (identities.has(resolver.identity)) {
      if (resolver.transport === 'encrypted') issues.push(surgeIssue(
        'SURGE_DNS_RESOLVER_DUPLICATE', 'error', 'dns',
        `Encrypted DNS resolver “${resolverLabel(resolver.resolver)}” duplicates an earlier endpoint, but Surge does not document encrypted duplicate behavior.`, resolver.resolver.id,
      ))
      continue
    }
    identities.add(resolver.identity)
    unique.push(resolver)
    if (resolver.requiresSurgeIpv6) issues.push(surgeIssue(
      'SURGE_DNS_IPV6_RESOLVER_UNMODELED', 'error', 'dns',
      `DNS resolver “${resolverLabel(resolver.resolver)}” uses an IPv6 upstream, but Surge drops IPv6 DNS servers while ipv6=false and Universal DNS IR does not authorize enabling Surge's broader IPv6/AAAA behavior.`, resolver.resolver.id,
    ))
  }

  if (issues.some((issue) => issue.severity === 'error') || unique.length === 0) return { general: [], issues }
  const transport = unique[0].transport
  return {
    general: [{
      key: transport === 'traditional' ? 'dns-server' : 'encrypted-dns-server',
      value: { kind: 'list', items: unique.map((resolver) => resolver.value) },
    }],
    issues,
  }
}

function parseResolver(resolver: SharedDnsResolverIntent): ParsedResolver | { issue: CompatibilityIssue } {
  if (resolver.kind === 'system') {
    const address = resolver.address?.trim()
    if (address !== undefined && address !== '' && address !== 'system') return invalidAddress(
      resolver,
      `System DNS resolver “${resolverLabel(resolver)}” must omit its address or use the canonical “system” sentinel.`,
    )
    return { resolver, transport: 'traditional', value: 'system', identity: 'traditional:system', requiresSurgeIpv6: false }
  }

  const address = resolver.address?.trim()
  if (!address || hasUnsafeAddressCharacters(address)) return invalidAddress(
    resolver, `DNS resolver “${resolverLabel(resolver)}” has an invalid or unsafe address.`,
  )

  if (resolver.kind === 'udp') {
    const endpoint = parseUdpEndpoint(address)
    if (!endpoint) {
      const code = looksLikeHostnameEndpoint(address)
        ? 'SURGE_DNS_UDP_HOSTNAME_UNSUPPORTED'
        : 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'
      return { issue: surgeIssue(
        code, 'error', 'dns',
        code === 'SURGE_DNS_UDP_HOSTNAME_UNSUPPORTED'
          ? `UDP DNS resolver “${resolverLabel(resolver)}” uses a hostname, but Surge dns-server requires an IP literal.`
          : `UDP DNS resolver “${resolverLabel(resolver)}” must be a valid IPv4 or IPv6 literal with an optional valid port.`,
        resolver.id,
      ) }
    }
    return {
      resolver, transport: 'traditional', value: address,
      identity: `traditional:${endpoint.identity}`, requiresSurgeIpv6: endpoint.ipv6,
    }
  }

  const expectedScheme = resolver.kind === 'doh' ? 'https:' : 'tls:'
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return invalidAddress(resolver, `DNS resolver “${resolverLabel(resolver)}” must be a valid absolute ${resolver.kind === 'doh' ? 'DoH' : 'DoT'} URL.`)
  }
  if (url.protocol !== expectedScheme) return { issue: surgeIssue(
    'SURGE_DNS_RESOLVER_SCHEME_MISMATCH', 'error', 'dns',
    `DNS resolver “${resolverLabel(resolver)}” is declared as ${resolver.kind.toUpperCase()} but uses the “${url.protocol || '(missing)'}” scheme.`, resolver.id,
  ) }
  const expectedPrefix = `${expectedScheme}//`
  if (!address.startsWith(expectedPrefix) || !hasValidUrlAuthority(address, expectedPrefix)) return invalidAddress(
    resolver, `DNS resolver “${resolverLabel(resolver)}” must use the explicit “${expectedScheme}//” authority form.`,
  )
  if (!isSafeDnsHost(url.hostname) || url.username || url.password || address.includes('#') || !isValidUrlPort(url.port)) return invalidAddress(
    resolver, `DNS resolver “${resolverLabel(resolver)}” contains an unsupported host, credential, fragment, or port.`,
  )
  if (resolver.kind === 'dot' && (url.pathname !== '' || url.search || address.includes('?'))) return invalidAddress(
    resolver, `DoT resolver “${resolverLabel(resolver)}” may contain only a host and an optional port.`,
  )

  const identity = resolver.kind === 'doh'
    ? url.href
    : `tls://${url.hostname.toLowerCase()}${url.port && url.port !== '853' ? `:${url.port}` : ''}`
  return { resolver, transport: 'encrypted', value: address, identity: `encrypted:${identity}`, requiresSurgeIpv6: false }
}

function invalidAddress(resolver: SharedDnsResolverIntent, message: string) {
  return { issue: surgeIssue('SURGE_DNS_RESOLVER_ADDRESS_INVALID', 'error', 'dns', message, resolver.id) }
}

function parseUdpEndpoint(value: string): { identity: string; ipv6: boolean } | undefined {
  if (isIpv4(value)) return { identity: `${value}:53`, ipv6: false }
  if (isIpv6(value)) return { identity: `[${value.toLowerCase()}]:53`, ipv6: true }

  const bracketed = /^\[([^\]]+)\]:(\d+)$/.exec(value)
  if (bracketed && isIpv6(bracketed[1]) && isValidPort(bracketed[2])) return {
    identity: `[${bracketed[1].toLowerCase()}]:${Number(bracketed[2])}`, ipv6: true,
  }

  const ipv4WithPort = /^([^:]+):(\d+)$/.exec(value)
  if (ipv4WithPort && isIpv4(ipv4WithPort[1]) && isValidPort(ipv4WithPort[2])) return {
    identity: `${ipv4WithPort[1]}:${Number(ipv4WithPort[2])}`, ipv6: false,
  }
  return undefined
}

function isValidPort(value: string) {
  return /^(?:[1-9]\d{0,4})$/.test(value) && Number(value) <= 65535
}

function isValidUrlPort(value: string) {
  return value === '' || isValidPort(value)
}

function hasValidUrlAuthority(value: string, prefix: string) {
  const remainder = value.slice(prefix.length)
  const boundary = remainder.search(/[/?#]/)
  const authority = boundary < 0 ? remainder : remainder.slice(0, boundary)
  if (!authority || authority.includes('@')) return false

  const match = authority.startsWith('[')
    ? /^(\[[^\]]+\])(?::(\d+))?$/.exec(authority)
    : /^([^:]+)(?::(\d+))?$/.exec(authority)
  if (!match) return false
  return match[2] === undefined || isValidPort(match[2])
}

function hasUnsafeAddressCharacters(value: string) {
  return /[\u0000-\u0020\u007f-\u009f\u2028\u2029,"\\]/.test(value)
}

function looksLikeHostnameEndpoint(value: string) {
  const host = value.replace(/:\d+$/, '')
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) && /[a-z]/i.test(host)
}

function isSafeDnsHost(value: string) {
  const host = stripIpv6Brackets(value)
  if (isIpv4(host) || isIpv6(host)) return true
  return host.length > 0 && host.length <= 253 && host.split('.').every((label) => (
    label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ))
}

function stripIpv6Brackets(value: string) {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
}

function isIpv4(value: string) {
  const parts = value.split('.')
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
}

function isIpv6(value: string) {
  if (!value || value.includes('%')) return false
  const halves = value.split('::')
  if (halves.length > 2) return false
  const parseGroups = (part: string, allowEmbeddedIpv4: boolean) => {
    if (!part) return []
    const groups = part.split(':')
    const last = groups.at(-1)!
    if (last.includes('.')) {
      if (!allowEmbeddedIpv4 || !isIpv4(last)) return undefined
      groups.splice(-1, 1, '0', '0')
    }
    return groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group)) ? groups : undefined
  }
  const left = parseGroups(halves[0], halves.length === 1)
  const right = parseGroups(halves.length === 2 ? halves[1] : '', true)
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
