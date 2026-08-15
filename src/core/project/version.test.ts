import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { migrateProject, PROJECT_SCHEMA_VERSION } from './version'

describe('project schema version', () => {
  it('keeps current V2 projects unchanged', () => {
    expect(PROJECT_SCHEMA_VERSION).toBe(2)
    expect(migrateProject(demoProject)).toEqual(expect.objectContaining({ success: true, migrated: false, project: demoProject }))
  })

  it('repairs the legacy Final → Output semantic', () => {
    const legacy = structuredClone(demoProject)
    legacy.version = 1
    const final = legacy.graph.nodes.find((node) => node.data.blockType === 'final')!
    final.data.targetId = 'output'
    final.data.targetLabel = 'Default Proxy'
    delete final.data.targetKind
    const result = migrateProject(legacy)
    expect(result).toEqual(expect.objectContaining({ success: true, migrated: true, toVersion: 2 }))
    expect(result.project?.graph.nodes.find((node) => node.id === final.id)?.data).toEqual(expect.objectContaining({
      targetId: 'us-via-hk', targetKind: 'strategy',
    }))
    expect(result.project?.graph.nodes.find((node) => node.id === 'dns')?.data.subtitle).toBe('基础 DNS · redir-host')
    expect(result.project?.graph.nodes.find((node) => node.id === 'output')?.data).toEqual(expect.objectContaining({
      subtitle: '真实编译 · MVP', compatibility: 'Compiled',
    }))
    expect(result.project?.graph.edges).toContainEqual(expect.objectContaining({ source: final.id, target: 'us-via-hk', data: { semantic: 'route' } }))
  })

  it('fails closed for unknown project versions without overwriting recovery data', () => {
    expect(migrateProject({ ...demoProject, version: 99 })).toEqual(expect.objectContaining({
      success: false, recoveryRequired: true, fromVersion: 99, toVersion: 2,
    }))
  })
})
