export const MIHOMO_DEFAULTS = {
  mixedPort: 7890,
  providerIntervalSeconds: 21_600,
  ruleProviderIntervalSeconds: 86_400,
  healthCheckUrl: 'https://www.gstatic.com/generate_204',
  healthCheckIntervalSeconds: 300,
  dnsNameserver: 'https://1.1.1.1/dns-query',
  dnsBootstrap: '223.5.5.5',
  fakeIpRange: '198.18.0.1/16',
} as const
