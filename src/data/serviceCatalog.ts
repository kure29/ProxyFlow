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

const iosRuleSource = (service: string, ruleCount: number) => ({
  id: `ios-${service.toLowerCase().replaceAll(' ', '-')}`,
  provider: 'ios-rule-script' as const,
  format: 'yaml' as const,
  behavior: 'classical' as const,
  url: `https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/${service}/${service}.yaml`,
  ruleCount,
})

// Service-only brand artwork and exact source revisions are recorded beside the assets.
// Brand marks are used only to identify their respective services.
export const serviceCatalog: ServiceDefinition[] = [
  { id: 'openai', name: 'OpenAI', category: 'ai', description: 'ChatGPT 与 OpenAI API', icon: openAiIcon, ruleSources: [iosRuleSource('OpenAI', 42)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX', 'IP-CIDR'] },
  { id: 'claude', name: 'Claude', category: 'ai', description: 'Anthropic Claude', icon: claudeIcon, ruleSources: [iosRuleSource('Claude', 24)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'google', name: 'Google', category: 'development', description: 'Google 服务', icon: googleIcon, ruleSources: [iosRuleSource('Google', 701)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX', 'IP-CIDR'] },
  { id: 'gemini', name: 'Gemini', category: 'ai', description: 'Google Gemini', icon: geminiIcon, ruleSources: [iosRuleSource('Gemini', 31)], defaultMatchers: ['DOMAIN-SUFFIX', 'IP-CIDR'] },
  { id: 'youtube', name: 'YouTube', category: 'streaming', icon: youtubeIcon, ruleSources: [iosRuleSource('YouTube', 186)], defaultMatchers: ['DOMAIN', 'DOMAIN-SUFFIX', 'IP-CIDR'] },
  { id: 'netflix', name: 'Netflix', category: 'streaming', icon: netflixIcon, ruleSources: [iosRuleSource('Netflix', 94)], defaultMatchers: ['DOMAIN-SUFFIX', 'IP-CIDR'] },
  { id: 'disney', name: 'Disney+', category: 'streaming', icon: disneyIcon, ruleSources: [iosRuleSource('Disney', 63)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'telegram', name: 'Telegram', category: 'social', icon: telegramIcon, ruleSources: [iosRuleSource('Telegram', 28)], defaultMatchers: ['IP-CIDR', 'IP-CIDR6'] },
  { id: 'github', name: 'GitHub', category: 'development', icon: githubIcon, ruleSources: [iosRuleSource('GitHub', 78)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'steam', name: 'Steam', category: 'gaming', icon: steamIcon, ruleSources: [iosRuleSource('Steam', 71)], defaultMatchers: ['DOMAIN-SUFFIX'] },
  { id: 'china', name: 'China Mainland', category: 'regional', ruleSources: [{ id: 'builtin-china', provider: 'builtin', format: 'universal', ruleCount: 168 }], defaultMatchers: ['GEOSITE', 'GEOIP'] },
]
