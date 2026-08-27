import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { legacyChinaServiceDefinition } from '../../data/legacyServices'
import { chinaDirectFixture } from '../__fixtures__/graphFixtures'
import { migrateProject, PROJECT_SCHEMA_VERSION } from './version'

describe('project schema version', () => {
  it('keeps current V2 projects unchanged', () => {
    expect(PROJECT_SCHEMA_VERSION).toBe(2)
    expect(migrateProject(demoProject)).toEqual(expect.objectContaining({ success: true, migrated: false, project: demoProject }))
  })

  it('normalizes missing and numeric-string Limit defaults in legacy V2 project data', () => {
    const project = structuredClone(demoProject)
    project.graph.nodes.push({
      id: 'limit-default', type: 'block', position: { x: 0, y: 0 },
      data: { blockType: 'limit', category: 'processing', title: 'Limit', subtitle: 'Limit', icon: 'list-end' },
    }, {
      id: 'limit-string', type: 'block', position: { x: 0, y: 0 },
      data: { blockType: 'limit', category: 'processing', title: 'Limit', subtitle: 'Limit', icon: 'list-end', limit: '20' as unknown as number },
    })
    const result = migrateProject(project)
    expect(result).toEqual(expect.objectContaining({ success: true, migrated: true }))
    expect(result.project?.graph.nodes.find((node) => node.id === 'limit-default')?.data.limit).toBe(10)
    expect(result.project?.graph.nodes.find((node) => node.id === 'limit-string')?.data.limit).toBe(20)
  })

  it('keeps legacy URL subscriptions materialized while preserving explicit modes', () => {
    const project = structuredClone(demoProject)
    project.graph.nodes.push({
      id: 'legacy-url', type: 'block', position: { x: 0, y: 0 },
      data: { blockType: 'subscription', category: 'source', title: 'Legacy URL', subtitle: 'Legacy', icon: 'radio', subscriptionInputKind: 'url', subscriptionUrl: 'https://example.com/sub' },
    }, {
      id: 'new-url', type: 'block', position: { x: 0, y: 0 },
      data: { blockType: 'subscription', category: 'source', title: 'New URL', subtitle: 'New', icon: 'radio', subscriptionInputKind: 'url', subscriptionUrl: 'https://example.com/new', subscriptionExportMode: 'auto' },
    })
    const result = migrateProject(project)
    expect(result).toEqual(expect.objectContaining({ success: true, migrated: true }))
    expect(result.project?.graph.nodes.find((node) => node.id === 'legacy-url')?.data.subscriptionExportMode).toBe('materialized')
    expect(result.project?.graph.nodes.find((node) => node.id === 'new-url')?.data.subscriptionExportMode).toBe('auto')
  })

  it('normalizes historical China Service data into hidden compatibility without changing its route', () => {
    const project = structuredClone(demoProject)
    project.services.push({ ...legacyChinaServiceDefinition, description: 'Former product catalog entry' })
    project.graph.nodes.push({
      id: 'legacy-china-route', type: 'block', position: { x: 0, y: 0 },
      data: {
        blockType: 'service-rule', category: 'routing', title: 'Legacy China', subtitle: '', icon: 'landmark',
        services: ['china'], targetKind: 'direct', targetId: 'output', targetLabel: 'DIRECT',
        routePriority: 42, disabled: true,
      },
    })

    const result = migrateProject(project)
    expect(result).toEqual(expect.objectContaining({ success: true, migrated: true }))
    expect(result.project?.services).toEqual([...demoProject.services, legacyChinaServiceDefinition])
    expect(result.project?.graph.nodes.find((node) => node.id === 'legacy-china-route')?.data).toEqual(expect.objectContaining({
      services: ['china'], targetKind: 'direct', targetId: 'output', routePriority: 42, disabled: true,
    }))
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

  it('normalizes legacy V1 route targets once before compiler ownership', () => {
    const legacy = structuredClone(chinaDirectFixture)
    for (const node of legacy.graph.nodes.filter((item) => item.data.category === 'routing')) delete node.data.targetKind
    legacy.graph.nodes.find((node) => node.id === 'final')!.data.targetLabel = 'DIRECT'
    const result = migrateProject(legacy)
    expect(result).toEqual(expect.objectContaining({ success: true, migrated: true, toVersion: 2 }))
    expect(result.project?.graph.nodes.find((node) => node.id === 'china-route')?.data).toEqual(expect.objectContaining({
      targetId: 'output', targetLabel: 'DIRECT', targetKind: 'direct',
    }))
    expect(result.project?.graph.nodes.find((node) => node.id === 'final')?.data).toEqual(expect.objectContaining({
      targetId: 'auto', targetKind: 'strategy',
    }))
  })

  it('fails closed for unknown project versions without overwriting recovery data', () => {
    expect(migrateProject({ ...demoProject, version: 99 })).toEqual(expect.objectContaining({
      success: false, recoveryRequired: true, fromVersion: 99, toVersion: 2,
    }))
  })
})
