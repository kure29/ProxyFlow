const PROXYFLOW_RULES_BASE_URL = 'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules'

const firstPartyServiceRuleAssets = {
  openai: { mihomo: 'OpenAI.yaml', surge: 'OpenAI.list', ruleCount: 20 },
  claude: { mihomo: 'Claude.yaml', surge: 'Claude.list', ruleCount: 4 },
  google: { mihomo: 'Google.yaml', surge: 'Google.list', ruleCount: 5 },
  gemini: { mihomo: 'Gemini.yaml', surge: 'Gemini.list', ruleCount: 4 },
  youtube: { mihomo: 'YouTube.yaml', surge: 'YouTube.list', ruleCount: 7 },
  netflix: { mihomo: 'Netflix.yaml', surge: 'Netflix.list', ruleCount: 7 },
  disney: { mihomo: 'Disney.yaml', surge: 'Disney.list', ruleCount: 7 },
  telegram: { mihomo: 'Telegram.yaml', surge: 'Telegram.list', ruleCount: 19 },
  github: { mihomo: 'GitHub.yaml', surge: 'GitHub.list', ruleCount: 6 },
  steam: { mihomo: 'Steam.yaml', surge: 'Steam.list', ruleCount: 12 },
} as const

export type FirstPartyServiceId = keyof typeof firstPartyServiceRuleAssets
export type ServiceRuleAssetTarget = 'mihomo' | 'surge'

export interface FirstPartyServiceRuleSource {
  type: 'remote-rule-set'
  url: string
  ruleCount: number
}

export function resolveFirstPartyServiceRuleSource(
  serviceId: string,
  target: ServiceRuleAssetTarget,
): FirstPartyServiceRuleSource | undefined {
  if (!Object.hasOwn(firstPartyServiceRuleAssets, serviceId)) return undefined
  const asset = firstPartyServiceRuleAssets[serviceId as FirstPartyServiceId]
  return {
    type: 'remote-rule-set',
    url: `${PROXYFLOW_RULES_BASE_URL}/${target}/${asset[target]}`,
    ruleCount: asset.ruleCount,
  }
}
