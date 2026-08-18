import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../data/newProject'
import { createMihomoOutputProfile } from '../targets/mihomo/profile'
import { MemoryProjectStorage } from './projectStorage'

describe('ProjectStorage', () => {
  it('saves, loads and clears a project through the adapter boundary', async () => {
    const storage = new MemoryProjectStorage()
    const project = createBlankProject('mihomo')
    project.graph.nodes.find((node) => node.data.blockType === 'output')!.data.mihomoProfile = {
      ...createMihomoOutputProfile('desktop-tun'), mixedPort: 7893,
    }
    await storage.save(project)
    const loaded = await storage.load()
    expect(loaded?.id).toBe(project.id)
    expect(loaded?.primaryTarget).toBe('mihomo')
    expect(loaded?.graph).toEqual(project.graph)

    await storage.clear()
    expect(await storage.load()).toBeNull()
  })
})
