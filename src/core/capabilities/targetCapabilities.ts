import type { SupportedProxyProtocol } from '../proxy'
import type { BlockType, RouteMatcherKind } from '../../types/project'
import type { RuleSource } from '../../types/services'

export const PRIMARY_TARGETS = ['mihomo', 'sing-box'] as const

export type PrimaryTarget = typeof PRIMARY_TARGETS[number]
export type CapabilityStatus = 'supported' | 'partial' | 'unsupported' | 'target-native'
export type StrategyCapability = 'manual' | 'auto' | 'failover' | 'load-balance' | 'fixed' | 'chain'
export type TransportCapability = 'tcp' | 'ws' | 'http' | 'h2' | 'grpc' | 'httpupgrade' | 'xhttp'
export type DnsCapability = 'basic' | 'doh' | 'dot' | 'udp' | 'system' | 'default-role' | 'direct-role' | 'fallback-role' | 'redir-host' | 'fake-ip'
export type ChainCapability = 'single-hop' | 'multi-hop' | 'provider-hop'
export type RuleSourceFormat = NonNullable<RuleSource['format']>

export interface CapabilityDeclaration {
  status: CapabilityStatus
  reason?: string
  notes?: string
}

export interface TargetCapabilityProfile {
  target: PrimaryTarget
  label: string
  baselineVersion: string
  protocols: Record<SupportedProxyProtocol, CapabilityDeclaration>
  transports: Record<TransportCapability, CapabilityDeclaration>
  strategies: Record<StrategyCapability, CapabilityDeclaration>
  routingMatchers: Record<RouteMatcherKind, CapabilityDeclaration>
  ruleSources: Record<RuleSourceFormat, CapabilityDeclaration>
  dns: Record<DnsCapability, CapabilityDeclaration>
  chains: Record<ChainCapability, CapabilityDeclaration>
  native: Record<string, CapabilityDeclaration>
}

const supported = (notes?: string): CapabilityDeclaration => ({ status: 'supported', ...(notes ? { notes } : {}) })
const partial = (reason: string, notes?: string): CapabilityDeclaration => ({ status: 'partial', reason, ...(notes ? { notes } : {}) })
const unsupported = (reason: string): CapabilityDeclaration => ({ status: 'unsupported', reason })
const targetNative = (notes: string): CapabilityDeclaration => ({ status: 'target-native', notes })

const sharedProtocols = (): TargetCapabilityProfile['protocols'] => ({
  http: supported(),
  socks5: supported(),
  shadowsocks: supported(),
  trojan: supported(),
  vmess: supported(),
  vless: supported(),
  hysteria2: supported(),
  tuic: supported(),
  anytls: supported(),
})

