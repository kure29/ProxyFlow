import { describe, expect, it } from 'vitest'
import { serviceCatalog } from './serviceCatalog'

const firstPartyServices = {
  openai: { filename: 'OpenAI.yaml', ruleCount: 20, matchers: ['DOMAIN-SUFFIX'] },
  claude: { filename: 'Claude.yaml', ruleCount: 4, matchers: ['DOMAIN-SUFFIX'] },
  google: { filename: 'Google.yaml', ruleCount: 5, matchers: ['DOMAIN'] },
  gemini: { filename: 'Gemini.yaml', ruleCount: 4, matchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  youtube: { filename: 'YouTube.yaml', ruleCount: 7, matchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  netflix: { filename: 'Netflix.yaml', ruleCount: 7, matchers: ['DOMAIN-SUFFIX'] },
  disney: { filename: 'Disney.yaml', ruleCount: 7, matchers: ['DOMAIN', 'DOMAIN-SUFFIX'] },
  telegram: { filename: 'Telegram.yaml', ruleCount: 19, matchers: ['DOMAIN-SUFFIX', 'IP-CIDR', 'IP-CIDR6'] },
  github: { filename: 'GitHub.yaml', ruleCount: 6, matchers: ['DOMAIN-SUFFIX'] },
  steam: { filename: 'Steam.yaml', ruleCount: 12, matchers: ['DOMAIN-SUFFIX'] },
} as const

describe('built-in service catalog', () => {
  it('contains exactly the ten current branded services without persisted presentation data', () => {
    expect(serviceCatalog.map((service) => service.id)).toEqual(Object.keys(firstPartyServices))
    expect(serviceCatalog).toHaveLength(10)
    expect(serviceCatalog.some((service) => service.id === 'china' || service.name === 'China Mainland')).toBe(false)
    expect(serviceCatalog.every((service) => !('icon' in service) && !('iconDark' in service))).toBe(true)
  })

  it('keeps placeholder repository metadata out of the product model', () => {
    expect(serviceCatalog.flatMap((service) => service.ruleSources).every((source) => source.updatedAt !== 'Mock metadata')).toBe(true)
  })

  it('uses the first-party Mihomo rule source for every remote built-in service', () => {
    for (const [id, expected] of Object.entries(firstPartyServices)) {
      const service = serviceCatalog.find((candidate) => candidate.id === id)
      expect(service).toBeTruthy()
      expect(service?.ruleSources).toHaveLength(1)
      expect(service?.ruleSources[0]).toEqual({
        id: `proxyflow-${id}`,
        provider: 'remote',
        format: 'yaml',
        behavior: 'classical',
        url: `https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/mihomo/${expected.filename}`,
        ruleCount: expected.ruleCount,
      })
      expect(service?.defaultMatchers).toEqual(expected.matchers)
    }

    const remoteSources = serviceCatalog
      .flatMap((service) => service.ruleSources)
      .filter((source) => source.provider === 'remote')
    expect(remoteSources).toHaveLength(10)
    expect(remoteSources.reduce((total, source) => total + (source.ruleCount ?? 0), 0)).toBe(91)
    expect(remoteSources.every((source) => source.url?.includes('/kure29/proxyflow-rules/main/rules/mihomo/'))).toBe(true)
    expect(remoteSources.every((source) => !source.url?.includes('blackmatrix7'))).toBe(true)
  })

})
