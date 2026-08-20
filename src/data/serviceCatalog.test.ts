import { describe, expect, it } from 'vitest'
import { serviceCatalog } from './serviceCatalog'

describe('service catalog artwork', () => {
  it('ships the required built-in services with local, licensed brand artwork', () => {
    const required = ['openai', 'claude', 'google', 'netflix', 'telegram', 'youtube']
    expect(required.every((id) => serviceCatalog.some((service) => service.id === id))).toBe(true)
    for (const id of required) {
      const service = serviceCatalog.find((candidate) => candidate.id === id)!
      expect(service.icon).toContain('image/svg+xml')
      expect(service.icon).not.toContain('jsdelivr')
      expect(service.ruleSources.length).toBeGreaterThan(0)
    }
  })

  it('keeps repository implementation metadata internal and removes placeholder timestamps', () => {
    expect(serviceCatalog.flatMap((service) => service.ruleSources).every((source) => source.updatedAt !== 'Mock metadata')).toBe(true)
  })
})
