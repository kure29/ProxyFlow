import type { ServiceDefinition } from '../types/project'

const proxyFlowRuleSource = (serviceId: string, filename: string, ruleCount: number) => ({
  id: `proxyflow-${serviceId}`,
  provider: 'remote' as const,
  format: 'yaml' as const,
  behavior: 'classical' as const,
  url: `https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/mihomo/${filename}`,
  ruleCount,
})

export const serviceCatalog: ServiceDefinition[] = [
  { id: 'openai', name: 'OpenAI', category: 'ai', description: 'ChatGPT 与 OpenAI API', ruleSources: [proxyFlowRuleSource('openai', 'OpenAI.yaml', 6)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'claude', name: 'Claude', category: 'ai', description: 'Anthropic Claude', ruleSources: [proxyFlowRuleSource('claude', 'Claude.yaml', 4)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'google', name: 'Google', category: 'development', description: 'Google 服务', ruleSources: [proxyFlowRuleSource('google', 'Google.yaml', 6)], defaultMatchers: ['DOMAIN'] },
  { id: 'gemini', name: 'Gemini', category: 'ai', description: 'Google Gemini', ruleSources: [proxyFlowRuleSource('gemini', 'Gemini.yaml', 4)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  { id: 'youtube', name: 'YouTube', category: 'streaming', ruleSources: [proxyFlowRuleSource('youtube', 'YouTube.yaml', 7)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  { id: 'netflix', name: 'Netflix', category: 'streaming', ruleSources: [proxyFlowRuleSource('netflix', 'Netflix.yaml', 7)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'disney', name: 'Disney+', category: 'streaming', ruleSources: [proxyFlowRuleSource('disney', 'Disney.yaml', 7)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  { id: 'telegram', name: 'Telegram', category: 'social', ruleSources: [proxyFlowRuleSource('telegram', 'Telegram.yaml', 19)], defaultMatchers: ['DOMAIN-SUFFIX', 'IP-CIDR', 'IP-CIDR6'] },
  { id: 'github', name: 'GitHub', category: 'development', ruleSources: [proxyFlowRuleSource('github', 'GitHub.yaml', 6)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'steam', name: 'Steam', category: 'gaming', ruleSources: [proxyFlowRuleSource('steam', 'Steam.yaml', 8)], defaultMatchers: ['DOMAIN-SUFFIX'] },
]
