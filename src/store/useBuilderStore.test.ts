import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { demoProject } from '../data/demoProject'
import { hktDemoSubscription } from '../data/demoSubscriptions'
import { compileGraph } from '../core/graphCompiler'
import { v08BasicRoutingFixture } from '../core/__fixtures__/v08Acceptance'
import { deriveProjectRuntime } from '../core/proxySet'
import { subscriptionRuntimeRepository } from '../core/subscription'
import { useBuilderStore } from './useBuilderStore'
import { createMihomoOutputProfile } from '../targets/mihomo/profile'
import { createBlankProject } from '../data/newProject'
import { legacyChinaServiceDefinition } from '../data/legacyServices'
import { appendDnsResolverPreset, deleteDnsResolver, patchDnsResolver } from '../core/dns/resolverProfiles'
import { getTargetBranch } from '../core/targetBranch'

function semanticNodes(nodes: ReturnType<typeof useBuilderStore.getState>['nodes']) {
  return nodes.map((node) => {
    const data = { ...node.data }
    if (data.titleKey) data.title = data.titleKey
    if (data.subtitleKey) data.subtitle = data.subtitleKey
    return { ...node, data }
  })
}

describe('builder store', () => {
  beforeEach(() => {
    useBuilderStore.getState().hydrate(structuredClone(demoProject))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('adds and removes a node', () => {
    const initialCount = useBuilderStore.getState().nodes.length
    const id = useBuilderStore.getState().addNode('manual-proxy', { x: 120, y: 120 })
    expect(id).toBeTruthy()
    expect(useBuilderStore.getState().nodes).toHaveLength(initialCount + 1)
    useBuilderStore.getState().removeNode(id!)
    expect(useBuilderStore.getState().nodes).toHaveLength(initialCount)
  })

  it('persists optional target settings without changing the shared graph', () => {
    const graphBefore = structuredClone({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges })
    useBuilderStore.getState().setTargetSettings({ mihomo: { mixedPort: 7999, allowLan: false, ipv6: false } })
    expect(useBuilderStore.getState().toProject().targetSettings).toEqual({ mihomo: { mixedPort: 7999, allowLan: false, ipv6: false } })
    expect({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges }).toEqual(graphBefore)

    const saved = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    useBuilderStore.getState().hydrate(saved)
    expect(useBuilderStore.getState().targetSettings).toEqual({ mihomo: { mixedPort: 7999, allowLan: false, ipv6: false } })
  })

  it('updates only Mihomo settings, preserves other target sections, and supports clearing', () => {
    useBuilderStore.getState().setTargetSettings({
      mihomo: { mixedPort: 7890, allowLan: true },
      surge: { future: true },
    } as any)
    useBuilderStore.getState().updateMihomoTargetSettings({ allowLan: false, ipv6: false })
    expect(useBuilderStore.getState().targetSettings).toEqual({
      mihomo: { mixedPort: 7890, allowLan: false, ipv6: false },
      surge: { future: true },
    })

    useBuilderStore.getState().updateMihomoTargetSettings({ mixedPort: undefined, allowLan: undefined, ipv6: undefined })
    expect(useBuilderStore.getState().targetSettings).toEqual({ surge: { future: true } })
  })

  it('does not save an invalid Mihomo patch', () => {
    useBuilderStore.getState().setTargetSettings({ mihomo: { mixedPort: 7890 } })
    useBuilderStore.getState().updateMihomoTargetSettings({ mixedPort: 70_000 })
    expect(useBuilderStore.getState().targetSettings).toEqual({ mihomo: { mixedPort: 7890 } })
  })

  it('carries a UI-style managed update through Project serialization into Mihomo YAML', async () => {
    useBuilderStore.getState().hydrate(structuredClone(createBlankProject('mihomo')))
    useBuilderStore.getState().updateMihomoTargetSettings({ mixedPort: 7999, allowLan: false, ipv6: false })
    const project = useBuilderStore.getState().toProject()
    const graph = compileGraph(project, { validationTarget: 'mihomo' })
    expect(graph.ir).toBeDefined()
    const result = await getTargetBranch('mihomo')!.compile(graph.ir!, { targetSettings: project.targetSettings })
    expect(result.success).toBe(true)
    expect(result.content).toContain('mixed-port: 7999')
    expect(result.content).toContain('allow-lan: false')
    expect(result.content).toContain('ipv6: false')
  })

  it('keeps managed settings while switching the active target', () => {
    useBuilderStore.getState().hydrate(structuredClone(createBlankProject('mihomo')))
    useBuilderStore.getState().updateMihomoTargetSettings({ mixedPort: 7999, allowLan: false, ipv6: false })
    useBuilderStore.getState().setPrimaryTarget('surge')
    expect(useBuilderStore.getState().primaryTarget).toBe('surge')
    expect(useBuilderStore.getState().targetSettings).toEqual({ mihomo: { mixedPort: 7999, allowLan: false, ipv6: false } })
  })

  it('creates every Strategy menu option as the expected graph block', () => {
    const types = ['manual-select', 'auto-select', 'fallback', 'load-balance', 'proxy-chain'] as const
    const ids = types.map((type, index) => useBuilderStore.getState().addNode(type, { x: 120 + index * 30, y: 120 })!)
    expect(ids.every(Boolean)).toBe(true)
    expect(ids.map((id) => useBuilderStore.getState().nodes.find((node) => node.id === id)?.data.blockType)).toEqual([...types])
    expect(useBuilderStore.getState().nodes.find((node) => node.id === ids[4])?.data.hopIds).toEqual([])
  })

  it('creates Service, Domain, CIDR and Port routing nodes with their matcher state', () => {
    const service = useBuilderStore.getState().addNode('service-rule', { x: 120, y: 120 }, { routeMatcherKind: 'service', services: ['openai'] })!
    const domain = useBuilderStore.getState().addNode('custom-rule', { x: 160, y: 120 }, { routeMatcherKind: 'domain-suffix', routeMatcherValue: 'example.com' })!
    const cidr = useBuilderStore.getState().addNode('custom-rule', { x: 200, y: 120 }, { routeMatcherKind: 'ip-cidr', routeMatcherValue: '192.0.2.0/24' })!
    const port = useBuilderStore.getState().addNode('custom-rule', { x: 240, y: 120 }, { routeMatcherKind: 'port', routeMatcherPort: 443 })!
    expect(useBuilderStore.getState().nodes.filter(({ id }) => [service, domain, cidr, port].includes(id)).map(({ data }) => ({
      blockType: data.blockType, routeMatcherKind: data.routeMatcherKind, routeMatcherValue: data.routeMatcherValue, routeMatcherPort: data.routeMatcherPort,
    }))).toEqual([
      { blockType: 'service-rule', routeMatcherKind: 'service', routeMatcherValue: undefined, routeMatcherPort: undefined },
      { blockType: 'custom-rule', routeMatcherKind: 'domain-suffix', routeMatcherValue: 'example.com', routeMatcherPort: undefined },
      { blockType: 'custom-rule', routeMatcherKind: 'ip-cidr', routeMatcherValue: '192.0.2.0/24', routeMatcherPort: undefined },
      { blockType: 'custom-rule', routeMatcherKind: 'port', routeMatcherValue: '', routeMatcherPort: 443 },
    ])
  })

  it('creates pasted-link and configuration-file library actions as subscription sources', () => {
    const pastedId = useBuilderStore.getState().addLibraryNode('manual-proxy', { x: 120, y: 120 })!
    const fileId = useBuilderStore.getState().addLibraryNode('import-config', { x: 240, y: 120 })!
    const pasted = useBuilderStore.getState().nodes.find((node) => node.id === pastedId)!
    const file = useBuilderStore.getState().nodes.find((node) => node.id === fileId)!

    expect(pasted.data).toEqual(expect.objectContaining({
      blockType: 'subscription', subscriptionInputKind: 'paste', titleKey: 'library.source.pasteLinksTitle', icon: 'clipboard-paste',
    }))
    expect(file.data).toEqual(expect.objectContaining({
      blockType: 'subscription', subscriptionInputKind: 'file', titleKey: 'library.source.configFileTitle', icon: 'file-input',
    }))
    expect(useBuilderStore.getState().addNode('manual-proxy', { x: 360, y: 120 })).toBeTruthy()
    expect(useBuilderStore.getState().nodes.at(-1)?.data.blockType).toBe('manual-proxy')
  })

  it('applies Workspace creation data in the same add transaction', () => {
    const id = useBuilderStore.getState().addLibraryNode('service-rule', { x: 120, y: 120 }, {
      routeMatcherKind: 'port',
      routeMatcherPort: 443,
    })!

    expect(useBuilderStore.getState().nodes.find((item) => item.id === id)?.data).toEqual(expect.objectContaining({
      blockType: 'service-rule', routeMatcherKind: 'port', routeMatcherPort: 443,
    }))
  })

  it('moves routing rules to a list index with undo support', () => {
    const before = useBuilderStore.getState().nodes
      .filter((node) => ['routing-group', 'service-rule', 'custom-rule'].includes(node.data.blockType))
      .map((node) => node.id)
    const last = before.at(-1)!
    useBuilderStore.getState().moveRoutingRuleToIndex(last, 0)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === last)?.data.routePriority).toBe(10)
    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().nodes.find((node) => node.id === last)?.data.routePriority).toBeUndefined()
  })

  it('replaces Workspace inputs atomically and preserves undo', () => {
    expect(useBuilderStore.getState().setWorkspaceInputs('us-filter', ['hkt-subscription'])).toBe(true)
    expect(useBuilderStore.getState().edges.filter((edge) => edge.target === 'us-filter').map((edge) => edge.source)).toEqual(['hkt-subscription'])

    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().edges.filter((edge) => edge.target === 'us-filter').map((edge) => edge.source)).toEqual(['us-subscription'])
  })

  it('rejects invalid Workspace input connections without changing the graph', () => {
    const before = structuredClone(useBuilderStore.getState().edges)
    expect(useBuilderStore.getState().setWorkspaceInputs('us-filter', ['china-route'])).toBe(false)
    expect(useBuilderStore.getState().edges).toEqual(before)
  })

  it('does not expose Routing rules as Strategy input candidates', () => {
    const before = structuredClone(useBuilderStore.getState().edges)
    expect(useBuilderStore.getState().setWorkspaceInputs('hk-auto', ['final-route'])).toBe(false)
    expect(useBuilderStore.getState().edges).toEqual(before)
  })

  it('moves a linear Processing step atomically with one undo and redo entry', () => {
    const project = createBlankProject('mihomo')
    project.graph.nodes.unshift(
      { id: 'source', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'subscription', category: 'source', title: 'Source', subtitle: '', icon: 'radio' } },
      { id: 'filter', type: 'block', position: { x: 1, y: 0 }, data: { blockType: 'filter', category: 'processing', title: 'Filter', subtitle: '', icon: 'list-filter' } },
      { id: 'rename', type: 'block', position: { x: 2, y: 0 }, data: { blockType: 'rename', category: 'processing', title: 'Rename', subtitle: '', icon: 'text-cursor-input' } },
      { id: 'strategy', type: 'block', position: { x: 3, y: 0 }, data: { blockType: 'auto-select', category: 'strategy', title: 'Auto', subtitle: '', icon: 'gauge' } },
    )
    project.graph.edges = [
      { id: 'before', source: 'source', target: 'filter', data: { semantic: 'data' } },
      { id: 'bridge', source: 'filter', target: 'rename', data: { semantic: 'data' } },
      { id: 'after', source: 'rename', target: 'strategy', data: { semantic: 'data' } },
    ]
    useBuilderStore.getState().hydrate(project)

    expect(useBuilderStore.getState().moveProcessingStep('filter', 'down')).toBe(true)
    const moved = useBuilderStore.getState().edges.map(({ id, source, target }) => ({ id, source, target }))
    expect(moved).toEqual([
      { id: 'before', source: 'source', target: 'rename' },
      { id: 'bridge', source: 'rename', target: 'filter' },
      { id: 'after', source: 'filter', target: 'strategy' },
    ])
    expect(useBuilderStore.getState().historyPast).toHaveLength(1)

    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().edges.map(({ id, source, target }) => ({ id, source, target }))).toEqual([
      { id: 'before', source: 'source', target: 'filter' },
      { id: 'bridge', source: 'filter', target: 'rename' },
      { id: 'after', source: 'rename', target: 'strategy' },
    ])
    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().edges.map(({ id, source, target }) => ({ id, source, target }))).toEqual(moved)
  })

  it('creates, duplicates and reloads Limit nodes with numeric default 10', () => {
    const id = useBuilderStore.getState().addNode('limit', { x: 120, y: 120 })!
    expect(useBuilderStore.getState().nodes.find((node) => node.id === id)?.data.limit).toBe(10)
    useBuilderStore.getState().duplicateNode(id)
    const duplicate = useBuilderStore.getState().nodes.find((node) => node.id === useBuilderStore.getState().selectedNodeId)
    expect(duplicate?.data.limit).toBe(10)

    const project = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    useBuilderStore.getState().hydrate(project)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === id)?.data.limit).toBe(10)
    expect(typeof useBuilderStore.getState().nodes.find((node) => node.id === id)?.data.limit).toBe('number')
  })

  it('round-trips explicit Rename mode and regex flags', () => {
    const id = useBuilderStore.getState().addNode('rename', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(id, {
      renameMode: 'regex', renamePattern: '^(HK|SG)-(.+)$', renameReplacement: '$1 | $2', renameIgnoreCase: true, renameGlobal: false,
    })
    const project = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    useBuilderStore.getState().hydrate(project)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === id)?.data).toEqual(expect.objectContaining({
      renameMode: 'regex', renamePattern: '^(HK|SG)-(.+)$', renameReplacement: '$1 | $2', renameIgnoreCase: true, renameGlobal: false,
    }))
  })

  it('connects compatible nodes and rejects incompatible nodes', () => {
    const initialCount = useBuilderStore.getState().edges.length
    expect(useBuilderStore.getState().connect({ source: 'hkt-subscription', target: 'hk-filter', sourceHandle: null, targetHandle: null })).toBe(true)
    expect(useBuilderStore.getState().edges).toHaveLength(initialCount + 1)
    expect(useBuilderStore.getState().connect({ source: 'output', target: 'hkt-subscription', sourceHandle: null, targetHandle: null })).toBe(false)
  })

  it('updates node data and supports undo', () => {
    useBuilderStore.getState().updateNodeData('hk-filter', { title: 'HK Only' })
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'hk-filter')?.data.title).toBe('HK Only')
    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'hk-filter')?.data.title).toBe('香港节点筛选')
  })

  it('opens Preview on the Primary Target unless another production target is requested', () => {
    useBuilderStore.getState().setPreviewOpen(true)
    expect(useBuilderStore.getState()).toEqual(expect.objectContaining({ previewOpen: true, previewTarget: 'mihomo' }))

    useBuilderStore.getState().setPreviewOpen(true, 'sing-box')
    expect(useBuilderStore.getState()).toEqual(expect.objectContaining({ previewOpen: true, previewTarget: 'sing-box' }))
  })

  it('keeps existing selection when a node is selected additively', () => {
    useBuilderStore.getState().selectNode('hk-filter')
    useBuilderStore.getState().selectNode('us-filter', null, true)
    useBuilderStore.getState().onNodesChange([
      { id: 'hk-filter', type: 'select', selected: false },
      { id: 'us-filter', type: 'select', selected: true },
    ])
    expect(useBuilderStore.getState().nodes.filter((node) => node.selected).map((node) => node.id)).toEqual(['hk-filter', 'us-filter'])
    expect(useBuilderStore.getState().selectedNodeId).toBe('us-filter')
  })

  it('round-trips the optional Filter model without changing the project schema version', () => {
    useBuilderStore.getState().updateNodeData('hk-filter', {
      filterMode: 'region', filterOperation: 'exclude', filterRegions: ['HK', 'SG'],
      filterRegexPattern: '^(HK|SG)-', filterRegexIgnoreCase: false,
    })
    const serialized = JSON.stringify(useBuilderStore.getState().toProject())
    useBuilderStore.getState().selectNode('output')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'hk-filter')?.data.filterRegions).toEqual(['HK', 'SG'])
    const project = JSON.parse(serialized)
    expect(project.version).toBe(2)
    useBuilderStore.getState().hydrate(project)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'hk-filter')?.data).toEqual(expect.objectContaining({
      filterMode: 'region', filterOperation: 'exclude', filterRegions: ['HK', 'SG'],
      filterRegexPattern: '^(HK|SG)-', filterRegexIgnoreCase: false,
    }))
  })

  it('round-trips multiple DNS resolvers through undo, redo and Schema 2 hydration', () => {
    const dnsId = useBuilderStore.getState().addNode('dns', { x: 120, y: 120 })!
    let resolvers = appendDnsResolverPreset([], 'cloudflare')
    resolvers = appendDnsResolverPreset(resolvers, 'alidns')
    resolvers = appendDnsResolverPreset(resolvers, 'google')
    const aliDnsId = resolvers.find((resolver) => resolver.presetId === 'alidns')!.id
    const googleId = resolvers.find((resolver) => resolver.presetId === 'google')!.id
    resolvers = patchDnsResolver(resolvers, aliDnsId, { name: 'AliDNS Direct', role: 'direct' })
    resolvers = deleteDnsResolver(resolvers, googleId)
    useBuilderStore.getState().updateNodeData(dnsId, { dnsResolvers: resolvers })
    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().nodes.find((node) => node.id === dnsId)?.data.dnsResolvers).toHaveLength(2)
    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().nodes.find((node) => node.id === dnsId)?.data.dnsResolvers).toEqual(resolvers)

    const project = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    expect(project.version).toBe(2)
    useBuilderStore.getState().hydrate(project)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === dnsId)?.data.dnsResolvers).toEqual(resolvers)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === dnsId)?.data.dnsResolvers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'AliDNS Direct', role: 'direct' }),
    ]))
  })

  it('round-trips the Mihomo Output Profile in Project Schema 2 with undo and redo', () => {
    const profile = {
      ...createMihomoOutputProfile('desktop-tun'),
      mixedPort: 7893,
      allowLan: true,
      strictRoute: true,
    }
    useBuilderStore.getState().updateNodeData('output', { mihomoProfile: profile })
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(profile)

    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(
      expect.objectContaining({ preset: 'desktop-tun', allowLan: true, ipv6: false }),
    )
    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(profile)

    const project = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    const exportedProfile = project.graph.nodes.find((node: { id: string }) => node.id === 'output').data.mihomoProfile
    expect(project.version).toBe(2)
    expect(exportedProfile).toEqual(profile)
    expect(Object.keys(exportedProfile)).not.toContain('secret')
    expect(Object.keys(exportedProfile)).not.toContain('password')
    expect(Object.keys(exportedProfile)).not.toContain('path')
    expect(JSON.stringify(exportedProfile)).not.toContain('/Users/')

    useBuilderStore.getState().hydrate(project)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(profile)
  })

  it('keeps older Schema 2 projects without a Mihomo Output Profile readable', () => {
    const project = structuredClone(demoProject)
    const output = project.graph.nodes.find((node) => node.id === 'output')!
    delete output.data.mihomoProfile
    useBuilderStore.getState().hydrate(project)
    expect(useBuilderStore.getState().toProject().version).toBe(2)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toBeUndefined()
  })

  it('loads and re-exports historical China routing through hidden compatibility', () => {
    const project = structuredClone(demoProject)
    project.services.push(legacyChinaServiceDefinition)
    project.graph.nodes.push({
      id: 'legacy-china-route', type: 'block', position: { x: 0, y: 0 },
      data: {
        blockType: 'service-rule', category: 'routing', title: 'Legacy China', subtitle: '', icon: 'landmark',
        services: ['china'], targetKind: 'direct', targetId: 'output', targetLabel: 'DIRECT', routePriority: 37,
      },
    })
    project.graph.edges.push({ id: 'legacy-china-output', source: 'legacy-china-route', target: 'output', data: { semantic: 'route' } })

    useBuilderStore.getState().hydrate(project)
    const exported = useBuilderStore.getState().toProject()
    expect(exported.services).toEqual([...demoProject.services, legacyChinaServiceDefinition])
    expect(exported.graph.nodes.find((node) => node.id === 'legacy-china-route')?.data).toEqual(expect.objectContaining({
      services: ['china'], targetKind: 'direct', targetId: 'output', routePriority: 37,
    }))
    expect(compileGraph(exported).ir?.routes).toContainEqual(expect.objectContaining({
      id: 'legacy-china-route', matcher: { kind: 'service', serviceIds: ['china'] }, target: { kind: 'direct' }, priority: 37,
    }))
  })

  it('creates Mihomo, Surge, and historical sing-box projects with matching primary targets', () => {
    useBuilderStore.getState().createNewProject('mihomo')
    const mihomoProjectId = useBuilderStore.getState().projectId
    expect(useBuilderStore.getState().primaryTarget).toBe('mihomo')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data).toEqual(
      expect.objectContaining({
        client: 'mihomo',
        mihomoProfile: expect.objectContaining({ preset: 'desktop-tun', allowLan: true, ipv6: false }),
      }),
    )
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'dns')?.data.dnsResolvers).toEqual([
      expect.objectContaining({ presetId: 'alidns', role: 'default' }),
      expect.objectContaining({ presetId: 'dnspod', role: 'default' }),
    ])
    expect(useBuilderStore.getState().edges).toContainEqual(expect.objectContaining({
      source: 'dns', target: 'output', data: { semantic: 'dns' },
    }))
    expect(useBuilderStore.getState().toProject().primaryTarget).toBe('mihomo')

    useBuilderStore.getState().createNewProject('surge')
    expect(useBuilderStore.getState().primaryTarget).toBe('surge')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data).toEqual(expect.objectContaining({
      client: 'surge', title: 'Surge Output',
    }))
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.mihomoProfile).toBeUndefined()
    expect(useBuilderStore.getState().nodes.some((node) => node.data.blockType === 'dns')).toBe(false)
    expect(useBuilderStore.getState().toProject().primaryTarget).toBe('surge')

    useBuilderStore.getState().createNewProject('sing-box')
    expect(useBuilderStore.getState().projectId).not.toBe(mihomoProjectId)
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe('sing-box')
    expect(useBuilderStore.getState().nodes.some((node) => node.data.blockType === 'dns')).toBe(false)
    expect(useBuilderStore.getState().toProject().primaryTarget).toBe('sing-box')

    useBuilderStore.getState().createNewProject('loon')
    expect(useBuilderStore.getState().primaryTarget).toBe('loon')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data).toEqual(expect.objectContaining({
      client: 'loon', title: 'Loon Output',
    }))
    expect(useBuilderStore.getState().nodes.some((node) => node.data.blockType === 'dns')).toBe(false)
    expect(useBuilderStore.getState().nodes.some((node) => node.data.mihomoProfile !== undefined)).toBe(false)
    expect(useBuilderStore.getState().toProject().primaryTarget).toBe('loon')
  })

  it('uses target-aware DNS defaults only when creating a DNS node', () => {
    for (const target of ['mihomo', 'surge', 'loon', 'shadowrocket'] as const) {
      useBuilderStore.getState().createNewProject(target)
      const id = useBuilderStore.getState().addNode('dns', { x: 240, y: 360 })!
      const data = useBuilderStore.getState().nodes.find((node) => node.id === id)!.data
      if (target === 'mihomo') {
        expect(data.universalDnsMode).toBe('custom')
        expect(data.dnsResolvers).toEqual(expect.arrayContaining([
          expect.objectContaining({ presetId: 'alidns' }),
          expect.objectContaining({ presetId: 'dnspod' }),
        ]))
      } else {
        expect(data.universalDnsMode).toBe('none')
        expect(data.dnsResolvers).toEqual([])
      }
    }
  })

  it('retains DNS intent and resolver drafts across output target switching', () => {
    useBuilderStore.getState().createNewProject('surge')
    const dnsId = useBuilderStore.getState().addNode('dns', { x: 240, y: 360 })!
    const retained = appendDnsResolverPreset([], 'cloudflare')
    useBuilderStore.getState().updateNodeData(dnsId, { universalDnsMode: 'none', dnsResolvers: retained })
    useBuilderStore.getState().setPrimaryTarget('mihomo')
    useBuilderStore.getState().setPrimaryTarget('surge')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === dnsId)?.data).toEqual(expect.objectContaining({
      universalDnsMode: 'none', dnsResolvers: retained,
    }))
  })

  it('renames a new project and preserves the trimmed name through target switches and hydration', () => {
    useBuilderStore.getState().createNewProject('mihomo')
    expect(useBuilderStore.getState().renameProject('  Production routing  ')).toBe(true)
    expect(useBuilderStore.getState().projectName).toBe('Production routing')
    expect(useBuilderStore.getState().toProject().name).toBe('Production routing')

    useBuilderStore.getState().setPrimaryTarget('sing-box')
    useBuilderStore.getState().setPrimaryTarget('mihomo')
    expect(useBuilderStore.getState().projectName).toBe('Production routing')

    const saved = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    useBuilderStore.getState().hydrate(saved)
    expect(useBuilderStore.getState().projectName).toBe('Production routing')
    expect(useBuilderStore.getState().toProject().name).toBe('Production routing')
  })

  it('rejects an empty project rename without restoring the default name', () => {
    useBuilderStore.getState().createNewProject()
    useBuilderStore.getState().renameProject('Keep this name')

    expect(useBuilderStore.getState().renameProject('   ')).toBe(false)
    expect(useBuilderStore.getState().projectName).toBe('Keep this name')
  })

  it('infers legacy primary targets and preserves ambiguous projects verbatim', () => {
    const legacy = createBlankProject('sing-box')
    delete legacy.primaryTarget
    useBuilderStore.getState().hydrate(legacy)
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    expect(useBuilderStore.getState().toProject().primaryTarget).toBe('sing-box')

    const ambiguous = createBlankProject('mihomo')
    delete ambiguous.primaryTarget
    ambiguous.graph.nodes.push({
      ...structuredClone(ambiguous.graph.nodes.find((node) => node.data.blockType === 'output')!),
      id: 'secondary-output',
      data: { ...structuredClone(ambiguous.graph.nodes.find((node) => node.data.blockType === 'output')!.data), client: 'sing-box' },
    })
    const graphBefore = structuredClone(ambiguous.graph)
    useBuilderStore.getState().hydrate(ambiguous)
    expect(useBuilderStore.getState().primaryTarget).toBeNull()
    expect(useBuilderStore.getState().toProject().primaryTarget).toBeUndefined()
    expect({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges }).toEqual(graphBefore)
  })

  it('fails closed for corrupted primary-target metadata without changing the graph', () => {
    const project = createBlankProject('mihomo') as unknown as Record<string, unknown>
    project.primaryTarget = 'future-target'
    const graphBefore = structuredClone(project.graph)
    useBuilderStore.getState().hydrate(project as unknown as ReturnType<typeof createBlankProject>)
    expect(useBuilderStore.getState().primaryTarget).toBeNull()
    expect({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges }).toEqual(graphBefore)
  })

  it('selects a Primary Target for a legacy project without Output without inventing graph data', () => {
    const legacy = createBlankProject('mihomo')
    delete legacy.primaryTarget
    legacy.graph.nodes = legacy.graph.nodes.filter((node) => node.data.blockType !== 'output')
    const graphBefore = structuredClone(legacy.graph)

    useBuilderStore.getState().hydrate(legacy)
    expect(useBuilderStore.getState().primaryTarget).toBeNull()
    useBuilderStore.getState().setPrimaryTarget('sing-box')
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    expect({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges }).toEqual(graphBefore)

    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().primaryTarget).toBeNull()
    expect({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges }).toEqual(graphBefore)
    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
  })

  it('selects and round-trips a multi-Output legacy project without rewriting either Output', () => {
    const legacy = createBlankProject('mihomo')
    delete legacy.primaryTarget
    const mihomoOutput = legacy.graph.nodes.find((node) => node.data.blockType === 'output')!
    mihomoOutput.data.mihomoProfile = { ...createMihomoOutputProfile('desktop-tun'), mixedPort: 7893 }
    legacy.graph.nodes.push({
      ...structuredClone(mihomoOutput),
      id: 'sing-box-output',
      data: { ...structuredClone(mihomoOutput.data), client: 'sing-box', title: 'sing-box Output', mihomoProfile: undefined },
    })
    const graphBefore = structuredClone(legacy.graph)

    useBuilderStore.getState().hydrate(legacy)
    expect(useBuilderStore.getState().primaryTarget).toBeNull()
    useBuilderStore.getState().setPrimaryTarget('sing-box')
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    expect({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges }).toEqual(graphBefore)

    const exported = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    useBuilderStore.getState().hydrate(exported)
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    const reExported = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    expect({ ...reExported, updatedAt: exported.updatedAt }).toEqual(exported)
    expect(useBuilderStore.getState().nodes.map((node) => [node.id, node.data.client])).toEqual([
      ['final-route', undefined], ['dns', undefined], ['output', 'mihomo'], ['sing-box-output', 'sing-box'],
    ])
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(
      expect.objectContaining({ preset: 'desktop-tun', mixedPort: 7893 }),
    )
  })

  it('switches a sole Output non-destructively and includes primary target in undo and redo', () => {
    const profile = { ...createMihomoOutputProfile('desktop-tun'), mixedPort: 7893 }
    useBuilderStore.getState().updateNodeData('output', { mihomoProfile: profile })
    const graphBeforeSwitch = {
      nodes: structuredClone(useBuilderStore.getState().nodes),
      edges: structuredClone(useBuilderStore.getState().edges),
    }

    useBuilderStore.getState().setPrimaryTarget('sing-box')
    const switchedOutput = useBuilderStore.getState().nodes.find((node) => node.id === 'output')!
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    expect(switchedOutput.data.client).toBe('sing-box')
    expect(switchedOutput.data.mihomoProfile).toEqual(profile)
    expect(useBuilderStore.getState().nodes.filter((node) => node.id !== 'output')).toEqual(
      graphBeforeSwitch.nodes.filter((node) => node.id !== 'output'),
    )
    expect(useBuilderStore.getState().edges).toEqual(graphBeforeSwitch.edges)

    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().primaryTarget).toBe('mihomo')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.client).toBe('mihomo')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(profile)

    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.client).toBe('sing-box')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(profile)
  })

  it('switches Mihomo → Loon → undo/redo and preserves graph plus target-native profile', () => {
    const profile = { ...createMihomoOutputProfile('desktop-tun'), mixedPort: 7895 }
    useBuilderStore.getState().updateNodeData('output', { mihomoProfile: profile })
    const graphBeforeSwitch = {
      nodes: structuredClone(useBuilderStore.getState().nodes),
      edges: structuredClone(useBuilderStore.getState().edges),
    }

    useBuilderStore.getState().setPrimaryTarget('loon')
    expect(useBuilderStore.getState().primaryTarget).toBe('loon')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data).toEqual(expect.objectContaining({ client: 'loon', mihomoProfile: profile }))
    expect(useBuilderStore.getState().nodes.filter((node) => node.id !== 'output')).toEqual(graphBeforeSwitch.nodes.filter((node) => node.id !== 'output'))
    expect(useBuilderStore.getState().edges).toEqual(graphBeforeSwitch.edges)

    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().primaryTarget).toBe('mihomo')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe('mihomo')
    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().primaryTarget).toBe('loon')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe('loon')
  })

  it('hydrates a Loon project and keeps the explicit target and output synchronized', () => {
    const project = createBlankProject('loon')
    const graph = structuredClone(project.graph)
    useBuilderStore.getState().hydrate(JSON.parse(JSON.stringify(project)))
    expect(useBuilderStore.getState().primaryTarget).toBe('loon')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe('loon')
    expect({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges }).toEqual(graph)
    expect(useBuilderStore.getState().toProject().version).toBe(project.version)
  })

  it('hydrates an exposed Shadowrocket project without losing target identity or history safety', () => {
    const project = createBlankProject('shadowrocket')
    const graph = structuredClone(project.graph)
    useBuilderStore.getState().hydrate(JSON.parse(JSON.stringify(project)))
    expect(useBuilderStore.getState().primaryTarget).toBe('shadowrocket')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe('shadowrocket')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.compatibility).toBe('Supported')
    expect({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges }).toEqual(graph)
    useBuilderStore.getState().setPrimaryTarget('mihomo')
    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().primaryTarget).toBe('shadowrocket')
  })

  it.each([
    ['mihomo', 'shadowrocket'], ['surge', 'shadowrocket'], ['loon', 'shadowrocket'],
    ['shadowrocket', 'mihomo'], ['shadowrocket', 'surge'], ['shadowrocket', 'loon'],
  ] as const)('preserves graph state across %s → %s exposure transitions', (from, to) => {
    const project = createBlankProject(from)
    project.graph.nodes.push({
      id: 'exposure-source', type: 'block', position: { x: 80, y: 240 },
      data: {
        blockType: 'subscription', category: 'source', title: 'Materialized source', subtitle: 'local snapshot', icon: 'radio',
        subscriptionInputKind: 'paste', subscriptionContent: 'ss://materialized.example.invalid:8388', enabled: true,
      },
    })
    project.graph.nodes.push({
      id: 'exposure-rule', type: 'block', position: { x: 240, y: 240 },
      data: {
        blockType: 'custom-rule', category: 'routing', title: 'Controlled domain', subtitle: 'DOMAIN-SUFFIX', icon: 'route',
        routeMatcherKind: 'domain-suffix', routeMatcherValue: 'controlled.example', targetKind: 'direct', targetId: 'DIRECT', targetLabel: 'DIRECT',
      },
    })
    project.graph.nodes.push({
      id: 'exposure-dns', type: 'block', position: { x: 240, y: 360 },
      data: {
        blockType: 'dns', category: 'dns', title: 'DNS', subtitle: 'system', icon: 'globe-2',
        universalDnsMode: 'custom',
        dnsResolvers: [{ id: 'system', name: 'System', kind: 'system', role: 'default', enabled: true }],
      },
    })
    const before = structuredClone(project.graph)
    useBuilderStore.getState().hydrate(project)
    useBuilderStore.getState().setPrimaryTarget(to)
    const state = useBuilderStore.getState()
    expect(state.primaryTarget).toBe(to)
    expect(semanticNodes(state.nodes.filter((node) => node.data.blockType !== 'output'))).toEqual(semanticNodes(before.nodes.filter((node) => node.data.blockType !== 'output')))
    expect(state.edges).toEqual(before.edges)
    expect(new Set(state.nodes.map((node) => node.id)).size).toBe(state.nodes.length)
    expect(state.nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe(to)

    const hydrated = JSON.parse(JSON.stringify(state.toProject()))
    useBuilderStore.getState().hydrate(hydrated)
    expect(useBuilderStore.getState().primaryTarget).toBe(to)
    expect(semanticNodes(useBuilderStore.getState().nodes.filter((node) => node.data.blockType !== 'output'))).toEqual(semanticNodes(before.nodes.filter((node) => node.data.blockType !== 'output')))
    useBuilderStore.getState().setPrimaryTarget(from)
    expect(useBuilderStore.getState().primaryTarget).toBe(from)
    expect(new Set(useBuilderStore.getState().nodes.map((node) => node.id)).size).toBe(useBuilderStore.getState().nodes.length)
  })

  it.each(['surge', 'sing-box'] as const)('preserves %s ↔ Loon internal target transitions with history', (start) => {
    const project = createBlankProject(start)
    const graph = structuredClone(project.graph)
    const nonOutputNodes = graph.nodes.filter((node) => node.data.blockType !== 'output')
    useBuilderStore.getState().hydrate(project)

    useBuilderStore.getState().setPrimaryTarget('loon')
    expect(useBuilderStore.getState().primaryTarget).toBe('loon')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe('loon')
    expect(useBuilderStore.getState().nodes.filter((node) => node.data.blockType !== 'output')).toEqual(nonOutputNodes)
    expect(useBuilderStore.getState().edges).toEqual(graph.edges)

    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().primaryTarget).toBe(start)
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe(start)
    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().primaryTarget).toBe('loon')
    useBuilderStore.getState().setPrimaryTarget(start)
    expect(useBuilderStore.getState().primaryTarget).toBe(start)
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe(start)
  })

  it('switches Mihomo → Surge → Mihomo without changing the graph or losing the Mihomo profile', () => {
    const profile = { ...createMihomoOutputProfile('desktop-tun'), mixedPort: 7894 }
    useBuilderStore.getState().updateNodeData('output', { mihomoProfile: profile })
    const nonOutputBefore = structuredClone(useBuilderStore.getState().nodes.filter((node) => node.id !== 'output'))
    const edgesBefore = structuredClone(useBuilderStore.getState().edges)

    useBuilderStore.getState().setPrimaryTarget('surge')
    expect(useBuilderStore.getState().primaryTarget).toBe('surge')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data).toEqual(expect.objectContaining({
      client: 'surge', mihomoProfile: profile,
    }))
    expect(useBuilderStore.getState().nodes.filter((node) => node.id !== 'output')).toEqual(nonOutputBefore)
    expect(useBuilderStore.getState().edges).toEqual(edgesBefore)

    const savedSurge = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    useBuilderStore.getState().hydrate(savedSurge)
    expect(useBuilderStore.getState().primaryTarget).toBe('surge')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(profile)
    const nonOutputAfterHydrate = structuredClone(useBuilderStore.getState().nodes.filter((node) => node.id !== 'output'))
    const edgesAfterHydrate = structuredClone(useBuilderStore.getState().edges)

    useBuilderStore.getState().setPrimaryTarget('mihomo')
    expect(useBuilderStore.getState().primaryTarget).toBe('mihomo')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data).toEqual(expect.objectContaining({
      client: 'mihomo', mihomoProfile: profile,
    }))
    expect(useBuilderStore.getState().nodes.filter((node) => node.id !== 'output')).toEqual(nonOutputAfterHydrate)
    expect(useBuilderStore.getState().edges).toEqual(edgesAfterHydrate)
  })

  it('synchronizes a sole supported Output edit without deleting target-native data', () => {
    const profile = { ...createMihomoOutputProfile('desktop-tun'), mixedPort: 7893 }
    useBuilderStore.getState().updateNodeData('output', { mihomoProfile: profile })
    useBuilderStore.getState().setOutputClient('output', 'sing-box')
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(profile)
  })

  it('keeps low-level output edits synchronized for registered targets without registering prototype clients', () => {
    useBuilderStore.getState().setOutputClient('output', 'loon')
    expect(useBuilderStore.getState().primaryTarget).toBe('loon')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data).toEqual(expect.objectContaining({
      client: 'loon', compatibility: 'Supported',
    }))

    useBuilderStore.getState().setOutputClient('output', 'quantumult-x')
    expect(useBuilderStore.getState().primaryTarget).toBeNull()
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data).toEqual(expect.objectContaining({
      client: 'quantumult-x', compatibility: 'Prototype',
    }))
  })

  it('round-trips V0.8 matcher fields and route priority without a schema bump', () => {
    const domain = useBuilderStore.getState().addNode('custom-rule', { x: 120, y: 120 })!
    const cidr = useBuilderStore.getState().addNode('custom-rule', { x: 120, y: 220 })!
    const port = useBuilderStore.getState().addNode('custom-rule', { x: 120, y: 320 })!
    const ruleSet = useBuilderStore.getState().addNode('custom-rule', { x: 120, y: 420 })!
    useBuilderStore.getState().updateNodeData(domain, { routeMatcherKind: 'domain', routeMatcherValue: 'api.example.com', routePriority: 10 })
    useBuilderStore.getState().updateNodeData(cidr, { routeMatcherKind: 'ip-cidr6', routeMatcherValue: '2001:db8::/32', routePriority: 20 })
    useBuilderStore.getState().updateNodeData(port, { routeMatcherKind: 'port', routeMatcherPort: 443, routePriority: 30 })
    useBuilderStore.getState().updateNodeData(ruleSet, { routeMatcherKind: 'rule-set', routeMatcherValue: 'ios-openai', routePriority: 40 })

    const project = JSON.parse(JSON.stringify(useBuilderStore.getState().toProject()))
    expect(project.version).toBe(2)
    useBuilderStore.getState().hydrate(project)
    const data = (id: string) => useBuilderStore.getState().nodes.find((node) => node.id === id)?.data
    expect(data(domain)).toEqual(expect.objectContaining({ routeMatcherKind: 'domain', routeMatcherValue: 'api.example.com', routePriority: 10 }))
    expect(data(cidr)).toEqual(expect.objectContaining({ routeMatcherKind: 'ip-cidr6', routeMatcherValue: '2001:db8::/32', routePriority: 20 }))
    expect(data(port)).toEqual(expect.objectContaining({ routeMatcherKind: 'port', routeMatcherPort: 443, routePriority: 30 }))
    expect(data(ruleSet)).toEqual(expect.objectContaining({ routeMatcherKind: 'rule-set', routeMatcherValue: 'ios-openai', routePriority: 40 }))
  })

  it('round-trips the V0.8 strategy and routing acceptance project through JSON', () => {
    useBuilderStore.getState().hydrate(structuredClone(v08BasicRoutingFixture))
    const before = useBuilderStore.getState().toProject()
    const exported = JSON.parse(JSON.stringify(before))
    expect(exported.version).toBe(2)

    useBuilderStore.getState().hydrate(exported)
    const imported = useBuilderStore.getState().toProject()
    const nodeData = (id: string) => imported.graph.nodes.find((node) => node.id === id)?.data
    expect(nodeData('auto')).toEqual(expect.objectContaining({ blockType: 'auto-select', testUrl: 'https://example.com/ping', interval: 180, tolerance: 60 }))
    expect(nodeData('local')).toEqual(expect.objectContaining({ routeMatcherKind: 'domain-suffix', routeMatcherValue: 'lan', targetKind: 'direct', routePriority: 20 }))
    expect(nodeData('ads')).toEqual(expect.objectContaining({ routeMatcherKind: 'domain-keyword', routeMatcherValue: 'ads', targetKind: 'reject', routePriority: 30 }))
    expect(compileGraph(imported).ir).toEqual(compileGraph(before).ir)
  })

  it('adds, reorders and removes proxy chain hops', () => {
    useBuilderStore.getState().addHop('us-via-hk')
    const chainAfterAdd = useBuilderStore.getState().nodes.find((node) => node.id === 'us-via-hk')!
    expect(chainAfterAdd.data.hopIds).toHaveLength(3)
    const thirdHop = chainAfterAdd.data.hopIds![2]

    useBuilderStore.getState().moveHop('us-via-hk', 2, 1)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'us-via-hk')?.data.hopIds?.[1]).toBe(thirdHop)

    useBuilderStore.getState().removeHop('us-via-hk', thirdHop)
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'us-via-hk')?.data.hopIds).toHaveLength(2)
  })

  it('keeps protected nodes when delete is requested', () => {
    useBuilderStore.getState().removeNode('final-route')
    expect(useBuilderStore.getState().nodes.some((node) => node.id === 'final-route')).toBe(true)
  })

  it('persists embedded paste content but never persists derived subscription snapshots', async () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    const content = 'http://demo:paste-secret@paste.example.com:8080#Paste%20Node'
    await useBuilderStore.getState().parseSubscriptionInput(sourceId, content, 'paste')

    const project = useBuilderStore.getState().toProject()
    const source = project.graph.nodes.find((node) => node.id === sourceId)!
    expect(source.data.subscriptionContent).toBe(content)
    expect(project).not.toHaveProperty('subscriptionSnapshots')
    expect(JSON.stringify(project)).not.toContain('paste.example.com\",\"port')
  })

  it('stores only the file name for local imports and requires re-import after hydration', async () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    const content = 'socks5://file-user:file-secret@file-private.example.com:1080#Local%20File'
    await useBuilderStore.getState().parseSubscriptionInput(sourceId, content, 'file', 'private-subscription.txt')

    const project = useBuilderStore.getState().toProject()
    const source = project.graph.nodes.find((node) => node.id === sourceId)!
    expect(source.data.subscriptionContent).toBeUndefined()
    expect(source.data.subscriptionFileName).toBe('private-subscription.txt')
    expect(JSON.stringify(project)).not.toContain('file-secret')
    expect(JSON.stringify(project)).not.toContain('file-private.example.com')

    useBuilderStore.getState().hydrate(project)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toBeUndefined()
  })

  it('defaults URL sources to Auto and persists profile changes without refreshing in the background', () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    expect(useBuilderStore.getState().nodes.find((node) => node.id === sourceId)?.data.subscriptionRequestProfile).toBe('auto')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === sourceId)?.data.subscriptionExportMode).toBe('auto')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionRequestProfile: 'generic', subscriptionExportMode: 'remote' })
    expect(fetch).not.toHaveBeenCalled()
    expect(useBuilderStore.getState().toProject().graph.nodes.find((node) => node.id === sourceId)?.data.subscriptionRequestProfile).toBe('generic')
    expect(useBuilderStore.getState().toProject().graph.nodes.find((node) => node.id === sourceId)?.data.subscriptionExportMode).toBe('remote')
  })

  it('keeps the last successful URL result when a later browser fetch fails', async () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://subscription.example.com/demo?token=private' })
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('http://demo:secret@cached.example.com:8080#Cached%20Node'))
      .mockRejectedValueOnce(new TypeError('network blocked'))
    vi.stubGlobal('fetch', fetch)

    await useBuilderStore.getState().refreshSubscription(sourceId)
    const successful = useBuilderStore.getState().subscriptionSnapshots[sourceId]
    const successfulRuntime = useBuilderStore.getState().subscriptionRuntimes[sourceId]
    expect(successful.quality).toBe('usable')
    expect(successful.result.readyCount).toBe(1)
    expect(successfulRuntime.refreshStatus).toBe('succeeded')

    await useBuilderStore.getState().refreshSubscription(sourceId)
    const retained = useBuilderStore.getState().subscriptionSnapshots[sourceId]
    const failedRuntime = useBuilderStore.getState().subscriptionRuntimes[sourceId]
    expect(retained).toBe(successful)
    expect(retained.result.proxies.map((proxy) => proxy.id)).toEqual(successful.result.proxies.map((proxy) => proxy.id))
    expect(failedRuntime.refreshStatus).toBe('failed')
    expect(failedRuntime.activeSnapshot).toBe(successful)
    expect(failedRuntime.lastSuccessfulAt).toBe(successfulRuntime.lastSuccessfulAt)
    expect(failedRuntime.lastFailureAt).toBeTruthy()
    expect(failedRuntime.latestFetchPath).toBe('browser')
    expect(failedRuntime.latestError?.message).not.toContain('token=private')
  })

  it('keeps the recorded Runtime fetch path after the service is disconnected', async () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://runtime-path.example.invalid/list', subscriptionRequestProfile: 'mihomo' })
    useBuilderStore.getState().setRuntimeServiceConfig({ baseUrl: 'https://runtime.example.invalid', token: 'fictional-runtime-token' })
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      text: 'socks5://runtime:fictional@runtime-node.example.invalid:1080#Runtime',
    }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)

    await useBuilderStore.getState().refreshSubscription(sourceId)
    expect(useBuilderStore.getState().subscriptionRuntimes[sourceId].latestFetchPath).toBe('runtime')
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(expect.objectContaining({ requestProfile: 'mihomo' }))
    expect(useBuilderStore.getState().toProject().graph.nodes.find((node) => node.id === sourceId)?.data.subscriptionRequestProfile).toBe('mihomo')
    useBuilderStore.getState().disconnectRuntimeService()
    expect(useBuilderStore.getState().subscriptionRuntimes[sourceId].latestFetchPath).toBe('runtime')
  })

  it('keeps downstream Filter output and graph compilation stable after a failed refresh', async () => {
    useBuilderStore.getState().hydrate(structuredClone(demoProject))
    useBuilderStore.getState().updateNodeData('hkt-subscription', { subscriptionUrl: 'https://downstream.example.invalid/list', subscriptionInputKind: 'url' })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(hktDemoSubscription))
      .mockResolvedValueOnce(new Response('fictional upstream failure', { status: 502 })))
    await useBuilderStore.getState().refreshSubscription('hkt-subscription')
    const beforeSnapshots = useBuilderStore.getState().subscriptionSnapshots
    const beforeGraph = compileGraph(useBuilderStore.getState().toProject(), { subscriptionSnapshots: beforeSnapshots })
    const beforeFilter = deriveProjectRuntime(useBuilderStore.getState().toProject(), beforeSnapshots).get('hk-filter')
    expect(beforeGraph.ir).toBeDefined()
    expect(beforeFilter?.outputCount).toBeGreaterThan(0)

    await useBuilderStore.getState().refreshSubscription('hkt-subscription')
    const afterSnapshots = useBuilderStore.getState().subscriptionSnapshots
    const afterGraph = compileGraph(useBuilderStore.getState().toProject(), { subscriptionSnapshots: afterSnapshots })
    const afterFilter = deriveProjectRuntime(useBuilderStore.getState().toProject(), afterSnapshots).get('hk-filter')
    expect(afterSnapshots['hkt-subscription']).toBe(beforeSnapshots['hkt-subscription'])
    expect(afterFilter?.outputCount).toBe(beforeFilter?.outputCount)
    expect(afterGraph.ir?.sources).toEqual(beforeGraph.ir?.sources)
    expect(afterGraph.ir?.strategies).toEqual(beforeGraph.ir?.strategies)
  })

  it('waits for embedded subscription hydration before starting a network refresh', async () => {
    const originalParse = useBuilderStore.getState().parseSubscriptionInput
    let releaseHydration!: () => void
    const hydrationGate = new Promise<void>((resolve) => { releaseHydration = resolve })
    useBuilderStore.setState({
      parseSubscriptionInput: async (...args) => {
        await hydrationGate
        return originalParse(...args)
      },
    })

    try {
      useBuilderStore.getState().hydrate(structuredClone(demoProject))
      useBuilderStore.getState().updateNodeData('hkt-subscription', {
        subscriptionUrl: 'https://hydration-barrier.example.invalid/list', subscriptionInputKind: 'url',
      })
      const fetch = vi.fn(async () => new Response(hktDemoSubscription))
      vi.stubGlobal('fetch', fetch)
      const refresh = useBuilderStore.getState().refreshSubscription('hkt-subscription')

      await Promise.resolve()
      expect(fetch).not.toHaveBeenCalled()
      releaseHydration()
      await refresh

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(useBuilderStore.getState().subscriptionSnapshots['us-subscription']).toBeDefined()
    } finally {
      useBuilderStore.setState({ parseSubscriptionInput: originalParse })
    }
  })

  it('invalidates active runtime immediately when the subscription URL changes', async () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://one.example.invalid/list' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('socks5://user:fictional-secret@one.example.invalid:1080#One')))
    await useBuilderStore.getState().refreshSubscription(sourceId)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toBeDefined()

    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://two.example.invalid/list' })
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toBeUndefined()
    expect(useBuilderStore.getState().subscriptionRuntimes[sourceId]).toBeUndefined()
    expect(useBuilderStore.getState().nodes.find((node) => node.id === sourceId)?.data.nodeCount).toBe(0)
  })

  it('requires confirmation before a non-empty LKG can be replaced by a valid empty snapshot', async () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://empty-guard.example.invalid/list' })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('socks5://user:fictional-secret@active.example.invalid:1080#Active'))
      .mockResolvedValueOnce(new Response('proxies: []'))
      .mockResolvedValueOnce(new Response('proxies: []')))
    await useBuilderStore.getState().refreshSubscription(sourceId)
    const lkg = useBuilderStore.getState().subscriptionSnapshots[sourceId]

    await useBuilderStore.getState().refreshSubscription(sourceId)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toBe(lkg)
    expect(useBuilderStore.getState().subscriptionRuntimes[sourceId].latestOutcome).toBe('empty-confirmation-required')
    useBuilderStore.getState().keepCurrentSubscription(sourceId)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toBe(lkg)

    await useBuilderStore.getState().refreshSubscription(sourceId)
    await useBuilderStore.getState().applyEmptySubscription(sourceId)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toEqual(expect.objectContaining({ quality: 'empty', readyCount: 0 }))
    expect(useBuilderStore.getState().nodes.find((node) => node.id === sourceId)?.data.nodeCount).toBe(0)
  })

  it('refreshes only enabled URL sources with partial success and isolated LKG retention', async () => {
    useBuilderStore.getState().createNewProject()
    const makeUrlSource = (name: string, enabled = true) => {
      const id = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
      useBuilderStore.getState().updateNodeData(id, { title: name, subscriptionUrl: `https://${name.toLowerCase()}.example.invalid/list`, subscriptionInputKind: 'url', enabled })
      return id
    }
    const a = makeUrlSource('A')
    const b = makeUrlSource('B')
    const c = makeUrlSource('C')
    makeUrlSource('D', false)
    const paste = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    await useBuilderStore.getState().parseSubscriptionInput(paste, 'socks5://paste:fictional@paste.example.invalid:1080#Paste', 'paste')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('socks5://b:fictional@b-lkg.example.invalid:1080#B%20LKG')))
    await useBuilderStore.getState().refreshSubscription(b)
    const bLkg = useBuilderStore.getState().subscriptionSnapshots[b]

    let active = 0
    let maximum = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      active += 1
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active -= 1
      const url = String(input)
      if (url.includes('b.example.invalid')) throw new TypeError('fictional network failure')
      const label = url.includes('a.example.invalid') ? 'A' : 'C'
      return new Response(`socks5://${label.toLowerCase()}:fictional@${label.toLowerCase()}-fresh.example.invalid:1080#${label}`)
    }))
    const summary = await useBuilderStore.getState().refreshAllSubscriptions()
    expect(summary).toEqual({ succeeded: 2, failed: 1, skipped: 2, confirmationRequired: 0, retainedPrevious: 1 })
    expect(maximum).toBeLessThanOrEqual(3)
    expect(useBuilderStore.getState().subscriptionSnapshots[a]).toBeDefined()
    expect(useBuilderStore.getState().subscriptionSnapshots[c]).toBeDefined()
    expect(useBuilderStore.getState().subscriptionSnapshots[b]).toBe(bLkg)
  })

  it('hydrates a matching IndexedDB LKG and clears it without changing the Project URL', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    const url = 'https://cache.example.invalid/list?token=fictional-project-token'
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: url })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('socks5://cache-user:fictional-cache-password@cache-node.example.invalid:1080#Cached')))
    await useBuilderStore.getState().refreshSubscription(sourceId)
    const project = structuredClone(useBuilderStore.getState().toProject())

    useBuilderStore.getState().hydrate(project)
    await useBuilderStore.getState().hydrateSubscriptionCache()
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]?.result.readyCount).toBe(1)
    expect(useBuilderStore.getState().subscriptionRuntimes[sourceId].activeState).toBe('usable')

    await useBuilderStore.getState().clearCachedSubscription(sourceId)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toBeUndefined()
    expect(useBuilderStore.getState().subscriptionRuntimes[sourceId].activeState).toBe('none')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === sourceId)?.data.subscriptionUrl).toBe(url)
  })

  it('preserves the previous Project LKG when creating and switching between projects', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://project-switch.example.invalid/list' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('socks5://switch:fictional@switch-node.example.invalid:1080#Switch')))
    await useBuilderStore.getState().refreshSubscription(sourceId)
    const firstProject = structuredClone(useBuilderStore.getState().toProject())
    const deleteSource = vi.spyOn(subscriptionRuntimeRepository, 'deleteSource')

    useBuilderStore.getState().createNewProject('sing-box')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(deleteSource).not.toHaveBeenCalledWith(firstProject.id, sourceId)

    useBuilderStore.getState().hydrate(firstProject)
    await useBuilderStore.getState().hydrateSubscriptionCache()
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]?.result.readyCount).toBe(1)
  })

  it('does not let late cache hydration overwrite a newer network refresh', async () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://hydration-race.example.invalid/list' })
    const project = structuredClone(useBuilderStore.getState().toProject())
    let resolveRead!: (snapshot: undefined) => void
    const pendingRead = new Promise<undefined>((resolve) => { resolveRead = resolve })
    const readActive = vi.spyOn(subscriptionRuntimeRepository, 'readActive').mockReturnValue(pendingRead)

    useBuilderStore.getState().hydrate(project)
    await vi.waitFor(() => expect(readActive).toHaveBeenCalledTimes(1))

    vi.stubGlobal('fetch', vi.fn(async () => new Response('socks5://fresh:fictional@fresh.example.invalid:1080#Fresh')))
    await useBuilderStore.getState().refreshSubscription(sourceId)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]?.result.nodes[0].name).toBe('Fresh')

    resolveRead(undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]?.result.nodes[0].name).toBe('Fresh')
  })

  it('deletes a subscription source from graph/runtime and ignores late hydration', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://delete.example.invalid/list' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('socks5://delete:fixture@delete-node.example.invalid:1080#Delete')))
    await useBuilderStore.getState().refreshSubscription(sourceId)
    const project = structuredClone(useBuilderStore.getState().toProject())
    const lkg = useBuilderStore.getState().subscriptionSnapshots[sourceId]
    expect(lkg).toBeDefined()

    let resolveRead!: (snapshot: typeof lkg) => void
    const readActive = vi.spyOn(subscriptionRuntimeRepository, 'readActive').mockReturnValue(new Promise((resolve) => { resolveRead = resolve }))
    useBuilderStore.getState().hydrate(project)
    await vi.waitFor(() => expect(readActive).toHaveBeenCalled())

    useBuilderStore.getState().removeNode(sourceId)
    expect(useBuilderStore.getState().nodes.some((node) => node.id === sourceId)).toBe(false)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toBeUndefined()
    expect(useBuilderStore.getState().subscriptionRuntimes[sourceId]).toBeUndefined()
    expect(useBuilderStore.getState().toProject().graph.nodes.some((node) => node.id === sourceId)).toBe(false)

    resolveRead(lkg)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useBuilderStore.getState().nodes.some((node) => node.id === sourceId)).toBe(false)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toBeUndefined()
    expect(JSON.stringify(useBuilderStore.getState().toProject())).not.toContain(sourceId)
  })

  it('does not let a late refresh response resurrect a deleted source', async () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://delete-refresh.example.invalid/list' })
    let resolveFetch!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve })))
    const refresh = useBuilderStore.getState().refreshSubscription(sourceId)
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'))
    useBuilderStore.getState().removeNode(sourceId)
    resolveFetch(new Response('socks5://late:fixture@late.example.invalid:1080#Late'))
    await refresh
    expect(useBuilderStore.getState().nodes.some((node) => node.id === sourceId)).toBe(false)
    expect(useBuilderStore.getState().subscriptionSnapshots[sourceId]).toBeUndefined()
    expect(useBuilderStore.getState().subscriptionRuntimes[sourceId]).toBeUndefined()
  })

  it('keeps URL runtime snapshots, credentials, diffs, errors and cache metadata out of Project export', async () => {
    useBuilderStore.getState().createNewProject()
    const sourceId = useBuilderStore.getState().addNode('subscription', { x: 120, y: 120 })!
    useBuilderStore.getState().updateNodeData(sourceId, { subscriptionUrl: 'https://export.example.invalid/list?token=fictional-url-token' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('socks5://export-user:fictional-export-password@private-node.example.invalid:1080#Private')))
    await useBuilderStore.getState().refreshSubscription(sourceId)
    const serialized = JSON.stringify(useBuilderStore.getState().toProject())
    expect(serialized).not.toContain('fictional-export-password')
    expect(serialized).not.toContain('private-node.example.invalid')
    expect(serialized).not.toContain('snapshotId')
    expect(serialized).not.toContain('latestDiff')
    expect(serialized).not.toContain('latestError')
    expect(serialized).not.toContain('sourceConfigFingerprint')
    expect(JSON.parse(serialized).version).toBe(2)
  })
})
