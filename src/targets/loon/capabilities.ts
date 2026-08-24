import type { ResolvedProxyEndpointIR } from '../../core/ir'
import { LOON_SHADOWSOCKS_CIPHERS } from './proxies'

export type LoonCapabilityStatus = 'supported' | 'conditional' | 'unsupported' | 'unproven' | 'deferred'

export interface LoonCapabilityDecision {
  feature: string
  status: LoonCapabilityStatus
  reason: string
  officialReference: string
  diagnostic?: string
}

const MANUAL = 'https://github.com/Loon0x00/LoonManual/blob/4311d0030fe3065d4664b403a32010f083b99273/docs/cn'

/** Target-backend evidence records; this is intentionally separate from product exposure. */
export const LOON_CAPABILITY_MATRIX: readonly LoonCapabilityDecision[] = [
  { feature: 'HTTP', status: 'supported', reason: 'Bare HTTP and exact positional credentials are documented.', officialReference: `${MANUAL}/node.md#L61-L64` },
  { feature: 'HTTPS', status: 'conditional', reason: 'Ordinary TLS, SNI, and certificate skipping are represented; fingerprints, ALPN, and Reality are not proven in the HTTPS syntax.', officialReference: `${MANUAL}/node.md#L66-L70`, diagnostic: 'LOON_PROXY_TLS_VARIANT_UNSUPPORTED' },
  { feature: 'Shadowsocks', status: 'conditional', reason: 'A Loon-owned legacy cipher boundary and simple-obfs lowering are proven; unmodeled option intent blocks.', officialReference: `${MANUAL}/node.md#L43-L52`, diagnostic: 'LOON_PROXY_CIPHER_UNSUPPORTED' },
  { feature: 'Trojan', status: 'conditional', reason: 'Plain TLS with TCP/WS/HTTP transport, SNI, ALPN, and certificate skipping is lowered.', officialReference: `${MANUAL}/node.md#L120-L130`, diagnostic: 'LOON_PROXY_TLS_VARIANT_UNSUPPORTED' },
  { feature: 'VMess', status: 'conditional', reason: 'Only explicit alterId plus documented TCP/WS/HTTP fields are lowered; omission never defaults silently.', officialReference: `${MANUAL}/node.md#L72-L94`, diagnostic: 'LOON_VMESS_VARIANT_UNSUPPORTED' },
  { feature: 'VLESS', status: 'conditional', reason: 'Basic TCP/WS/HTTP and ordinary TLS subset only; Reality, Vision, flow, and modern transports fail closed.', officialReference: `${MANUAL}/node.md#L96-L118`, diagnostic: 'LOON_VLESS_VARIANT_UNSUPPORTED' },
  { feature: 'Hysteria2', status: 'conditional', reason: 'Minimal password/TLS/SNI subset only; obfs, bandwidth, and hopping fields are deferred.', officialReference: `${MANUAL}/node.md#L135-L137`, diagnostic: 'LOON_HYSTERIA2_VARIANT_UNSUPPORTED' },
  { feature: 'TUIC', status: 'deferred', reason: 'No Universal-to-Loon exact syntax audit is in this foundation.', officialReference: `${MANUAL}/node.md#L15-L39`, diagnostic: 'LOON_PROXY_PROTOCOL_UNSUPPORTED' },
  { feature: 'AnyTLS', status: 'deferred', reason: 'No Universal-to-Loon exact syntax audit is in this foundation.', officialReference: `${MANUAL}/node.md#L15-L39`, diagnostic: 'LOON_PROXY_PROTOCOL_UNSUPPORTED' },
  { feature: 'WireGuard', status: 'deferred', reason: 'Loon has native fields, but Universal IR has no WireGuard endpoint model.', officialReference: `${MANUAL}/node.md#L132-L133`, diagnostic: 'LOON_PROXY_PROTOCOL_UNSUPPORTED' },
  { feature: 'ShadowsocksR', status: 'deferred', reason: 'Loon has SSR fields, but Universal IR has no SSR endpoint model.', officialReference: `${MANUAL}/node.md#L54-L59`, diagnostic: 'LOON_PROXY_PROTOCOL_UNSUPPORTED' },
  { feature: 'Custom JS protocol', status: 'deferred', reason: 'Loon has a JS script-path form, but Universal IR has no script intent.', officialReference: `${MANUAL}/node.md#L139-L142`, diagnostic: 'LOON_PROXY_PROTOCOL_UNSUPPORTED' },
  { feature: 'Select', status: 'supported', reason: 'Ordered and nested policy members are preserved.', officialReference: `${MANUAL}/policygroup.md#L1-L6` },
  { feature: 'URL Test', status: 'supported', reason: 'Group-scoped URL, interval, and tolerance are represented.', officialReference: `${MANUAL}/policygroup.md#L7-L13` },
  { feature: 'Fallback', status: 'conditional', reason: 'URL and interval are represented; tolerance cannot be mapped and max-timeout is not in IR.', officialReference: `${MANUAL}/policygroup.md#L15-L21`, diagnostic: 'LOON_FALLBACK_TOLERANCE_UNSUPPORTED' },
  { feature: 'Load Balance Round-Robin', status: 'supported', reason: 'Explicit ordered round-robin maps to Loon Round-Robin.', officialReference: `${MANUAL}/policygroup.md#L23-L33` },
  { feature: 'Load Balance PCC', status: 'unsupported', reason: 'PCC hostname stickiness is not proven equivalent to Universal consistent hashing.', officialReference: `${MANUAL}/policygroup.md#L23-L33`, diagnostic: 'LOON_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED' },
  { feature: 'Proxy Chain', status: 'unproven', reason: 'No native chain syntax was established in the audited manual.', officialReference: `${MANUAL}/policygroup.md#L1-L33`, diagnostic: 'LOON_PROXY_CHAIN_UNPROVEN' },
  { feature: 'DNS', status: 'conditional', reason: 'System/bare IPv4 UDP and pure DoH are supported; DoT, roles, mixed semantics, and unmodeled encrypted kinds fail closed.', officialReference: `${MANUAL}/dns.md#L1-L33`, diagnostic: 'LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED' },
  { feature: 'Routing baseline', status: 'supported', reason: 'Domain, CIDR, GEOIP, and FINAL mappings preserve route order.', officialReference: `${MANUAL}/domain_rule.md#L1-L19` },
  { feature: 'Remote Proxy Source', status: 'unproven', reason: 'Universal IR does not prove a target-native remote resource format or refresh contract.', officialReference: `${MANUAL}/scheme.md#L21-L26`, diagnostic: 'LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN' },
] as const

