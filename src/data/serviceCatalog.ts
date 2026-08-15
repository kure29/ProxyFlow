import type { ServiceDefinition } from '../types/project'

const iosRuleSource = (service: string, ruleCount: number) => ({
  id: `ios-${service.toLowerCase().replaceAll(' ', '-')}`,
  provider: 'ios-rule-script' as const,
  format: 'yaml' as const,
  behavior: 'classical' as const,
  url: `https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/${service}/${service}.yaml`,
  updatedAt: 'Mock metadata',
  ruleCount,
})

export const serviceCatalog: ServiceDefinition[] = [
  { id: 'openai', name: 'OpenAI', category: 'ai', description: 'ChatGPT 与 OpenAI API', ruleSources: [iosRuleSource('OpenAI', 42)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX', 'IP-CIDR'] },
  { id: 'claude', name: 'Claude', category: 'ai', description: 'Anthropic Claude', ruleSources: [iosRuleSource('Claude', 24)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'gemini', name: 'Gemini', category: 'ai', description: 'Google Gemini', ruleSources: [iosRuleSource('Gemini', 31)], defaultMatchers: ['DOMAIN-SUFFIX', 'IP-CIDR'] },
  { id: 'youtube', name: 'YouTube', category: 'streaming', ruleSources: [iosRuleSource('YouTube', 186)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX', 'IP-CIDR'] },
  { id: 'netflix', name: 'Netflix', category: 'streaming', ruleSources: [iosRuleSource('Netflix', 94)], defaultMatchers: ['DOMAIN-SUFFIX', 'IP-CIDR'] },
  { id: 'disney', name: 'Disney+', category: 'streaming', ruleSources: [iosRuleSource('Disney', 63)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'telegram', name: 'Telegram', category: 'social', ruleSources: [iosRuleSource('Telegram', 28)], defaultMatchers: ['IP-CIDR', 'IP-CIDR6'] },
  { id: 'github', name: 'GitHub', category: 'development', ruleSources: [iosRuleSource('GitHub', 78)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'steam', name: 'Steam', category: 'gaming', ruleSources: [iosRuleSource('Steam', 71)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'china', name: 'China Mainland', category: 'regional', ruleSources: [{ id: 'builtin-china', provider: 'builtin', format: 'universal', ruleCount: 168 }], defaultMatchers: ['GEOSITE', 'GEOIP'] },
]
