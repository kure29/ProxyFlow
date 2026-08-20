import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from '../../types/project'
import {
  moveWorkspaceProcessingStep,
  orderWorkspaceProcessingNodes,
  processingMoveAvailability,
} from './processingPipeline'

const graphNode = (id: string, category: GraphNode['data']['category'], blockType: GraphNode['data']['blockType']): GraphNode => ({
  id,
  type: 'block',
  position: { x: 0, y: 0 },
  data: { id, category, blockType, title: id, subtitle: '', icon: 'box' },
})

const edge = (id: string, source: string, target: string, semantic: NonNullable<GraphEdge['data']>['semantic'] = 'data'): GraphEdge => ({
  id, source, target, data: { semantic },
})

const nodes = [
  graphNode('source', 'source', 'subscription'),
  graphNode('filter', 'processing', 'filter'),
  graphNode('rename', 'processing', 'rename'),
  graphNode('strategy', 'strategy', 'auto-select'),
]

describe('Workspace processing pipeline', () => {
  it('moves adjacent steps by rewiring only the linear data chain', () => {
    const graphEdges = [
      edge('before', 'source', 'filter'),
      edge('bridge', 'filter', 'rename'),
      edge('after', 'rename', 'strategy'),
    ]

    expect(processingMoveAvailability(nodes, graphEdges, 'filter')).toEqual({ up: false, down: true })
    const moved = moveWorkspaceProcessingStep(nodes, graphEdges, 'filter', 'down')
    expect(moved).toEqual([
      edge('before', 'source', 'rename'),
      edge('bridge', 'rename', 'filter'),
      edge('after', 'filter', 'strategy'),
    ])
    expect(moved.map(({ id }) => id)).toEqual(graphEdges.map(({ id }) => id))
    expect(orderWorkspaceProcessingNodes(nodes, moved).map(({ id }) => id)).toEqual(['rename', 'filter'])
  })

  it('uses the same safe swap for moving a downstream step up', () => {
    const graphEdges = [
      edge('before', 'source', 'filter'),
      edge('bridge', 'filter', 'rename'),
      edge('after', 'rename', 'strategy'),
    ]
    expect(moveWorkspaceProcessingStep(nodes, graphEdges, 'rename', 'up')).toEqual([
      edge('before', 'source', 'rename'),
      edge('bridge', 'rename', 'filter'),
      edge('after', 'filter', 'strategy'),
    ])
  })

  it('fails closed for branches, merges, and non-data connections', () => {
    const branch = [edge('before', 'source', 'filter'), edge('bridge', 'filter', 'rename'), edge('branch', 'filter', 'strategy')]
    expect(processingMoveAvailability(nodes, branch, 'filter').down).toBe(false)
    expect(moveWorkspaceProcessingStep(nodes, branch, 'filter', 'down')).toBe(branch)

    const merge = [edge('one', 'source', 'filter'), edge('two', 'another-source', 'filter'), edge('bridge', 'filter', 'rename')]
    expect(moveWorkspaceProcessingStep([...nodes, graphNode('another-source', 'source', 'subscription')], merge, 'filter', 'down')).toBe(merge)

    const nonData = [edge('before', 'source', 'filter'), edge('bridge', 'filter', 'rename'), edge('route', 'rename', 'strategy', 'strategy')]
    expect(moveWorkspaceProcessingStep(nodes, nonData, 'filter', 'down')).toBe(nonData)

    const cycle = [edge('bridge', 'filter', 'rename'), edge('back', 'rename', 'filter')]
    expect(moveWorkspaceProcessingStep(nodes, cycle, 'filter', 'down')).toBe(cycle)

    const longCycleNodes = [...nodes, graphNode('sort', 'processing', 'sort')]
    const longCycle = [edge('first', 'filter', 'rename'), edge('second', 'rename', 'sort'), edge('third', 'sort', 'filter')]
    expect(processingMoveAvailability(longCycleNodes, longCycle, 'filter')).toEqual({ up: false, down: false })
    expect(moveWorkspaceProcessingStep(longCycleNodes, longCycle, 'filter', 'down')).toBe(longCycle)
  })

  it('keeps stable insertion order for disconnected steps and appends cyclic leftovers', () => {
    const processing = [nodes[2], nodes[1], graphNode('sort', 'processing', 'sort')]
    expect(orderWorkspaceProcessingNodes(processing, []).map(({ id }) => id)).toEqual(['rename', 'filter', 'sort'])
    expect(orderWorkspaceProcessingNodes(processing, [edge('a', 'rename', 'filter'), edge('b', 'filter', 'rename')]).map(({ id }) => id))
      .toEqual(['sort', 'rename', 'filter'])
  })
})