export const LOON_OFFICIAL_REFERENCES = {
  manual: MANUAL,
  node: `${MANUAL}/node.md`,
  policyGroup: `${MANUAL}/policygroup.md`,
  dns: `${MANUAL}/dns.md`,
} as const

/** Static, target-local capability facts used by focused tests and tooling. */
export const LOON_CAPABILITIES = {
  protocols: {
    http: 'supported', https: 'conditional', shadowsocks: 'conditional', 'shadowsocks-simple-obfs': 'conditional',
    trojan: 'conditional', vmess: 'conditional', vless: 'conditional', hysteria2: 'conditional',
    socks5: 'unproven', tuic: 'deferred', anytls: 'deferred', wireguard: 'deferred', shadowsocksr: 'deferred', custom: 'deferred',
  },
  strategies: { select: 'supported', 'url-test': 'supported', fallback: 'conditional', fixed: 'supported', 'load-balance-round-robin': 'supported', 'load-balance-pcc': 'unsupported', chain: 'unproven' },
  routing: ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'IP-CIDR', 'IP-CIDR6', 'GEOIP', 'FINAL'] as const,
  dns: ['dns-server', 'doh-server'] as const,
  shadowsocksCiphers: [...LOON_SHADOWSOCKS_CIPHERS] as const,
} as const

export function loonProtocolCapability(endpoint: ResolvedProxyEndpointIR) {
  return LOON_CAPABILITIES.protocols[endpoint.protocol as keyof typeof LOON_CAPABILITIES.protocols] ?? 'unsupported'
}
