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
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile?.preset).toBe('local-proxy')
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

  it('creates Mihomo and sing-box projects with matching primary targets', () => {
    useBuilderStore.getState().createNewProject('mihomo')
    expect(useBuilderStore.getState().primaryTarget).toBe('mihomo')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe('mihomo')
    expect(useBuilderStore.getState().toProject().primaryTarget).toBe('mihomo')

    useBuilderStore.getState().createNewProject('sing-box')
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    expect(useBuilderStore.getState().nodes.find((node) => node.data.blockType === 'output')?.data.client).toBe('sing-box')
    expect(useBuilderStore.getState().toProject().primaryTarget).toBe('sing-box')
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
    project.primaryTarget = 'surge'
    const graphBefore = structuredClone(project.graph)
    useBuilderStore.getState().hydrate(project as unknown as ReturnType<typeof createBlankProject>)
    expect(useBuilderStore.getState().primaryTarget).toBeNull()
    expect({ nodes: useBuilderStore.getState().nodes, edges: useBuilderStore.getState().edges }).toEqual(graphBefore)
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

  it('synchronizes a sole supported Output edit without deleting target-native data', () => {
    const profile = { ...createMihomoOutputProfile('desktop-tun'), mixedPort: 7893 }
    useBuilderStore.getState().updateNodeData('output', { mihomoProfile: profile })
    useBuilderStore.getState().setOutputClient('output', 'sing-box')
    expect(useBuilderStore.getState().primaryTarget).toBe('sing-box')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'output')?.data.mihomoProfile).toEqual(profile)
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
    expect(failedRuntime.latestError?.message).not.toContain('token=private')
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
