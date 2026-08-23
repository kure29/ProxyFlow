import type { ServiceDefinition } from '../types/project'
import claudeIcon from '../assets/services/claude.png'
import disneyIcon from '../assets/services/disney.png'
import geminiIcon from '../assets/services/gemini.svg'
import githubIcon from '../assets/services/github.png'
import googleIcon from '../assets/services/google.png'
import netflixIcon from '../assets/services/netflix.png'
import openAiIcon from '../assets/services/openai.png'
import steamIcon from '../assets/services/steam.png'
import telegramIcon from '../assets/services/telegram.png'
import youtubeIcon from '../assets/services/youtube.png'

const proxyFlowRuleSource = (serviceId: string, filename: string, ruleCount: number) => ({
  id: `proxyflow-${serviceId}`,
  provider: 'remote' as const,
  format: 'yaml' as const,
  behavior: 'classical' as const,
  url: `https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/mihomo/${filename}`,
  ruleCount,
})

// Service-only brand artwork and exact source revisions are recorded beside the assets.
// Brand marks are used only to identify their respective services.
export const serviceCatalog: ServiceDefinition[] = [
  { id: 'openai', name: 'OpenAI', category: 'ai', description: 'ChatGPT 与 OpenAI API', icon: openAiIcon, ruleSources: [proxyFlowRuleSource('openai', 'OpenAI.yaml', 6)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'claude', name: 'Claude', category: 'ai', description: 'Anthropic Claude', icon: claudeIcon, ruleSources: [proxyFlowRuleSource('claude', 'Claude.yaml', 4)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'google', name: 'Google', category: 'development', description: 'Google 服务', icon: googleIcon, ruleSources: [proxyFlowRuleSource('google', 'Google.yaml', 6)], defaultMatchers: ['DOMAIN'] },
  { id: 'gemini', name: 'Gemini', category: 'ai', description: 'Google Gemini', icon: geminiIcon, ruleSources: [proxyFlowRuleSource('gemini', 'Gemini.yaml', 4)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  { id: 'youtube', name: 'YouTube', category: 'streaming', icon: youtubeIcon, ruleSources: [proxyFlowRuleSource('youtube', 'YouTube.yaml', 7)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  { id: 'netflix', name: 'Netflix', category: 'streaming', icon: netflixIcon, ruleSources: [proxyFlowRuleSource('netflix', 'Netflix.yaml', 7)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'disney', name: 'Disney+', category: 'streaming', icon: disneyIcon, ruleSources: [proxyFlowRuleSource('disney', 'Disney.yaml', 7)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  { id: 'telegram', name: 'Telegram', category: 'social', icon: telegramIcon, ruleSources: [proxyFlowRuleSource('telegram', 'Telegram.yaml', 19)], defaultMatchers: ['DOMAIN-SUFFIX', 'IP-CIDR', 'IP-CIDR6'] },
  { id: 'github', name: 'GitHub', category: 'development', icon: githubIcon, ruleSources: [proxyFlowRuleSource('github', 'GitHub.yaml', 6)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'steam', name: 'Steam', category: 'gaming', icon: steamIcon, ruleSources: [proxyFlowRuleSource('steam', 'Steam.yaml', 8)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'china', name: 'China Mainland', category: 'regional', ruleSources: [{ id: 'builtin-china', provider: 'builtin', format: 'universal', ruleCount: 168 }], defaultMatchers: ['GEOSITE', 'GEOIP'] },
]
