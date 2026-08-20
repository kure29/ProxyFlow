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

  it('accepts Final DIRECT and REJECT targets without a graph edge', () => {
    const final = demoNodes.find((node) => node.id === 'final-route')!
    const withoutFinalEdge = demoEdges.filter((edge) => edge.source !== final.id)
    for (const targetKind of ['direct', 'reject'] as const) {
      const nodes = demoNodes.map((node) => node.id === final.id ? {
        ...node,
        data: {
          ...node.data,
          targetKind,
          targetId: targetKind.toUpperCase(),
          targetLabel: targetKind.toUpperCase(),
        },
      } : node)
      expect(validateGraph(nodes, withoutFinalEdge)).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ nodeId: final.id, code: 'UI_FINAL_TARGET_MISSING' }),
      ]))
    }
  })

  it('keeps requiring a graph edge for a strategy-backed Final target', () => {
    const edges = demoEdges.filter((edge) => edge.source !== 'final-route')
    expect(validateGraph(demoNodes, edges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'final-route', code: 'UI_FINAL_TARGET_MISSING', severity: 'error' }),
    ]))
  })

  it('reports an invalid filter regular expression as an error', () => {
    const nodes = demoNodes.map((node) => node.id === 'hk-filter' ? {
      ...node,
      data: { ...node.data, filterMode: 'regex' as const, filterRegexPattern: '[Hong' },
    } : node)
    expect(validateGraph(nodes, demoEdges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'hk-filter', code: 'FILTER_INVALID_REGEX', severity: 'error' }),
    ]))
  })
})
