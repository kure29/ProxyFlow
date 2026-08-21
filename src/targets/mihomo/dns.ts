import type { DnsIR } from '../../core/ir'
import type { MihomoDnsMode } from '../../types/project'
import type { MihomoDnsConfig } from './model'
import { MIHOMO_DEFAULTS } from './defaults'

export function compileMihomoDns(dns: DnsIR | undefined, mode: MihomoDnsMode, ipv6: boolean): MihomoDnsConfig | undefined {
  if (!dns?.enabled || mode === 'disabled') return undefined
  const resolvers = dns.mode === 'custom' ? dns.resolvers ?? [] : []
  const defaults = resolverAddresses(resolvers, 'default')
  const direct = resolverAddresses(resolvers, 'direct')
  const fallback = resolverAddresses(resolvers, 'fallback')
  return {
    enable: true,
    ipv6,
    'enhanced-mode': mode,
    ...(mode === 'fake-ip' ? { 'fake-ip-range': MIHOMO_DEFAULTS.fakeIpRange } : {}),
    'default-nameserver': [MIHOMO_DEFAULTS.dnsBootstrap],
    nameserver: defaults.length > 0 ? defaults : [...MIHOMO_DEFAULTS.dnsNameservers],
    ...(direct.length > 0 ? { 'direct-nameserver': direct } : {}),
    ...(fallback.length > 0 ? { fallback } : {}),
  }
}

function resolverAddresses(resolvers: NonNullable<DnsIR['resolvers']>, role: 'default' | 'direct' | 'fallback') {
  return resolvers.flatMap((resolver) => (resolver.role ?? 'default') === role && resolver.address ? [resolver.address] : [])
}
