import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoProject } from '../data/demoProject'
import { useBuilderStore } from './useBuilderStore'

describe('builder store', () => {
  beforeEach(() => {
    useBuilderStore.getState().hydrate(structuredClone(demoProject))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds and removes a node', () => {
    const initialCount = useBuilderStore.getState().nodes.length
    const id = useBuilderStore.getState().addNode('manual-proxy', { x: 120, y: 120 })
    expect(id).toBeTruthy()
    expect(useBuilderStore.getState().nodes).toHaveLength(initialCount + 1)
    useBuilderStore.getState().removeNode(id!)
    expect(useBuilderStore.getState().nodes).toHaveLength(initialCount)
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
    expect(successful.fetchStatus).toBe('ready')
    expect(successful.result?.readyCount).toBe(1)

    await useBuilderStore.getState().refreshSubscription(sourceId)
    const stale = useBuilderStore.getState().subscriptionSnapshots[sourceId]
    expect(stale.fetchStatus).toBe('cors')
    expect(stale.stale).toBe(true)
    expect(stale.result?.proxies.map((proxy) => proxy.id)).toEqual(successful.result?.proxies.map((proxy) => proxy.id))
    expect(stale.latestErrorMessage).not.toContain('token=private')
  })
})
