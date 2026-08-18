import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { v08BasicRoutingFixture } from '../__fixtures__/v08Acceptance'
import { compileGraph } from '../graphCompiler'
import { canUseWorkspaceInput, createWorkspaceProjection, updateWorkspaceNodeData } from './projectWorkspace'

describe('Workspace graph adapter', () => {
  it('projects the existing graph into structured sections without changing node identity', () => {
    const projection = createWorkspaceProjection(demoProject)
    expect(projection.primaryTarget.target).toBe('mihomo')
    expect(projection.sources.map((item) => item.node.id)).toEqual(['hkt-subscription', 'us-subscription'])
    expect(projection.processing.map((item) => item.node.id)).toEqual(['hk-filter', 'us-filter'])
    expect(projection.strategies.map((item) => item.node.id)).toEqual(['hk-auto', 'us-auto'])
    expect(projection.chains.map((item) => item.node.id)).toEqual(['us-via-hk'])
    expect(projection.outputs.map((item) => item.node.id)).toEqual(['output'])
    expect(projection.sources[0].outgoing).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'hk-filter', semantic: 'data' }),
    ]))
  })

  it('uses compiler routing order and keeps Final separate', () => {
    const project = structuredClone(v08BasicRoutingFixture)
    project.graph.nodes.find((node) => node.id === 'openai')!.data.routePriority = 30
    project.graph.nodes.find((node) => node.id === 'ads')!.data.routePriority = 10
    const projection = createWorkspaceProjection(project)
    expect(projection.routing.map((item) => item.node.id)).toEqual(['ads', 'local', 'openai'])
    expect(projection.routing.map((item) => item.priority)).toEqual([10, 20, 30])
    expect(projection.finalRoutes.map((item) => item.node.id)).toEqual(['final'])
  })

  it('summarizes proxies without exposing endpoints or credentials', () => {
    const projection = createWorkspaceProjection(v08BasicRoutingFixture)
    expect(projection.proxies.map((proxy) => proxy.protocol)).toEqual(['socks5', 'socks5'])
    expect(projection.proxies.map((proxy) => proxy.sourceId)).toEqual(['hk-source', 'us-source'])
    expect(JSON.stringify(projection.proxies)).not.toContain('hk.example.com')
    expect(JSON.stringify(projection.proxies)).not.toContain('password')
  })

  it('reflects Canvas graph edits immediately in a new Workspace projection', () => {
    const project = structuredClone(v08BasicRoutingFixture)
    project.graph.nodes = updateWorkspaceNodeData(project.graph.nodes, 'auto', { title: 'Fastest US' })
    expect(createWorkspaceProjection(project).strategies.find((item) => item.node.id === 'auto')?.node.data.title).toBe('Fastest US')
  })

  it('writes Workspace edits to existing graph semantics consumed by the compiler', () => {
    const project = structuredClone(v08BasicRoutingFixture)
    project.graph.nodes = updateWorkspaceNodeData(project.graph.nodes, 'auto', { interval: 240, tolerance: 75 })
    expect(compileGraph(project).ir?.strategies.find((strategy) => strategy.id === 'auto')).toEqual(expect.objectContaining({
      kind: 'auto-select', healthCheck: expect.objectContaining({ intervalSeconds: 240, toleranceMs: 75 }),
    }))
  })

  it('allows valid Workspace inputs and rejects graph cycles', () => {
    const project = structuredClone(demoProject)
    expect(canUseWorkspaceInput(project.graph.nodes, project.graph.edges, 'us-filter', 'hkt-subscription')).toBe(true)

    project.graph.nodes.push({
      id: 'later-processing', type: 'block', position: { x: 0, y: 0 },
      data: { blockType: 'rename', category: 'processing', title: 'Later', subtitle: '', icon: 'text-cursor' },
    })
    project.graph.edges.push({ id: 'filter-later', source: 'us-filter', target: 'later-processing', type: 'smoothstep', data: { semantic: 'data' } })
    expect(canUseWorkspaceInput(project.graph.nodes, project.graph.edges, 'us-filter', 'later-processing')).toBe(false)
  })

  it('round-trips legacy graph nodes through JSON without creating Workspace state', () => {
    const project = JSON.parse(JSON.stringify(v08BasicRoutingFixture))
    const before = createWorkspaceProjection(project)
    const after = createWorkspaceProjection(JSON.parse(JSON.stringify(project)))
    expect(after.routing.map((item) => item.node.data.blockType)).toEqual(before.routing.map((item) => item.node.data.blockType))
    expect(after.strategies.map((item) => item.node.id)).toEqual(before.strategies.map((item) => item.node.id))
    expect(Object.keys(project)).not.toContain('workspace')
  })
})
