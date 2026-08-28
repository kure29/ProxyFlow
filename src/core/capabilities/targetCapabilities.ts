import type { SupportedProxyProtocol } from '../proxy'
import type { BlockType, RouteMatcherKind } from '../../types/project'
import type { RuleSource } from '../../types/services'
import type { SubscriptionRequestProfile } from '../subscription'

export const PRIMARY_TARGETS = ['mihomo', 'surge', 'sing-box', 'loon', 'shadowrocket'] as const

export type PrimaryTarget = typeof PRIMARY_TARGETS[number]
/** Targets exposed through the ordinary product surfaces. sing-box remains registered but paused. */
export type ProductTarget = Exclude<PrimaryTarget, 'sing-box'>
export type TargetProductStatus = 'supported' | 'paused'
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

export interface RemoteProxySourceCapabilities {
  source: CapabilityDeclaration
  refresh: CapabilityDeclaration
  requestHeaders: CapabilityDeclaration
  filtering: CapabilityDeclaration
  rename: CapabilityDeclaration
  exclude: CapabilityDeclaration
  override: CapabilityDeclaration
  multipleSourcesInGroup: CapabilityDeclaration
  mixedWithExplicitMembers: CapabilityDeclaration
  requestProfiles: readonly SubscriptionRequestProfile[]
}

