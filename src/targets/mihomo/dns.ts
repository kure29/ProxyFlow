import type { DnsIR } from '../../core/ir'
import type { MihomoDnsConfig } from './model'
import { MIHOMO_DEFAULTS } from './defaults'

export function compileMihomoDns(dns: DnsIR | undefined): MihomoDnsConfig | undefined {
  if (!dns?.enabled) return undefined
  const resolvers = dns.mode === 'custom'
    ? (dns.resolvers ?? []).flatMap((resolver) => resolver.address ? [resolver.address] : [])
    : []
  return {
    enable: true,
    'enhanced-mode': 'redir-host',
    'default-nameserver': [MIHOMO_DEFAULTS.dnsBootstrap],
    nameserver: resolvers.length > 0 ? resolvers : [MIHOMO_DEFAULTS.dnsNameserver],
  }
}
