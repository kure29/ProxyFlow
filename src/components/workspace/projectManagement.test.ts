import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../data/newProject'
import { deleteStoredProject } from './projectManagement'
import { MemoryProjectStorage } from '../../storage/projectStorage'

describe('project management', () => {
  it('keeps the active project when deleting an inactive project', async () => {
    const storage = new MemoryProjectStorage()
    const active = createBlankProject('mihomo')
    const inactive = createBlankProject('sing-box')
    await storage.save(active)
    await storage.save(inactive)
    await storage.activate(active.id)

    const result = await deleteStoredProject(storage, inactive.id, active.id)
    expect(result.nextProject).toBeNull()
    expect((await storage.load())?.id).toBe(active.id)
    expect(result.projects.map(({ id }) => id)).toEqual([active.id])
  })

  it('hydrates the next project or null after deleting the active project', async () => {
    const storage = new MemoryProjectStorage()
    const first = createBlankProject('mihomo')
    const second = createBlankProject('sing-box')
    await storage.save(first)
    await storage.save(second)
    await storage.activate(second.id)

    const switched = await deleteStoredProject(storage, second.id, second.id)
    expect(switched.nextProject?.id).toBe(first.id)
    const empty = await deleteStoredProject(storage, first.id, first.id)
    expect(empty.nextProject).toBeNull()
    expect(empty.projects).toEqual([])
  })
})
