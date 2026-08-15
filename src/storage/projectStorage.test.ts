import { describe, expect, it } from 'vitest'
import { demoProject } from '../data/demoProject'
import { MemoryProjectStorage } from './projectStorage'

describe('ProjectStorage', () => {
  it('saves, loads and clears a project through the adapter boundary', async () => {
    const storage = new MemoryProjectStorage()
    await storage.save(demoProject)
    const loaded = await storage.load()
    expect(loaded?.id).toBe(demoProject.id)
    expect(loaded?.graph.nodes).toHaveLength(demoProject.graph.nodes.length)

    await storage.clear()
    expect(await storage.load()).toBeNull()
  })
})