export interface TargetCapabilityProfile {
  target: PrimaryTarget
  label: string
  baselineVersion: string
  productStatus: TargetProductStatus
  protocols: Record<SupportedProxyProtocol, CapabilityDeclaration>
  transports: Record<TransportCapability, CapabilityDeclaration>
  strategies: Record<StrategyCapability, CapabilityDeclaration>
  routingMatchers: Record<RouteMatcherKind, CapabilityDeclaration>
  ruleSources: Record<RuleSourceFormat, CapabilityDeclaration>
  dns: Record<DnsCapability, CapabilityDeclaration>
  chains: Record<ChainCapability, CapabilityDeclaration>
  remoteProxySource: RemoteProxySourceCapabilities
  proxyVariants: {
    shadowsocksPlugins: readonly string[]
  }
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
    productStatus: 'supported',
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
      'source-port': unsupported('TARGET_NATIVE_SOURCE_PORT_UNSUPPORTED'),
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
    remoteProxySource: {
      source: targetNative('HTTP proxy-provider lowering.'),
      refresh: supported('Mihomo refreshes HTTP proxy providers by interval.'),
      requestHeaders: targetNative('Only allowlisted headers derived from Request Profile are emitted.'),
      filtering: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      rename: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      exclude: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      override: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      multipleSourcesInGroup: supported(),
      mixedWithExplicitMembers: supported(),
      requestProfiles: ['auto', 'mihomo'],
    },
    proxyVariants: {
      shadowsocksPlugins: ['obfs', 'v2ray-plugin'],
    },
    native: {
      'desktop-tun': targetNative('Mihomo-only listener, TUN, DNS, and sniffer output profile.'),
      'domain-sniffer': targetNative('Mihomo HTTP, TLS, and QUIC sniffing configuration.'),
      'load-balance': targetNative('Mihomo load-balance proxy group.'),
      'strategy-smart': unsupported('TARGET_NATIVE_STRATEGY_UNSUPPORTED'),
      'strategy-subnet': unsupported('TARGET_NATIVE_STRATEGY_UNSUPPORTED'),
    },
  },
  surge: {
    target: 'surge',
    label: 'Surge',
    baselineVersion: 'iOS 5.22+ / Mac 6.9+',
    productStatus: 'supported',
    protocols: {
      http: partial('SURGE_PROXY_VARIANT_UNSUPPORTED', 'HTTP and HTTPS are supported inside the compiler\'s validated authentication and TLS subset.'),
      socks5: supported(),
      shadowsocks: partial('SURGE_PROXY_VARIANT_UNSUPPORTED', 'The documented cipher allowlist and exact simple-obfs http/tls options are supported; other plugins fail closed.'),
      trojan: partial('SURGE_PROXY_VARIANT_UNSUPPORTED', 'TCP and validated WebSocket transport are supported.'),
      vmess: unsupported('SURGE_PROXY_PROTOCOL_UNSUPPORTED'),
      vless: unsupported('SURGE_PROXY_PROTOCOL_UNSUPPORTED'),
      hysteria2: partial('SURGE_PROXY_VARIANT_UNSUPPORTED', 'The portable bandwidth, fixed port-hopping, and TLS subset is supported.'),
      tuic: partial('SURGE_PROXY_VARIANT_UNSUPPORTED', 'TUIC v5 UUID, password, and TLS are supported.'),
      anytls: partial('SURGE_PROXY_VARIANT_UNSUPPORTED', 'Password, TLS, and native UDP behavior are supported.'),
    },
    transports: {
      tcp: supported(),
      ws: partial('SURGE_PROXY_TRANSPORT_UNSUPPORTED', 'Validated Trojan WebSocket fields are supported.'),
      http: unsupported('SURGE_PROXY_TRANSPORT_UNSUPPORTED'),
      h2: unsupported('SURGE_PROXY_TRANSPORT_UNSUPPORTED'),
      grpc: unsupported('SURGE_PROXY_TRANSPORT_UNSUPPORTED'),
      httpupgrade: unsupported('SURGE_PROXY_TRANSPORT_UNSUPPORTED'),
      xhttp: unsupported('SURGE_PROXY_TRANSPORT_UNSUPPORTED'),
    },
    strategies: {
      manual: supported(),
      auto: partial('SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED', 'URL Test is supported inside the strict shared global test-URL subset.'),
      failover: partial('SURGE_FALLBACK_TOLERANCE_UNSUPPORTED', 'Ordered fallback and interval are supported; tolerance fails closed.'),
      'load-balance': unsupported('SURGE_LOAD_BALANCE_ROUND_ROBIN_UNSUPPORTED'),
      fixed: supported(),
      chain: partial('SURGE_PROXY_CHAIN_NESTED_MEMBER_UNSUPPORTED', 'Multi-hop lowering requires direct downstream policy members.'),
    },
    routingMatchers: {
      service: partial('SURGE_SERVICE_RULE_SOURCE_MISSING', 'The ten first-party services lower to Surge RULE-SET assets.'),
      domain: supported(),
      'domain-suffix': supported(),
      'domain-keyword': supported(),
      'ip-cidr': supported(),
      'ip-cidr6': supported(),
      port: supported(),
      asn: supported(),
      'geo-ip': supported(),
      'geo-site': unsupported('SURGE_MATCHER_UNSUPPORTED'),
      'rule-set': unsupported('SURGE_MATCHER_UNSUPPORTED'),
      'source-port': targetNative('Surge SRC-PORT exact-port matcher; ranges and comparisons remain deferred.'),
    },
    ruleSources: {
      yaml: unsupported('SURGE_MATCHER_UNSUPPORTED'),
      text: unsupported('SURGE_MATCHER_UNSUPPORTED'),
      mrs: unsupported('SURGE_MATCHER_UNSUPPORTED'),
      'sing-box-source': unsupported('SURGE_MATCHER_UNSUPPORTED'),
      'sing-box-binary': unsupported('SURGE_MATCHER_UNSUPPORTED'),
      'multi-client': unsupported('SURGE_MATCHER_UNSUPPORTED'),
      universal: unsupported('SURGE_MATCHER_UNSUPPORTED'),
    },
    dns: {
      basic: partial('SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED', 'Automatic DNS and a single traditional or encrypted resolver family are supported.'),
      doh: supported(),
      dot: supported(),
      udp: partial('SURGE_DNS_IPV6_RESOLVER_UNMODELED', 'IPv4 literal resolvers with an optional port are supported.'),
      system: supported(),
      'default-role': supported(),
      'direct-role': unsupported('SURGE_DNS_DIRECT_RESOLVER_UNSUPPORTED'),
      'fallback-role': unsupported('SURGE_DNS_FALLBACK_RESOLVER_UNSUPPORTED'),
      'redir-host': unsupported('SURGE_DNS_MODE_UNSUPPORTED'),
      'fake-ip': unsupported('SURGE_DNS_MODE_UNSUPPORTED'),
    },
    chains: {
      'single-hop': supported(),
      'multi-hop': partial('SURGE_PROXY_CHAIN_NESTED_MEMBER_UNSUPPORTED'),
      'provider-hop': unsupported('SURGE_SOURCE_REQUIRES_RESOLVED_PROXIES'),
    },
    remoteProxySource: {
      source: unsupported('SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      refresh: unsupported('SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      requestHeaders: unsupported('SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      filtering: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      rename: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      exclude: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      override: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      multipleSourcesInGroup: unsupported('SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      mixedWithExplicitMembers: unsupported('SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      requestProfiles: [],
    },
    proxyVariants: {
      shadowsocksPlugins: ['simple-obfs', 'obfs-local', 'obfs'],
    },
    native: {
      'surge-profile': targetNative('Exports a compatibility-checked Surge profile in INI-style syntax.'),
      'general-network': targetNative('Typed Surge General Network/VIF controls for ipv6, ipv6-vif, and icmp-forwarding.'),
      'general-connectivity': targetNative('Typed Surge Output-owned Internet/DIRECT connectivity testing URL.'),
      'group-underlying-proxy': targetNative('Surge iOS 5.22+ or Surge Mac 6.9+ group-level underlying-proxy.'),
      'strategy-smart': targetNative('Surge Smart policy group; members are validated proxy endpoints only.'),
      'strategy-subnet': targetNative('Surge Subnet policy group with ordered network conditions and an explicit default.'),
    },
  },
  'sing-box': {
    target: 'sing-box',
    label: 'sing-box',
    baselineVersion: 'v1.13.18',
    productStatus: 'paused',
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
      'source-port': unsupported('TARGET_NATIVE_SOURCE_PORT_UNSUPPORTED'),
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
    remoteProxySource: {
      source: unsupported('REMOTE_SOURCE_TARGET_UNSUPPORTED'),
      refresh: unsupported('REMOTE_SOURCE_TARGET_UNSUPPORTED'),
      requestHeaders: unsupported('REMOTE_SOURCE_TARGET_UNSUPPORTED'),
      filtering: unsupported('REMOTE_SOURCE_TARGET_UNSUPPORTED'),
      rename: unsupported('REMOTE_SOURCE_TARGET_UNSUPPORTED'),
      exclude: unsupported('REMOTE_SOURCE_TARGET_UNSUPPORTED'),
      override: unsupported('REMOTE_SOURCE_TARGET_UNSUPPORTED'),
      multipleSourcesInGroup: unsupported('REMOTE_SOURCE_TARGET_UNSUPPORTED'),
      mixedWithExplicitMembers: unsupported('REMOTE_SOURCE_TARGET_UNSUPPORTED'),
      requestProfiles: [],
    },
    proxyVariants: {
      shadowsocksPlugins: ['v2ray-plugin'],
    },
    native: {
      'runtime-inbound': unsupported('SINGBOX_RUNTIME_INBOUND_NOT_CONFIGURED'),
      'strategy-smart': unsupported('TARGET_NATIVE_STRATEGY_UNSUPPORTED'),
      'strategy-subnet': unsupported('TARGET_NATIVE_STRATEGY_UNSUPPORTED'),
    },
  },
  loon: {
    target: 'loon',
    label: 'Loon',
    baselineVersion: '3.5.0 (975)',
    productStatus: 'supported',
    protocols: {
      http: partial('LOON_PROXY_TLS_VARIANT_UNSUPPORTED', 'Bare HTTP is supported; HTTPS is limited to the validated TLS subset.'),
      socks5: unsupported('LOON_PROXY_PROTOCOL_UNSUPPORTED'),
      shadowsocks: partial('LOON_PROXY_CIPHER_UNSUPPORTED'),
      trojan: partial('LOON_PROXY_TLS_VARIANT_UNSUPPORTED'),
      vmess: partial('LOON_PROXY_CIPHER_UNSUPPORTED'),
      vless: partial('LOON_VLESS_VARIANT_UNSUPPORTED'),
      hysteria2: partial('LOON_HYSTERIA2_VARIANT_UNSUPPORTED'),
      tuic: unsupported('LOON_PROXY_PROTOCOL_UNSUPPORTED'),
      anytls: unsupported('LOON_PROXY_PROTOCOL_UNSUPPORTED'),
    },
    transports: {
      tcp: supported(),
      ws: partial('LOON_PROXY_TRANSPORT_UNSUPPORTED'),
      http: partial('LOON_PROXY_TRANSPORT_UNSUPPORTED'),
      h2: unsupported('LOON_PROXY_TRANSPORT_UNSUPPORTED'),
      grpc: unsupported('LOON_PROXY_TRANSPORT_UNSUPPORTED'),
      httpupgrade: unsupported('LOON_PROXY_TRANSPORT_UNSUPPORTED'),
      xhttp: unsupported('LOON_PROXY_TRANSPORT_UNSUPPORTED'),
    },
    strategies: {
      manual: supported(),
      auto: supported(),
      failover: partial('LOON_FALLBACK_TOLERANCE_UNSUPPORTED'),
      'load-balance': partial('LOON_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED'),
      fixed: supported(),
      chain: unsupported('LOON_PROXY_CHAIN_UNPROVEN'),
    },
    routingMatchers: {
      service: partial('LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN'),
      domain: partial('LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED'),
      'domain-suffix': partial('LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED'),
      'domain-keyword': partial('LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED'),
      'ip-cidr': partial('LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED'),
      'ip-cidr6': partial('LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED'),
      port: unsupported('LOON_PORT_MATCHER_UNSUPPORTED'),
      asn: unsupported('LOON_ROUTE_NO_RESOLVE_UNMODELED'),
      'geo-ip': partial('LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED'),
      'geo-site': unsupported('LOON_MATCHER_UNSUPPORTED'),
      'rule-set': unsupported('LOON_RULE_SOURCE_FORMAT_UNPROVEN'),
      'source-port': unsupported('TARGET_NATIVE_SOURCE_PORT_UNSUPPORTED'),
    },
    ruleSources: {
      yaml: unsupported('LOON_RULE_SOURCE_FORMAT_UNPROVEN'),
      text: unsupported('LOON_RULE_SOURCE_FORMAT_UNPROVEN'),
      mrs: unsupported('LOON_RULE_SOURCE_FORMAT_UNPROVEN'),
      'sing-box-source': unsupported('LOON_RULE_SOURCE_FORMAT_UNPROVEN'),
      'sing-box-binary': unsupported('LOON_RULE_SOURCE_FORMAT_UNPROVEN'),
      'multi-client': unsupported('LOON_RULE_SOURCE_FORMAT_UNPROVEN'),
      universal: unsupported('LOON_RULE_SOURCE_FORMAT_UNPROVEN'),
    },
    dns: {
      basic: partial('LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED'),
      doh: supported(),
      dot: unsupported('LOON_DNS_DOT_UNSUPPORTED'),
      udp: partial('LOON_DNS_UDP_PORT_UNPROVEN'),
      system: supported(),
      'default-role': supported(),
      'direct-role': unsupported('LOON_DNS_DIRECT_RESOLVER_UNSUPPORTED'),
      'fallback-role': unsupported('LOON_DNS_FALLBACK_RESOLVER_UNSUPPORTED'),
      'redir-host': unsupported('LOON_DNS_ROLE_UNSUPPORTED'),
      'fake-ip': unsupported('LOON_DNS_ROLE_UNSUPPORTED'),
    },
    chains: {
      'single-hop': supported(),
      'multi-hop': unsupported('LOON_PROXY_CHAIN_UNPROVEN'),
      'provider-hop': unsupported('LOON_PROXY_CHAIN_UNPROVEN'),
    },
    remoteProxySource: {
      source: unsupported('LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      refresh: unsupported('LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      requestHeaders: unsupported('LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      filtering: unsupported('LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      rename: unsupported('LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      exclude: unsupported('LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      override: unsupported('LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      multipleSourcesInGroup: unsupported('LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      mixedWithExplicitMembers: unsupported('LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN'),
      requestProfiles: [],
    },
    proxyVariants: {
      shadowsocksPlugins: ['simple-obfs'],
    },
    native: {
      'strategy-smart': unsupported('TARGET_NATIVE_STRATEGY_UNSUPPORTED'),
      'strategy-subnet': unsupported('TARGET_NATIVE_STRATEGY_UNSUPPORTED'),
    },
  },
  shadowrocket: {
    target: 'shadowrocket',
    label: 'Shadowrocket',
    baselineVersion: '2.2.65 build 2615',
    productStatus: 'supported',
    protocols: {
      http: partial('SHADOWROCKET_PROXY_VARIANT_UNPROVEN', 'HTTP/HTTPS syntax is implemented in the adapter but awaits authoritative syntax pinning and client acceptance.'),
      socks5: partial('SHADOWROCKET_PROXY_VARIANT_UNPROVEN'),
      shadowsocks: partial('SHADOWROCKET_SHADOWSOCKS_CIPHER_UNPROVEN'),
      trojan: partial('SHADOWROCKET_PROXY_VARIANT_UNPROVEN'),
      vmess: partial('SHADOWROCKET_PROXY_VARIANT_UNPROVEN'),
      vless: partial('SHADOWROCKET_PROXY_VARIANT_UNPROVEN'),
      hysteria2: partial('SHADOWROCKET_HYSTERIA2_VARIANT_UNPROVEN'),
      tuic: partial('SHADOWROCKET_TUIC_VARIANT_UNPROVEN'),
      anytls: partial('SHADOWROCKET_ANYTLS_VARIANT_UNPROVEN'),
    },
    transports: {
      tcp: supported(),
      ws: partial('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN'),
      http: unsupported('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN'),
      h2: unsupported('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN'),
      grpc: unsupported('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN'),
      httpupgrade: unsupported('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN'),
      xhttp: unsupported('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN'),
    },
    strategies: {
      manual: partial('SHADOWROCKET_STRATEGY_UNPROVEN'),
      auto: partial('SHADOWROCKET_STRATEGY_UNPROVEN'),
      failover: partial('SHADOWROCKET_STRATEGY_UNPROVEN'),
      'load-balance': partial('SHADOWROCKET_STRATEGY_UNPROVEN'),
      fixed: partial('SHADOWROCKET_STRATEGY_UNPROVEN'),
      chain: unsupported('SHADOWROCKET_PROXY_CHAIN_UNPROVEN'),
    },
    routingMatchers: {
      service: unsupported('SHADOWROCKET_RULE_SOURCE_UNPROVEN'),
      domain: partial('SHADOWROCKET_ROUTE_ORDER_UNPROVEN'),
      'domain-suffix': partial('SHADOWROCKET_ROUTE_ORDER_UNPROVEN'),
      'domain-keyword': partial('SHADOWROCKET_ROUTE_ORDER_UNPROVEN'),
      'ip-cidr': partial('SHADOWROCKET_ROUTE_ORDER_UNPROVEN'),
      'ip-cidr6': partial('SHADOWROCKET_ROUTE_ORDER_UNPROVEN'),
      port: unsupported('SHADOWROCKET_MATCHER_UNSUPPORTED'),
      asn: unsupported('SHADOWROCKET_MATCHER_UNSUPPORTED'),
      'geo-ip': partial('SHADOWROCKET_ROUTE_ORDER_UNPROVEN'),
      'geo-site': unsupported('SHADOWROCKET_MATCHER_UNSUPPORTED'),
      'rule-set': unsupported('SHADOWROCKET_RULE_SOURCE_UNPROVEN'),
      'source-port': unsupported('TARGET_NATIVE_SOURCE_PORT_UNSUPPORTED'),
    },
    ruleSources: {
      yaml: unsupported('SHADOWROCKET_RULE_SOURCE_UNPROVEN'),
      text: unsupported('SHADOWROCKET_RULE_SOURCE_UNPROVEN'),
      mrs: unsupported('SHADOWROCKET_RULE_SOURCE_UNPROVEN'),
      'sing-box-source': unsupported('SHADOWROCKET_RULE_SOURCE_UNPROVEN'),
      'sing-box-binary': unsupported('SHADOWROCKET_RULE_SOURCE_UNPROVEN'),
      'multi-client': unsupported('SHADOWROCKET_RULE_SOURCE_UNPROVEN'),
      universal: unsupported('SHADOWROCKET_RULE_SOURCE_UNPROVEN'),
    },
    dns: {
      basic: partial('SHADOWROCKET_DNS_ENCRYPTED_RESOLVER_UNPROVEN'),
      doh: unsupported('SHADOWROCKET_DNS_ENCRYPTED_RESOLVER_UNPROVEN'),
      dot: unsupported('SHADOWROCKET_DNS_ENCRYPTED_RESOLVER_UNPROVEN'),
      udp: partial('SHADOWROCKET_DNS_UDP_ADDRESS_INVALID'),
      system: partial('SHADOWROCKET_DNS_ROLE_UNSUPPORTED'),
      'default-role': partial('SHADOWROCKET_DNS_ROLE_UNSUPPORTED'),
      'direct-role': unsupported('SHADOWROCKET_DNS_ROLE_UNSUPPORTED'),
      'fallback-role': unsupported('SHADOWROCKET_DNS_ROLE_UNSUPPORTED'),
      'redir-host': unsupported('SHADOWROCKET_DNS_MODE_UNSUPPORTED'),
      'fake-ip': unsupported('SHADOWROCKET_DNS_MODE_UNSUPPORTED'),
    },
    chains: {
      'single-hop': supported(),
      'multi-hop': unsupported('SHADOWROCKET_PROXY_CHAIN_UNPROVEN'),
      'provider-hop': unsupported('SHADOWROCKET_PROXY_CHAIN_UNPROVEN'),
    },
    remoteProxySource: {
      source: unsupported('SHADOWROCKET_REMOTE_PROXY_SOURCE_UNPROVEN'),
      refresh: unsupported('SHADOWROCKET_REMOTE_PROXY_SOURCE_UNPROVEN'),
      requestHeaders: unsupported('SHADOWROCKET_REMOTE_PROXY_SOURCE_UNPROVEN'),
      filtering: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      rename: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      exclude: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      override: unsupported('REMOTE_SOURCE_PROCESSING_UNSUPPORTED'),
      multipleSourcesInGroup: unsupported('SHADOWROCKET_REMOTE_PROXY_SOURCE_UNPROVEN'),
      mixedWithExplicitMembers: unsupported('SHADOWROCKET_REMOTE_PROXY_SOURCE_UNPROVEN'),
      requestProfiles: [],
    },
    proxyVariants: { shadowsocksPlugins: ['simple-obfs'] },
    native: {
      'shadowrocket-profile': targetNative('Exports an evidence-bounded Shadowrocket INI profile once release gates pass.'),
      'strategy-smart': unsupported('TARGET_NATIVE_STRATEGY_UNSUPPORTED'),
      'strategy-subnet': unsupported('TARGET_NATIVE_STRATEGY_UNSUPPORTED'),
    },
  },
}

/**
 * Targets offered by ordinary product creation, switching, compatibility, and
 * export surfaces. Registered paused targets remain valid project/compiler
 * targets so historical Projects can round-trip without data loss.
 */
export const PRODUCT_TARGETS = PRIMARY_TARGETS.filter(
  (target) => targetCapabilityRegistry[target].productStatus === 'supported',
) as ProductTarget[]

export const DEFAULT_PRODUCT_TARGET = PRODUCT_TARGETS[0]

export function isPrimaryTarget(value: unknown): value is PrimaryTarget {
  return typeof value === 'string' && (PRIMARY_TARGETS as readonly string[]).includes(value)
}

export function getTargetCapabilities(target: PrimaryTarget) {
  return targetCapabilityRegistry[target]
}

export function isProductTarget(target: PrimaryTarget | null | undefined): target is ProductTarget {
  return Boolean(target && getTargetCapabilities(target).productStatus === 'supported')
}

export function resolveActiveProductTarget(target: PrimaryTarget | null | undefined): ProductTarget {
  return isProductTarget(target) ? target : DEFAULT_PRODUCT_TARGET
}

export function outputCompatibilityForTarget(target: PrimaryTarget) {
  return getTargetCapabilities(target).productStatus === 'paused' ? 'Paused' : 'Supported'
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
