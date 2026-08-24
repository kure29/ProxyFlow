import { describe, expect, it } from 'vitest'
import { resolveFirstPartyServiceRuleSource, type FirstPartyServiceId } from './serviceRuleAssets'

const loonServiceRuleCases = [
  { id: 'openai', filename: 'OpenAI.list', ruleCount: 20 },
  { id: 'claude', filename: 'Claude.list', ruleCount: 4 },
  { id: 'google', filename: 'Google.list', ruleCount: 5 },
  { id: 'gemini', filename: 'Gemini.list', ruleCount: 4 },
  { id: 'youtube', filename: 'YouTube.list', ruleCount: 7 },
  { id: 'netflix', filename: 'Netflix.list', ruleCount: 7 },
  { id: 'disney', filename: 'Disney.list', ruleCount: 7 },
  { id: 'telegram', filename: 'Telegram.list', ruleCount: 19 },
  { id: 'github', filename: 'GitHub.list', ruleCount: 6 },
  { id: 'steam', filename: 'Steam.list', ruleCount: 12 },
] as const satisfies ReadonlyArray<{ id: FirstPartyServiceId; filename: string; ruleCount: number }>

describe('first-party service rule assets', () => {
  it.each(loonServiceRuleCases)('resolves the exact owned Loon asset for $id', ({ id, filename, ruleCount }) => {
    const source = resolveFirstPartyServiceRuleSource(id, 'loon')

    expect(source).toEqual({
      type: 'remote-rule-set',
      url: `https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/${filename}`,
      ruleCount,
    })

    const url = new URL(source!.url)
    expect(url.protocol).toBe('https:')
    expect(url.hostname).toBe('raw.githubusercontent.com')
    expect(url.pathname).toBe(`/kure29/proxyflow-rules/main/rules/loon/${filename}`)
  })

  it.each(loonServiceRuleCases)('shares the canonical $id rule count across every target', ({ id, ruleCount }) => {
    const counts = (['mihomo', 'surge', 'loon'] as const).map(
      (target) => resolveFirstPartyServiceRuleSource(id, target)?.ruleCount,
    )

    expect(counts).toEqual([ruleCount, ruleCount, ruleCount])
  })

  it.each(['china', 'unknown'])('does not resolve the non-canonical service %s', (serviceId) => {
    expect(resolveFirstPartyServiceRuleSource(serviceId, 'loon')).toBeUndefined()
  })
})
