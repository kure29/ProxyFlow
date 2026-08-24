import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../data/newProject'
import { createMihomoOutputProfile } from '../targets/mihomo/profile'
import { LocalProjectStorage, MemoryProjectStorage } from './projectStorage'

class TestWebStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

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
    expect(loaded?.name).toBe(project.name)
    expect(loaded?.primaryTarget).toBe('mihomo')
    expect(loaded?.graph).toEqual(project.graph)

    await storage.clear()
    expect(await storage.load()).toBeNull()
  })

  it('round-trips an internal paused Loon project without changing schema or graph data', async () => {
    const storage = new MemoryProjectStorage()
    const project = createBlankProject('loon')
    const graph = structuredClone(project.graph)
    await storage.save(project)
    const loaded = await storage.load()
    expect(loaded?.version).toBe(project.version)
    expect(loaded?.primaryTarget).toBe('loon')
    expect(loaded?.graph).toEqual(graph)
    expect(loaded?.graph.nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe('loon')
  })

  it('stores independent projects and keeps the selected project active across reloads', async () => {
    const storage = new MemoryProjectStorage()
    const first = createBlankProject('mihomo')
    first.name = 'First Project'
    const second = createBlankProject('sing-box')
    second.name = 'Second Project'

    await storage.save(first)
    await storage.save(second)
    expect((await storage.list()).map(({ name }) => name)).toEqual(['Second Project', 'First Project'])
    expect((await storage.load())?.id).toBe(second.id)

    expect((await storage.activate(first.id))?.name).toBe('First Project')
    expect((await storage.load())?.id).toBe(first.id)
    expect(await storage.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.id, active: true }),
      expect.objectContaining({ id: second.id, active: false }),
    ]))
  })

  it('migrates the legacy single-project slot without changing its id or name', async () => {
    const webStorage = new TestWebStorage()
    const legacy = createBlankProject('mihomo')
    legacy.name = 'Legacy Custom Name'
    webStorage.setItem('proxyflow.project.v1', JSON.stringify(legacy))

    const storage = new LocalProjectStorage(webStorage)
    expect(await storage.load()).toEqual(legacy)
    expect(await storage.list()).toEqual([
      expect.objectContaining({ id: legacy.id, name: 'Legacy Custom Name', active: true }),
    ])
    expect(webStorage.getItem('proxyflow.project.v1')).toBeNull()

    const reloaded = new LocalProjectStorage(webStorage)
    expect((await reloaded.load())?.name).toBe('Legacy Custom Name')
  })

  it('round-trips renamed projects through local storage when switching away and back', async () => {
    const webStorage = new TestWebStorage()
    const storage = new LocalProjectStorage(webStorage)
    const first = createBlankProject('mihomo')
    first.name = 'Renamed Project'
    const second = createBlankProject('sing-box')
    second.name = 'Other Project'

    await storage.save(first)
    await storage.save(second)
    await storage.activate(first.id)

    const reloaded = new LocalProjectStorage(webStorage)
    expect((await reloaded.load())?.name).toBe('Renamed Project')
    expect((await reloaded.load(second.id))?.name).toBe('Other Project')
    expect((await reloaded.activate(second.id))?.name).toBe('Other Project')
    expect((await reloaded.activate(first.id))?.name).toBe('Renamed Project')
  })

  it('does not reactivate an inactive project when its delayed save completes', async () => {
    const webStorage = new TestWebStorage()
    const storage = new LocalProjectStorage(webStorage)
    const first = createBlankProject('mihomo')
    const second = createBlankProject('sing-box')
    await storage.save(first)
    await storage.save(second)
    await storage.activate(second.id)

    first.name = 'Delayed save'
    await storage.save(first, { activate: false })

    expect((await storage.load())?.id).toBe(second.id)
    expect((await storage.load(first.id))?.name).toBe('Delayed save')
  })

  it('keeps a valid active project available when another stored project is corrupt', async () => {
    const webStorage = new TestWebStorage()
    const storage = new LocalProjectStorage(webStorage)
    const corrupt = createBlankProject('sing-box')
    const active = createBlankProject('mihomo')
    active.name = 'Healthy Project'
    await storage.save(corrupt)
    await storage.save(active)
    webStorage.setItem(`proxyflow.projects.item.v1.${encodeURIComponent(corrupt.id)}`, '{not-json')

    expect((await storage.load())?.name).toBe('Healthy Project')
    expect(await storage.list()).toEqual([
      expect.objectContaining({ id: active.id, name: 'Healthy Project', active: true }),
    ])
  })

  it('deletes only the requested project and selects a valid remaining active project', async () => {
    const storage = new MemoryProjectStorage()
    const first = createBlankProject('mihomo')
    const second = createBlankProject('sing-box')
    await storage.save(first)
    await storage.save(second)
    await storage.activate(second.id)

    await storage.clear(first.id)
    expect((await storage.load())?.id).toBe(second.id)
    expect((await storage.list()).map(({ id }) => id)).toEqual([second.id])

    await storage.clear(second.id)
    expect(await storage.load()).toBeNull()
    expect(await storage.list()).toEqual([])
  })
})
