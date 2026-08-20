import { describe, expect, it } from 'vitest'
import { serviceCatalog } from './serviceCatalog'

describe('built-in service artwork', () => {
  it('ships every branded built-in service with local artwork and real rule support', () => {
    const required = ['openai', 'claude', 'google', 'gemini', 'youtube', 'netflix', 'disney', 'telegram', 'github', 'steam']
    for (const id of required) {
      const service = serviceCatalog.find((candidate) => candidate.id === id)
      expect(service?.icon).toBeTruthy()
      expect(service?.icon).not.toContain('jsdelivr')
      expect(service?.ruleSources.length).toBeGreaterThan(0)
    }
  })

  it('uses distinct Google and Gemini artwork and includes Disney+', () => {
    const byId = new Map(serviceCatalog.map((service) => [service.id, service]))
    expect(byId.get('google')?.icon).toBeTruthy()
    expect(byId.get('gemini')?.icon).toBeTruthy()
    expect(byId.get('gemini')?.icon).not.toBe(byId.get('google')?.icon)
    expect(byId.get('disney')?.icon).toBeTruthy()
  })

  it('keeps placeholder repository metadata out of the product model', () => {
    expect(serviceCatalog.flatMap((service) => service.ruleSources).every((source) => source.updatedAt !== 'Mock metadata')).toBe(true)
  })
})
