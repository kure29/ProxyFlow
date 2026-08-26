import type { DnsIR, DnsResolverIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { shadowrocketIssue } from './errors'
import type { ShadowrocketGeneralEntry } from './model'

export function planShadowrocketDns(dns: DnsIR | undefined): { general: ShadowrocketGeneralEntry[]; issues: CompatibilityIssue[] } {
  if (!dns?.enabled || dns.mode === 'automatic') return { general: [], issues: [] }
  const issues: CompatibilityIssue[] = []
  const resolvers = dns.resolvers ?? []
  if (!resolvers.length) return { general: [], issues: [shadowrocketIssue('SHADOWROCKET_DNS_CUSTOM_EMPTY', 'error', 'dns', 'Custom DNS mode requires at least one resolver.', 'dns')] }
  const ids = new Set<string>()
  const addresses = new Set<string>()
  const values: string[] = []
  for (const resolver of resolvers) {
    if (ids.has(resolver.id)) issues.push(shadowrocketIssue('SHADOWROCKET_DNS_RESOLVER_ID_DUPLICATE', 'error', 'dns', `DNS resolver id "${resolver.id}" occurs more than once.`, resolver.id))
    ids.add(resolver.id)
    if ((resolver.role ?? 'default') !== 'default') { issues.push(shadowrocketIssue('SHADOWROCKET_DNS_ROLE_UNSUPPORTED', 'error', 'dns', `DNS resolver "${resolverLabel(resolver)}" uses a role that cannot be represented by the audited global Shadowrocket DNS key.`, resolver.id)); continue }
    const value = lowerResolver(resolver, issues)
    if (value) {
      if (addresses.has(value)) issues.push(shadowrocketIssue('SHADOWROCKET_DNS_RESOLVER_DUPLICATE', 'error', 'dns', `DNS resolver "${resolverLabel(resolver)}" duplicates an earlier global endpoint.`, resolver.id))
      addresses.add(value)
      values.push(value)
    }
  }
  if (issues.some((issue) => issue.severity === 'error') || !values.length) return { general: [], issues }
  return { general: [{ key: 'dns-server', value: { kind: 'list', items: values } }], issues }
}

function lowerResolver(resolver: DnsResolverIR, issues: CompatibilityIssue[]) {
  const runtime = resolver as unknown as Record<string, unknown>
  const label = resolverLabel(resolver)
  if (runtime.kind === 'system') {
    const address = typeof runtime.address === 'string' ? runtime.address.trim() : runtime.address
    if (address && address !== 'system') { issues.push(shadowrocketIssue('SHADOWROCKET_DNS_RESOLVER_ADDRESS_INVALID', 'error', 'dns', `System DNS resolver "${resolverLabel(resolver)}" must omit its address or use "system".`, resolver.id)); return undefined }
    return 'system'
  }
  if (runtime.kind !== 'udp') { issues.push(shadowrocketIssue('SHADOWROCKET_DNS_ENCRYPTED_RESOLVER_UNPROVEN', 'error', 'dns', `DNS resolver "${label}" uses ${String(runtime.kind).toUpperCase()}, but the audited Shadowrocket DNS subset proves only system/UDP dns-server entries.`, resolver.id)); return undefined }
  const address = typeof runtime.address === 'string' ? runtime.address.trim() : undefined
  if (!address || !isIpv4Endpoint(address)) { issues.push(shadowrocketIssue('SHADOWROCKET_DNS_UDP_ADDRESS_INVALID', 'error', 'dns', `UDP DNS resolver "${label}" must be a valid IPv4 literal with optional port.`, resolver.id)); return undefined }
  return address
}
function isIpv4Endpoint(value: string) { const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(value); return Boolean(match && match[1].split('.').every((part) => Number(part) <= 255) && (!match[2] || Number(match[2]) > 0 && Number(match[2]) <= 65535)) }
function resolverLabel(resolver: DnsResolverIR) { return typeof resolver.name === 'string' ? resolver.name.trim() || resolver.id : resolver.id }
