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

  it('does not infer an inline Final target from an untyped label', () => {
    const nodes = demoNodes.map((node) => node.id === 'final-route' ? {
      ...node,
      data: { ...node.data, targetKind: undefined, targetId: undefined, targetLabel: 'DIRECT' },
    } : node)
    const edges = demoEdges.filter((edge) => edge.source !== 'final-route')
    expect(validateGraph(nodes, edges)).toContainEqual(expect.objectContaining({
      nodeId: 'final-route', code: 'UI_FINAL_TARGET_MISSING', severity: 'error',
    }))
  })

  it('accepts typed Final options only on enabled Final nodes', () => {
    const nodes = structuredClone(demoNodes)
    const final = nodes.find((node) => node.data.blockType === 'final')!
    final.data.targetNativeFinalOptions = { target: 'surge', kind: 'final-options', dnsFailed: true }
    expect(validateGraph(nodes, demoEdges)).not.toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_FINAL_OPTIONS_INVALID' }))

    final.data.targetNativeFinalOptions = { target: 'surge', kind: 'final-options', dnsFailed: false } as never
    expect(validateGraph(nodes, demoEdges)).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_FINAL_OPTIONS_INVALID', nodeId: final.id, severity: 'error' }))

    final.data.targetNativeFinalOptions = undefined
    const route = nodes.find((node) => node.data.blockType === 'service-rule')!
    route.data.targetNativeFinalOptions = { target: 'surge', kind: 'final-options', dnsFailed: true }
    expect(validateGraph(nodes, demoEdges)).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_FINAL_OPTIONS_INVALID', nodeId: route.id, severity: 'error' }))
  })

  it('accepts typed route options only on routing rules', () => {
    const nodes = structuredClone(demoNodes)
    const route = nodes.find((node) => node.data.blockType === 'service-rule')!
    route.data.targetNativeRouteOptions = { target: 'surge', kind: 'route-options', noResolve: true }
    expect(validateGraph(nodes, demoEdges)).not.toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_ROUTE_OPTIONS_INVALID' }))

    route.data.targetNativeRouteOptions = { target: 'surge', kind: 'route-options', noResolve: false } as never
    expect(validateGraph(nodes, demoEdges)).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_ROUTE_OPTIONS_INVALID', nodeId: route.id, severity: 'error' }))

    route.data.targetNativeRouteOptions = undefined
    const final = nodes.find((node) => node.data.blockType === 'final')!
    final.data.targetNativeRouteOptions = { target: 'surge', kind: 'route-options', noResolve: true }
    expect(validateGraph(nodes, demoEdges)).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_ROUTE_OPTIONS_INVALID', nodeId: final.id, severity: 'error' }))
  })

  it('validates the exact typed Surge source-port matcher shape', () => {
    const nodes = structuredClone(demoNodes)
    const route = nodes.find((node) => node.data.blockType === 'service-rule')!
    route.data.routeMatcherKind = 'source-port'
    route.data.targetNativeSourcePort = { target: 'surge', kind: 'source-port', port: 443 }
    expect(validateGraph(nodes, demoEdges)).not.toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_SOURCE_PORT_INVALID', nodeId: route.id }))

    route.data.targetNativeSourcePort = { target: 'surge', kind: 'source-port', port: 443, extendedMatching: true } as never
    expect(validateGraph(nodes, demoEdges)).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_SOURCE_PORT_INVALID', nodeId: route.id, severity: 'error' }))
  })

  it('validates typed Surge General Network intent only on Output nodes', () => {
    const nodes = structuredClone(demoNodes)
    const output = nodes.find((node) => node.id === 'output')!
    output.data.targetNativeSurgeGeneralNetwork = { target: 'surge', kind: 'general-network', ipv6: false }
    expect(validateGraph(nodes, demoEdges)).not.toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_INVALID' }))

    output.data.targetNativeSurgeGeneralNetwork = { target: 'surge', kind: 'general-network', ipv6: true, extendedMatching: true } as never
    expect(validateGraph(nodes, demoEdges)).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_INVALID', nodeId: output.id, severity: 'error' }))

    output.data.targetNativeSurgeGeneralNetwork = undefined
    const final = nodes.find((node) => node.data.blockType === 'final')!
    final.data.targetNativeSurgeGeneralNetwork = { target: 'surge', kind: 'general-network', ipv6: true }
    expect(validateGraph(nodes, demoEdges)).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_INVALID', nodeId: final.id, severity: 'error' }))
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
