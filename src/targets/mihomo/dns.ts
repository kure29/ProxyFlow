import type { DnsIR } from '../../core/ir'
import type { MihomoDnsMode } from '../../types/project'
import type { MihomoDnsConfig } from './model'
import { MIHOMO_DEFAULTS } from './defaults'

export function compileMihomoDns(dns: DnsIR | undefined, mode: MihomoDnsMode, ipv6: boolean): MihomoDnsConfig | undefined {
  if (!dns?.enabled || mode === 'disabled') return undefined
  const resolvers = dns.mode === 'custom'
    ? (dns.resolvers ?? []).flatMap((resolver) => resolver.address ? [resolver.address] : [])
    : []
  return {
    enable: true,
    ipv6,
    'enhanced-mode': mode,
    ...(mode === 'fake-ip' ? { 'fake-ip-range': MIHOMO_DEFAULTS.fakeIpRange } : {}),
    'default-nameserver': [MIHOMO_DEFAULTS.dnsBootstrap],
    nameserver: resolvers.length > 0 ? resolvers : [MIHOMO_DEFAULTS.dnsNameserver],
  }
}
