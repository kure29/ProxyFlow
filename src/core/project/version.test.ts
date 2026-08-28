import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { legacyChinaServiceDefinition } from '../../data/legacyServices'
import { chinaDirectFixture } from '../__fixtures__/graphFixtures'
import { compileGraph } from '../graphCompiler/compileGraph'
import { migrateProject, PROJECT_SCHEMA_VERSION } from './version'

describe('project schema version', () => {
  it('keeps current V2 projects unchanged', () => {
    expect(PROJECT_SCHEMA_VERSION).toBe(2)
    expect(migrateProject(demoProject)).toEqual(expect.objectContaining({ success: true, migrated: false, project: demoProject }))
  })

  it('preserves optional Surge G1 intent at the V2 migration boundary', () => {
    const project = structuredClone(demoProject)
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    output.data.targetNativeSurgeGeneralNetwork = {
      target: 'surge', kind: 'general-network', ipv6: false, ipv6Vif: 'always', icmpForwarding: true,
    }
    const result = migrateProject(project)
    expect(result.success).toBe(true)
    expect(result.project?.graph.nodes.find((node) => node.id === output.id)?.data.targetNativeSurgeGeneralNetwork).toEqual(output.data.targetNativeSurgeGeneralNetwork)
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

  it('normalizes a resolverless V2 DNS node to automatic Universal intent', () => {
    const project = structuredClone(demoProject)
    const dns = project.graph.nodes.find((node) => node.data.blockType === 'dns')!
    dns.data.dnsResolvers = []
    delete dns.data.universalDnsMode
    const result = migrateProject(project)
    expect(result.success).toBe(true)
    expect(result.migrated).toBe(true)
    expect(result.project?.graph.nodes.find((node) => node.id === dns.id)?.data.universalDnsMode).toBe('automatic')
  })

  it('normalizes an enabled-resolver V2 DNS node to custom Universal intent', () => {
    const project = structuredClone(demoProject)
    const dns = project.graph.nodes.find((node) => node.data.blockType === 'dns')!
    delete dns.data.universalDnsMode
    const result = migrateProject(project)
    expect(result.project?.graph.nodes.find((node) => node.id === dns.id)?.data.universalDnsMode).toBe('custom')
  })

  it('preserves explicit DNS modes through current-schema normalization and V1 migration', () => {
    const current = structuredClone(demoProject)
    const currentDns = current.graph.nodes.find((node) => node.data.blockType === 'dns')!
    currentDns.data.universalDnsMode = 'none'
    currentDns.data.dnsResolvers = [{ id: 'retained', name: 'Retained', kind: 'doh', role: 'default', address: '', enabled: true }]
    expect(migrateProject(current).project?.graph.nodes.find((node) => node.id === currentDns.id)?.data.universalDnsMode).toBe('none')

    const v1 = structuredClone(current)
    v1.version = 1
    const v1Dns = v1.graph.nodes.find((node) => node.data.blockType === 'dns')!
    delete v1Dns.data.universalDnsMode
    v1Dns.data.dnsResolvers = []
    expect(migrateProject(v1).project?.graph.nodes.find((node) => node.id === v1Dns.id)?.data.universalDnsMode).toBe('automatic')
  })

  it.each([
    ['malformed array element', [{ id: 'bad', name: 'Bad', kind: 'doh', role: 'default', address: 42, enabled: true } as never]],
    ['malformed non-array', { invalid: true } as never],
    ['mixed valid and malformed entries', [
      { id: 'valid', name: 'Valid', kind: 'doh', role: 'default', address: 'https://dns.example/dns-query', enabled: true },
      { id: 'bad', name: 'Bad', kind: 'doh', role: 'default', address: 42, enabled: true } as never,
    ]],
  ] as const)('preserves fail-closed semantics for current V2 %s DNS data', (_label, rawResolvers) => {
    const project = structuredClone(demoProject)
    const dns = project.graph.nodes.find((node) => node.data.blockType === 'dns')!
    delete dns.data.universalDnsMode
    dns.data.dnsResolvers = rawResolvers as never
    const migrated = migrateProject(project)
    expect(migrated.success).toBe(true)
    expect(migrated.project?.graph.nodes.find((node) => node.id === dns.id)?.data.universalDnsMode).toBeUndefined()
    const direct = compileGraph(project)
    const hydrated = compileGraph(migrated.project!)
    for (const result of [direct, hydrated]) {
      expect(result.success).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'DNS_RESOLVER_INVALID', severity: 'error' }))
    }
  })

  it('preserves fail-closed malformed resolver semantics through V1 migration', () => {
    const project = structuredClone(demoProject)
    project.version = 1
    const dns = project.graph.nodes.find((node) => node.data.blockType === 'dns')!
    delete dns.data.universalDnsMode
    dns.data.dnsResolvers = { invalid: true } as never
    const migrated = migrateProject(project)
    expect(migrated.success).toBe(true)
    expect(migrated.project?.graph.nodes.find((node) => node.id === dns.id)?.data.universalDnsMode).toBeUndefined()
    const result = compileGraph(migrated.project!)
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'DNS_RESOLVER_INVALID', severity: 'error' }))
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
