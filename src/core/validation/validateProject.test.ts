import { describe, expect, it } from 'vitest'
import { demoEdges, demoNodes } from '../../data/demoProject'
import { validateGraph } from './validateProject'

describe('validateGraph', () => {
  it('accepts the complete demo blueprint', () => {
    expect(validateGraph(demoNodes, demoEdges)).toEqual([])
  })

  it('reports a strategy without input', () => {
    const edges = demoEdges.filter((edge) => edge.target !== 'hk-auto')
    expect(validateGraph(demoNodes, edges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'hk-auto', code: 'UI_STRATEGY_SOURCE_MISSING' }),
    ]))
  })

  it('reports an output without a target client', () => {
    const nodes = demoNodes.map((node) => node.id === 'output' ? { ...node, data: { ...node.data, client: undefined } } : node)
    expect(validateGraph(nodes, demoEdges).some((issue) => issue.nodeId === 'output')).toBe(true)
  })
})
