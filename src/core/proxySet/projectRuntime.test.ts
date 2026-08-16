import { describe, expect, it } from 'vitest'
import { invalidMissingTransformInputFixture } from '../__fixtures__/graphFixtures'
import { compileGraph } from '../graphCompiler'
import { parseSubscription, type SubscriptionSnapshot } from '../subscription'
import { deriveProjectRuntime } from './projectRuntime'

describe('project runtime diagnostics', () => {
  it('keeps a healthy Source → Sort path inspectable when a disconnected Filter blocks target compilation', () => {
    const project = structuredClone(invalidMissingTransformInputFixture)
    const source = project.graph.nodes.find((node) => node.id === 'source')!
    const auto = project.graph.nodes.find((node) => node.id === 'auto')!
    project.graph.nodes.push({
      id: 'sort', type: 'block', position: { x: 0, y: 0 },
      data: { blockType: 'sort', category: 'processing', title: 'Sort', subtitle: '', icon: 'sort', sortBy: 'name', sortDirection: 'ascending' },
    })
    project.graph.edges = project.graph.edges.filter((edge) => edge.target !== auto.id)
    project.graph.edges.push(
      { id: 'source-sort', source: source.id, target: 'sort', type: 'smoothstep', data: { semantic: 'data' } },
      { id: 'sort-auto', source: 'sort', target: auto.id, type: 'smoothstep', data: { semantic: 'data' } },
    )
    const parsed = parseSubscription('http://fixture:password@healthy.example.com:8080#Healthy', { sourceId: 'source', sourceName: 'Source' })
    const snapshots: Record<string, SubscriptionSnapshot> = {
      source: { inputKind: 'paste', fetchStatus: 'ready', result: parsed, lastSuccessfulAt: '2026-08-16T00:00:00.000Z' },
    }

    const graph = compileGraph(project, { subscriptionSnapshots: snapshots })
    const runtime = deriveProjectRuntime(project, snapshots)
    expect(graph).toEqual(expect.objectContaining({ success: false, ir: undefined }))
    expect(graph.issues).toContainEqual(expect.objectContaining({ code: 'TRANSFORM_MISSING_INPUT', nodeId: 'orphan-filter' }))
    expect(runtime.get('sort')).toEqual(expect.objectContaining({ status: 'ready', inputCount: 1, outputCount: 1 }))
    expect(runtime.get('sort')?.issues.map((issue) => issue.code)).not.toContain('TRANSFORM_MISSING_INPUT')
    expect(runtime.get('orphan-filter')).toEqual(expect.objectContaining({ status: 'error' }))
  })
})