export const targetCapabilityRegistry: Record<PrimaryTarget, TargetCapabilityProfile> = {
  mihomo: {
    target: 'mihomo',
    label: 'Mihomo',
    baselineVersion: 'v1.19.30',
    protocols: sharedProtocols(),
    transports: {
      tcp: supported(), ws: supported(), http: supported(), h2: supported(), grpc: supported(),
      httpupgrade: supported(), xhttp: supported(),
    },
    strategies: {
      manual: supported(),
      auto: supported(),
      failover: supported(),
      'load-balance': targetNative('Mihomo load-balance group with round-robin or consistent hashing.'),
      fixed: supported(),
      chain: partial('MIHOMO_CHAIN_PROTOCOL_LIMITATION', 'Multi-hop lowering is available with protocol and UDP limitations.'),
    },
    routingMatchers: {
      service: partial('MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED', 'Availability depends on an inline, builtin, or Mihomo-compatible rule source.'),
      domain: supported(),
      'domain-suffix': supported(),
      'domain-keyword': supported(),
      'ip-cidr': supported(),
      'ip-cidr6': supported(),
      port: supported(),
      asn: supported(),
      'geo-ip': supported(),
      'geo-site': supported(),
      'rule-set': partial('MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED', 'The referenced source must lower to a Mihomo rule provider.'),
    },
    ruleSources: {
      yaml: supported(),
      text: supported(),
      mrs: partial('MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED', 'MRS requires a compatible non-classical behavior.'),
      'sing-box-source': unsupported('MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED'),
      'sing-box-binary': unsupported('MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED'),
      'multi-client': unsupported('MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED'),
      universal: unsupported('MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED'),
    },
    dns: {
      basic: supported(),
      doh: supported(),
      dot: supported(),
      udp: supported(),
      system: unsupported('MIHOMO_INVALID_DNS_URL'),
      'default-role': supported(),
      'direct-role': targetNative('Mihomo direct-nameserver resolver role.'),
      'fallback-role': targetNative('Mihomo fallback resolver role.'),
      'redir-host': targetNative('Mihomo output profile DNS enhancement mode.'),
      'fake-ip': targetNative('Mihomo output profile DNS enhancement mode used by Desktop TUN.'),
    },
    chains: {
      'single-hop': supported(),
      'multi-hop': partial('MIHOMO_CHAIN_PROTOCOL_LIMITATION'),
      'provider-hop': partial('MIHOMO_CHAIN_PROTOCOL_LIMITATION'),
    },
    native: {
      'desktop-tun': targetNative('Mihomo-only listener, TUN, DNS, and sniffer output profile.'),
      'domain-sniffer': targetNative('Mihomo HTTP, TLS, and QUIC sniffing configuration.'),
      'load-balance': targetNative('Mihomo load-balance proxy group.'),
    },
  },
  'sing-box': {
    target: 'sing-box',
    label: 'sing-box',
    baselineVersion: 'v1.13.18',
    protocols: sharedProtocols(),
    transports: {
      tcp: supported(),
      ws: supported(),
      http: partial('SINGBOX_TRANSPORT_HTTP_TLS_VARIANT_UNSUPPORTED', 'HTTP transport and TLS combinations are validated fail-closed.'),
      h2: partial('SINGBOX_TRANSPORT_H2_REQUIRES_TLS', 'HTTP/2 transport requires TLS.'),
      grpc: supported(),
      httpupgrade: supported(),
      xhttp: unsupported('SINGBOX_TRANSPORT_XHTTP_UNSUPPORTED'),
    },
    strategies: {
      manual: partial('SINGBOX_SELECTOR_CLASH_API_REQUIRED', 'Runtime selection requires the sing-box Clash API.'),
      auto: supported(),
      failover: unsupported('SINGBOX_STRATEGY_FALLBACK_UNSUPPORTED'),
      'load-balance': unsupported('SINGBOX_STRATEGY_LOAD_BALANCE_UNSUPPORTED'),
      fixed: supported(),
      chain: partial('SINGBOX_CHAIN_REQUIRES_RESOLVED_OUTBOUND', 'Every hop must resolve to explicit outbounds.'),
    },
    routingMatchers: {
      service: partial('SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED', 'Availability depends on inline matchers or sing-box rule-set formats.'),
      domain: supported(),
      'domain-suffix': supported(),
      'domain-keyword': supported(),
      'ip-cidr': supported(),
      'ip-cidr6': supported(),
      port: supported(),
      asn: unsupported('SINGBOX_MATCHER_UNSUPPORTED'),
      'geo-ip': unsupported('SINGBOX_MATCHER_UNSUPPORTED'),
      'geo-site': unsupported('SINGBOX_MATCHER_UNSUPPORTED'),
      'rule-set': partial('SINGBOX_INVALID_RULESET', 'The referenced source must use sing-box source or binary format.'),
    },
    ruleSources: {
      yaml: unsupported('SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED'),
      text: unsupported('SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED'),
      mrs: unsupported('SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED'),
      'sing-box-source': supported(),
      'sing-box-binary': supported(),
      'multi-client': unsupported('SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED'),
      universal: unsupported('SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED'),
    },
    dns: {
      basic: supported(),
      doh: supported(),
      dot: supported(),
      udp: supported(),
      system: supported(),
      'default-role': supported(),
      'direct-role': unsupported('SINGBOX_DNS_ROLE_UNSUPPORTED'),
      'fallback-role': unsupported('SINGBOX_DNS_ROLE_UNSUPPORTED'),
      'redir-host': unsupported('SINGBOX_RUNTIME_INBOUND_NOT_CONFIGURED'),
      'fake-ip': unsupported('SINGBOX_RUNTIME_INBOUND_NOT_CONFIGURED'),
    },
    chains: {
      'single-hop': supported(),
      'multi-hop': partial('SINGBOX_CHAIN_REQUIRES_RESOLVED_OUTBOUND'),
      'provider-hop': unsupported('SINGBOX_CHAIN_REQUIRES_RESOLVED_OUTBOUND'),
    },
    native: {
      'runtime-inbound': unsupported('SINGBOX_RUNTIME_INBOUND_NOT_CONFIGURED'),
    },
  },
}

export function isPrimaryTarget(value: unknown): value is PrimaryTarget {
  return typeof value === 'string' && (PRIMARY_TARGETS as readonly string[]).includes(value)
}

export function getTargetCapabilities(target: PrimaryTarget) {
  return targetCapabilityRegistry[target]
}

export function capabilityIsAvailable(capability: CapabilityDeclaration) {
  return capability.status !== 'unsupported'
}

const strategyByBlockType: Partial<Record<BlockType, StrategyCapability>> = {
  'manual-select': 'manual',
  'auto-select': 'auto',
  fallback: 'failover',
  'load-balance': 'load-balance',
  'fixed-proxy': 'fixed',
  'proxy-chain': 'chain',
}

export function strategyCapabilityForBlockType(blockType: string): StrategyCapability | undefined {
  return strategyByBlockType[blockType as BlockType]
}
