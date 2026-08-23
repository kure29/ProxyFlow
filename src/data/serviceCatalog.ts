import type { ServiceDefinition } from '../types/project'
import { resolveFirstPartyServiceRuleSource, type FirstPartyServiceId } from './serviceRuleAssets'

const proxyFlowRuleSource = (serviceId: FirstPartyServiceId) => {
  const source = resolveFirstPartyServiceRuleSource(serviceId, 'mihomo')
  if (!source) throw new Error(`Missing first-party Mihomo service rule source for ${serviceId}.`)
  return {
    id: `proxyflow-${serviceId}`,
    provider: 'remote' as const,
    format: 'yaml' as const,
    behavior: 'classical' as const,
    url: source.url,
    ruleCount: source.ruleCount,
  }
}

export const serviceCatalog: ServiceDefinition[] = [
  { id: 'openai', name: 'OpenAI', category: 'ai', description: 'ChatGPT 与 OpenAI API', ruleSources: [proxyFlowRuleSource('openai')], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'claude', name: 'Claude', category: 'ai', description: 'Anthropic Claude', ruleSources: [proxyFlowRuleSource('claude')], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'google', name: 'Google', category: 'development', description: 'Google 服务', ruleSources: [proxyFlowRuleSource('google')], defaultMatchers: ['DOMAIN'] },
  { id: 'gemini', name: 'Gemini', category: 'ai', description: 'Google Gemini', ruleSources: [proxyFlowRuleSource('gemini')], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  { id: 'youtube', name: 'YouTube', category: 'streaming', ruleSources: [proxyFlowRuleSource('youtube')], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  { id: 'netflix', name: 'Netflix', category: 'streaming', ruleSources: [proxyFlowRuleSource('netflix')], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'disney', name: 'Disney+', category: 'streaming', ruleSources: [proxyFlowRuleSource('disney')], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  { id: 'telegram', name: 'Telegram', category: 'social', ruleSources: [proxyFlowRuleSource('telegram')], defaultMatchers: ['DOMAIN-SUFFIX', 'IP-CIDR', 'IP-CIDR6'] },
  { id: 'github', name: 'GitHub', category: 'development', ruleSources: [proxyFlowRuleSource('github')], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'steam', name: 'Steam', category: 'gaming', ruleSources: [proxyFlowRuleSource('steam')], defaultMatchers: ['DOMAIN-SUFFIX'] },
]
