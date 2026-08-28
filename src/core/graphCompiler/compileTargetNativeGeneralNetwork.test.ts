import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../data/newProject'
import type { GraphNode, ProxyFlowProject } from '../../types/project'
import { compileGraph } from './compileGraph'

const g1 = { target: 'surge' as const, kind: 'general-network' as const, ipv6: true, ipv6Vif: 'auto' as const, icmpForwarding: false }

function blank(target: 'surge' | 'mihomo' = 'surge') {
  return createBlankProject(target)
}

function output(project: ProxyFlowProject) {
  return project.graph.nodes.find((node) => node.data.blockType === 'output')!
}

describe('Graph Compiler Surge General Network extraction', () => {
  it('extracts valid Output-owned config and binds the exact node id', () => {
    const project = blank('surge')
    output(project).data.targetNativeSurgeGeneralNetwork = g1
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success, result.issues.map((issue) => issue.message).join('\n')).toBe(true)
    expect(result.targetNativeSurgeGeneralNetworks).toEqual([{ ...g1, outputNodeId: 'output' }])
    expect(result.targetNativeSurgeGeneralNetwork).toEqual({ ...g1, outputNodeId: 'output' })
    expect(result.ir?.outputs[0]).not.toHaveProperty('targetNativeSurgeGeneralNetwork')
  })

  it('rejects malformed config and config attached to a non-Output node', () => {
    const malformed = blank('surge')
    output(malformed).data.targetNativeSurgeGeneralNetwork = { ...g1, extendedMatching: true } as never
    const malformedResult = compileGraph(malformed, { validationTarget: 'surge' })
    expect(malformedResult.success).toBe(false)
    expect(malformedResult.targetNativeSurgeGeneralNetworks).toEqual([])
    expect(malformedResult.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_INVALID', severity: 'error', nodeId: 'output' }))

    const misplaced = blank('surge')
    const final = misplaced.graph.nodes.find((node) => node.data.blockType === 'final')!
    final.data.targetNativeSurgeGeneralNetwork = g1
    const misplacedResult = compileGraph(misplaced, { validationTarget: 'surge' })
    expect(misplacedResult.success).toBe(false)
    expect(misplacedResult.targetNativeSurgeGeneralNetworks).toEqual([])
    expect(misplacedResult.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_INVALID', nodeId: final.id }))
  })

  it('does not compile a target-native value inherited from a node-data prototype', () => {
    const project = blank('surge')
    const node = output(project)
    const inheritedData = Object.create({ targetNativeSurgeGeneralNetwork: g1 })
    Object.assign(inheritedData, node.data)
    node.data = inheritedData
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.targetNativeSurgeGeneralNetworks).toEqual([])
  })

  it('ignores a disabled Output during compilation without deleting retained project intent', () => {
    const project = blank('surge')
    const first = output(project)
    first.data.disabled = true
    first.data.targetNativeSurgeGeneralNetwork = g1
    const second: GraphNode = {
      ...structuredClone(first),
      id: 'output-2',
      data: { ...structuredClone(first.data), disabled: false, targetNativeSurgeGeneralNetwork: undefined },
    }
    project.graph.nodes.push(second)
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.targetNativeSurgeGeneralNetworks).toEqual([])
    expect(first.data.targetNativeSurgeGeneralNetwork).toEqual(g1)
    expect(result.issues.some((issue) => issue.code === 'TARGET_NATIVE_GENERAL_INVALID')).toBe(false)
  })

  it('keeps Surge intent on one Output separate from a different Mihomo Output', () => {
    const project = blank('surge')
    output(project).data.targetNativeSurgeGeneralNetwork = { ...g1, ipv6: false }
    project.graph.nodes.push({
      ...structuredClone(output(project)),
      id: 'mihomo-output',
      data: { ...structuredClone(output(project).data), client: 'mihomo', targetNativeSurgeGeneralNetwork: undefined },
    })
    const result = compileGraph(project, { validationTarget: 'mihomo' })
    expect(result.success).toBe(true)
    expect(result.targetNativeSurgeGeneralNetworks).toEqual([{ ...g1, ipv6: false, outputNodeId: 'output' }])
  })

  it('retains G1 when the same Output switches to Mihomo so the target adapter can block it', () => {
    const project = blank('surge')
    const node = output(project)
    node.data.targetNativeSurgeGeneralNetwork = g1
    node.data.client = 'mihomo'
    project.primaryTarget = 'mihomo'
    const result = compileGraph(project, { validationTarget: 'mihomo' })
    expect(result.success).toBe(true)
    expect(result.targetNativeSurgeGeneralNetworks).toEqual([{ ...g1, outputNodeId: 'output' }])
    expect(project.graph.nodes.find((candidate) => candidate.id === 'output')?.data.targetNativeSurgeGeneralNetwork).toEqual(g1)
  })

  it('fails closed when G1 intent belongs to an ambiguous target Output selection', () => {
    const project = blank('surge')
    const first = output(project)
    first.data.targetNativeSurgeGeneralNetwork = g1
    project.graph.nodes.push({
      ...structuredClone(first),
      id: 'output-2',
      data: { ...structuredClone(first.data), targetNativeSurgeGeneralNetwork: undefined },
    })
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'TARGET_NATIVE_GENERAL_AMBIGUOUS', severity: 'error', nodeId: 'output',
    }))
  })

  it.each([
    ['null', null],
    ['string', 'bad'],
    ['array', []],
    ['malformed G1 scalar', { target: 'surge', kind: 'general-network', ipv6: 'yes' }],
  ])('keeps generic malformed %s data on the family diagnostic', (_name, value) => {
    const project = blank('surge')
    output(project).data.targetNativeSurgeGeneralNetwork = value as never
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_INVALID', nodeId: 'output' }))
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'SURGE_GENERAL_VIF_CIDR_INVALID' }))
  })

  it.each([
    ['bad CIDR', { tunExcludedRoutes: ['not-a-cidr'] }, 'SURGE_GENERAL_VIF_CIDR_INVALID'],
    ['duplicate CIDR', { tunExcludedRoutes: ['10.0.0.0/8', '10.0.0.0/8'] }, 'SURGE_GENERAL_VIF_CIDR_DUPLICATE'],
    ['missing IPv6 VIF', { tunIncludedRoutes: ['2001:db8::/32'] }, 'SURGE_GENERAL_VIF_IPV6_VIF_REQUIRED'],
    ['cross-list conflict', { tunExcludedRoutes: ['10.0.0.0/8'], tunIncludedRoutes: ['10.0.0.0/8'] }, 'SURGE_GENERAL_VIF_CROSS_LIST_CONFLICT'],
  ])('retains the focused diagnostic for %s intent', (_name, fields, code) => {
    const project = blank('surge')
    output(project).data.targetNativeSurgeGeneralNetwork = { target: 'surge', kind: 'general-network', ...fields } as never
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.issues).toContainEqual(expect.objectContaining({ code, nodeId: 'output' }))
  })

  it('scans malformed G3-B siblings regardless of graph order', () => {
    const createProject = (malformedFirst: boolean) => {
      const project = blank('surge')
      const valid = output(project)
      valid.data.targetNativeSurgeGeneralNetwork = {
        target: 'surge', kind: 'general-network', tunExcludedRoutes: ['10.0.0.0/8'],
      }
      const malformed: GraphNode = {
        ...structuredClone(valid),
        id: 'malformed-output',
        data: {
          ...structuredClone(valid.data),
          client: 'mihomo',
          targetNativeSurgeGeneralNetwork: { target: 'surge', kind: 'general-network', tunExcludedRoutes: ['not-a-cidr'] } as never,
        },
      }
      project.graph.nodes = malformedFirst
        ? [malformed, ...project.graph.nodes]
        : [...project.graph.nodes, malformed]
      return project
    }
    const first = compileGraph(createProject(true), { validationTarget: 'surge' })
    const last = compileGraph(createProject(false), { validationTarget: 'surge' })
    for (const result of [first, last]) {
      expect(result.success).toBe(false)
      expect(result.targetNativeSurgeGeneralNetworks).toContainEqual(expect.objectContaining({ outputNodeId: 'output', tunExcludedRoutes: ['10.0.0.0/8'] }))
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_GENERAL_VIF_CIDR_INVALID', nodeId: 'malformed-output' }))
    }
    expect(new Set(first.issues.map((issue) => issue.code))).toEqual(new Set(last.issues.map((issue) => issue.code)))
  })
})
