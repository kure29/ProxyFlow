// Starter values adapted from qichiyuhub/rule config.yaml at
// db063cbb2a038943c12fd91ebf3d21e1f19087bb. Remote providers, controller/UI,
// credentials and fields outside ProxyFlow's validated model are intentionally excluded.
export const MIHOMO_DEFAULTS = {
  mixedPort: 7890,
  providerIntervalSeconds: 21_600,
  ruleProviderIntervalSeconds: 86_400,
  healthCheckUrl: 'https://www.gstatic.com/generate_204',
  healthCheckIntervalSeconds: 300,
  dnsNameservers: [
    'https://dns.alidns.com/dns-query',
    'https://doh.pub/dns-query',
  ],
  dnsBootstrap: '223.5.5.5',
  fakeIpRange: '198.18.0.0/16',
} as const
