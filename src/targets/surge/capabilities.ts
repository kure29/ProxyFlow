export type SurgeCapabilityStatus = 'supported' | 'conditional' | 'unsupported'

export interface SurgeCapabilityDecision {
  feature: string
  status: SurgeCapabilityStatus
  reason: string
  officialReference: string
  diagnostic?: string
}

const docs = {
  including: 'https://manual.nssurge.com/policy-groups/policy-including.html',
  groups: 'https://manual.nssurge.com/policy-groups/parameters.html',
  urlTest: 'https://manual.nssurge.com/policy-groups/url-test.html',
  fallback: 'https://manual.nssurge.com/policy-groups/fallback.html',
  loadBalance: 'https://manual.nssurge.com/policy-groups/load-balance.html',
  policies: 'https://manual.nssurge.com/policies/overview.html',
  policyParameters: 'https://manual.nssurge.com/policies/parameters.html',
  shadowsocks: 'https://manual.nssurge.com/policies/shadowsocks.html',
  dnsOverview: 'https://manual.nssurge.com/dns/overview.html',
  dnsServers: 'https://manual.nssurge.com/dns/dns-server.html',
  encryptedDns: 'https://manual.nssurge.com/dns/encrypted-dns.html',
} as const

/** Target-backend audit data. This is deliberately separate from the product target registry. */
export const SURGE_CAPABILITY_MATRIX: readonly SurgeCapabilityDecision[] = [
  {
    feature: 'Service Rules', status: 'supported',
    reason: 'The ten branded services lower to first-party Surge RULE-SET assets.',
    officialReference: 'https://manual.nssurge.com/rules/ruleset.html',
  },
  {
    feature: 'Remote Proxy Source', status: 'unsupported',
    reason: 'policy-path is native, but Universal IR does not prove that a subscription URL serves Surge policy lines or a Surge profile.',
    officialReference: docs.including, diagnostic: 'SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN',
  },
  {
    feature: 'Select', status: 'supported', reason: 'Member order and nested group references are preserved.',
    officialReference: 'https://manual.nssurge.com/policy-groups/select.html',
  },
  {
    feature: 'Target-native Smart', status: 'supported', reason: 'Surge Smart is emitted as a typed target-native policy group with proxy-only members.',
    officialReference: docs.groups,
  },
  {
    feature: 'Smart policy-priority', status: 'supported', reason: 'Typed positive regex/factor rules preserve Surge first-match scoring multipliers.',
    officialReference: 'https://manual.nssurge.com/policy-groups/smart.html',
  },
  {
    feature: 'Smart evaluate-before-use', status: 'supported', reason: 'Typed optional boolean preserves Surge first-use evaluation behavior (default false).',
    officialReference: docs.urlTest,
  },
  {
    feature: 'Target-native Subnet', status: 'supported', reason: 'Surge Subnet is emitted as a typed target-native policy group with ordered network conditions and an explicit default.',
    officialReference: docs.groups,
  },
  {
    feature: 'Subnet MCCMNC matcher', status: 'supported', reason: 'MCC+MNC is validated as a five/six-digit carrier code and emitted with the modern MCCMNC: prefix.',
    officialReference: 'https://manual.nssurge.com/rules/protocol-and-network.html',
  },
  {
    feature: 'URL Test', status: 'conditional', reason: 'Explicit members, interval validity, tolerance, and the strict shared global test-URL subset are supported.',
    officialReference: docs.urlTest, diagnostic: 'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED',
  },
  {
    feature: 'Fallback', status: 'conditional', reason: 'Ordered fallback and interval validity are supported; tolerance remains unsupported.',
    officialReference: docs.fallback, diagnostic: 'SURGE_FALLBACK_TOLERANCE_UNSUPPORTED',
  },
  {
    feature: 'Fixed Strategy', status: 'supported', reason: 'A one-member select group preserves strategy identity and references.',
    officialReference: 'https://manual.nssurge.com/policy-groups/select.html',
  },
  {
    feature: 'Load Balance round-robin', status: 'unsupported', reason: 'Surge non-persistent selection is random, not ordered round-robin.',
    officialReference: docs.loadBalance, diagnostic: 'SURGE_LOAD_BALANCE_ROUND_ROBIN_UNSUPPORTED',
  },
  {
    feature: 'Load Balance consistent-hash', status: 'unsupported', reason: 'Surge hashes a full target hostname; ProxyFlow currently carries Mihomo consistent-hashing semantics.',
    officialReference: docs.loadBalance, diagnostic: 'SURGE_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED',
  },
  {
    feature: 'Proxy Chain', status: 'conditional', reason: 'Group-derived chains are exact only when downstream groups contain direct policies and do not combine underlying-proxy with port hopping.',
    officialReference: docs.groups, diagnostic: 'SURGE_PROXY_CHAIN_NESTED_MEMBER_UNSUPPORTED',
  },
  {
    feature: 'DNS', status: 'conditional',
    reason: 'Automatic DNS, system/IPv4 UDP defaults, and pure DoH/DoT default resolver sets are exact; role-specific, mixed traditional/encrypted, malformed, ambiguous duplicate, and traditional IPv6-upstream intent fails closed.',
    officialReference: docs.dnsOverview, diagnostic: 'SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED',
  },
  {
    feature: 'Shadowsocks', status: 'conditional',
    reason: 'The official cipher list and exact simple-obfs http/tls, host, and HTTP URI fields lower natively; other plugin or option semantics fail closed.',
    officialReference: docs.shadowsocks, diagnostic: 'SURGE_SHADOWSOCKS_PLUGIN_UNSUPPORTED',
  },
  {
    feature: 'VMess', status: 'unsupported', reason: 'Universal IR does not retain explicit vmess-aead intent.',
    officialReference: 'https://manual.nssurge.com/policies/vmess.html', diagnostic: 'SURGE_PROXY_PROTOCOL_UNSUPPORTED',
  },
  {
    feature: 'VLESS', status: 'unsupported', reason: 'The current official Surge policy list has no lossless VLESS policy.',
    officialReference: docs.policies, diagnostic: 'SURGE_PROXY_PROTOCOL_UNSUPPORTED',
  },
] as const

export const SURGE_OFFICIAL_REFERENCES = docs
