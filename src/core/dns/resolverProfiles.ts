import type { DnsResolverConfig, DnsResolverKind, DnsResolverRegion, DnsResolverRole } from '../../types/project'

export interface DnsResolverPreset {
  id: string
  name: string
  kind: DnsResolverKind
  address?: string
  region: DnsResolverRegion
}

export const DNS_RESOLVER_PRESETS: readonly DnsResolverPreset[] = [
  { id: 'system', name: 'System', kind: 'system', address: 'system', region: 'system' },
  { id: 'cloudflare', name: 'Cloudflare', kind: 'doh', address: 'https://1.1.1.1/dns-query', region: 'global' },
  { id: 'google', name: 'Google', kind: 'doh', address: 'https://dns.google/dns-query', region: 'global' },
  { id: 'quad9', name: 'Quad9', kind: 'doh', address: 'https://dns.quad9.net/dns-query', region: 'global' },
  { id: 'alidns', name: 'AliDNS', kind: 'doh', address: 'https://dns.alidns.com/dns-query', region: 'mainland-china' },
  { id: 'dnspod', name: 'DNSPod', kind: 'doh', address: 'https://doh.pub/dns-query', region: 'mainland-china' },
  { id: 'adguard', name: 'AdGuard DNS', kind: 'doh', address: 'https://dns.adguard-dns.com/dns-query', region: 'global' },
] as const

export function createDnsResolver(
  presetId: string,
  role: DnsResolverRole = 'default',
  existing: readonly DnsResolverConfig[] = [],
): DnsResolverConfig | undefined {
  const preset = DNS_RESOLVER_PRESETS.find((item) => item.id === presetId)
  if (!preset) return undefined
  const id = uniqueResolverId(`${preset.id}-${role}`, new Set(existing.map((item) => item.id)))
  return {
    id,
    name: preset.name,
    kind: preset.kind,
    role,
    ...(preset.address ? { address: preset.address } : {}),
    enabled: true,
    presetId: preset.id,
    region: preset.region,
  }
}

export function createCustomDnsResolver(
  existing: readonly DnsResolverConfig[] = [],
  role: DnsResolverRole = 'default',
): DnsResolverConfig {
  return {
    id: uniqueResolverId(`custom-${role}`, new Set(existing.map((item) => item.id))),
    name: 'Custom DNS',
    kind: 'doh',
    role,
    address: '',
    enabled: true,
  }
}

export function appendDnsResolverPreset(resolvers: readonly DnsResolverConfig[], presetId: string) {
  const resolver = createDnsResolver(presetId, 'default', resolvers)
  return resolver ? [...resolvers, resolver] : [...resolvers]
}

export function appendCustomDnsResolver(resolvers: readonly DnsResolverConfig[]) {
  return [...resolvers, createCustomDnsResolver(resolvers)]
}

export function patchDnsResolver(resolvers: readonly DnsResolverConfig[], id: string, patch: Partial<DnsResolverConfig>) {
  return resolvers.map((resolver) => resolver.id === id ? { ...resolver, ...patch } : resolver)
}

export function deleteDnsResolver(resolvers: readonly DnsResolverConfig[], id: string) {
  return resolvers.filter((resolver) => resolver.id !== id)
}

export function normalizeDnsResolvers(
  resolvers: readonly DnsResolverConfig[] | undefined,
  legacyResolver?: string,
): DnsResolverConfig[] {
  if (resolvers !== undefined) return Array.isArray(resolvers)
    ? resolvers.filter(isDnsResolverConfig).map((resolver) => ({ ...resolver }))
    : []
  if (!legacyResolver) return []
  return [{
    id: 'legacy-default',
    name: inferResolverName(legacyResolver),
    kind: resolverKind(legacyResolver),
    role: 'default',
    address: legacyResolver,
    enabled: true,
  }]
}

export function countEnabledDnsResolvers(
  resolvers: readonly DnsResolverConfig[] | undefined,
  legacyResolver?: string,
) {
  return normalizeDnsResolvers(resolvers, legacyResolver).filter((resolver) => resolver.enabled).length
}

export function resolveDnsResolverRegion(resolver: DnsResolverConfig): DnsResolverRegion | undefined {
  if (resolver.region) return resolver.region
  const preset = DNS_RESOLVER_PRESETS.find((item) => item.id === resolver.presetId)
    ?? DNS_RESOLVER_PRESETS.find((item) => item.kind === resolver.kind && item.address === resolver.address)
  return preset?.region
}

export function resolverKind(address: string): DnsResolverKind {
  if (address === 'system') return 'system'
  if (address.startsWith('https://')) return 'doh'
  if (address.startsWith('tls://')) return 'dot'
  return 'udp'
}

export function isDnsResolverKind(value: unknown): value is DnsResolverKind {
  return value === 'doh' || value === 'dot' || value === 'udp' || value === 'system'
}

export function isDnsResolverRole(value: unknown): value is DnsResolverRole {
  return value === 'default' || value === 'direct' || value === 'fallback'
}

export function isDnsResolverConfig(value: unknown): value is DnsResolverConfig {
  if (!value || typeof value !== 'object') return false
  const resolver = value as Record<string, unknown>
  return typeof resolver.id === 'string' && Boolean(resolver.id.trim())
    && typeof resolver.name === 'string' && Boolean(resolver.name.trim())
    && isDnsResolverKind(resolver.kind)
    && isDnsResolverRole(resolver.role)
    && typeof resolver.enabled === 'boolean'
    && (resolver.address === undefined || typeof resolver.address === 'string')
    && (resolver.presetId === undefined || typeof resolver.presetId === 'string')
    && (resolver.region === undefined || resolver.region === 'system' || resolver.region === 'global' || resolver.region === 'mainland-china')
}

function uniqueResolverId(base: string, used: ReadonlySet<string>) {
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

function inferResolverName(address: string) {
  try {
    return new URL(address.includes('://') ? address : `udp://${address}`).hostname || 'Custom DNS'
  } catch {
    return 'Custom DNS'
  }
}
