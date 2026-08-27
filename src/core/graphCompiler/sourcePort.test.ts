import { describe, expect, it } from 'vitest'
import { compileGraph } from './compileGraph'
import { customPortRouteFixture } from '../__fixtures__/graphFixtures'
import type { ProxyFlowProject } from '../../types/project'

function sourcePortProject(targetKind: 'direct' | 'reject' | 'strategy' = 'direct'): ProxyFlowProject {
  const project = structuredClone(customPortRouteFixture)
  const route = project.graph.nodes.find((node) => node.id === 'custom-route')!
  route.data.routeMatcherKind = 'source-port'
  route.data.routeMatcherPort = 443
  route.data.targetNativeSourcePort = { target: 'surge', kind: 'source-port', port: 443 }
  route.data.targetKind = targetKind
  if (targetKind === 'strategy') route.data.targetId = 'auto'
  else route.data.targetId = undefined
  return project
}

describe('graph compiler Surge-native SRC-PORT boundary', () => {
  it.each(['direct', 'reject', 'strategy'] as const)('extracts a typed source-port route targeting %s without changing Universal IR', (targetKind) => {
    const project = sourcePortProject(targetKind)
    project.graph.nodes.find((node) => node.id === 'custom-route')!.data.routeMatcherPort = 80
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(result.ir?.routes).toEqual([])
    expect(result.nativeRoutes).toEqual([expect.objectContaining({
      id: 'custom-route',
      matcher: { kind: 'source-port', port: 443 },
      target: targetKind === 'direct' ? { kind: 'direct' } : targetKind === 'reject' ? { kind: 'reject' } : { kind: 'strategy', id: 'auto' },
      targetNativeSourcePort: { routeId: 'custom-route', target: 'surge', kind: 'source-port', port: 443 },
    })])
  })

  it('rejects malformed or misplaced typed source-port intent', () => {
    const malformed = sourcePortProject()
    malformed.graph.nodes.find((node) => node.id === 'custom-route')!.data.targetNativeSourcePort = {
      target: 'surge', kind: 'source-port', port: 443, extendedMatching: true,
    } as never
    const malformedResult = compileGraph(malformed, { validationTarget: 'surge' })
    expect(malformedResult.success).toBe(false)
    expect(malformedResult.nativeRoutes).toEqual([])
    expect(malformedResult.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_SOURCE_PORT_INVALID', nodeId: 'custom-route' }))

    const spoofed = sourcePortProject()
    spoofed.graph.nodes.find((node) => node.id === 'custom-route')!.data.targetNativeSourcePort = {
      target: 'surge', kind: 'source-port', port: 443, routeId: 'another-route',
    } as never
    const spoofedResult = compileGraph(spoofed, { validationTarget: 'surge' })
    expect(spoofedResult.success).toBe(false)
    expect(spoofedResult.nativeRoutes).toEqual([])
    expect(spoofedResult.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_SOURCE_PORT_INVALID', nodeId: 'custom-route' }))

    const misplaced = sourcePortProject()
    const route = misplaced.graph.nodes.find((node) => node.id === 'custom-route')!
    route.data.routeMatcherKind = 'port'
    const misplacedResult = compileGraph(misplaced, { validationTarget: 'surge' })
    expect(misplacedResult.success).toBe(false)
    expect(misplacedResult.nativeRoutes).toEqual([])
    expect(misplacedResult.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_SOURCE_PORT_INVALID', nodeId: 'custom-route' }))
  })

  it('fails closed with an explicit unsupported diagnostic for non-Surge targets', () => {
    const result = compileGraph(sourcePortProject(), { validationTarget: 'mihomo' })
    expect(result.success).toBe(false)
    expect(result.nativeRoutes).toEqual([])
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_SOURCE_PORT_UNSUPPORTED', nodeId: 'custom-route' }))
  })

  it('retains the typed intent across target switching and restores Surge usability', () => {
    const project = sourcePortProject()
    const surge = compileGraph(project, { validationTarget: 'surge' })
    expect(surge.success).toBe(true)
    project.primaryTarget = 'mihomo'
    const mihomo = compileGraph(project, { validationTarget: 'mihomo' })
    expect(mihomo.success).toBe(false)
    expect(project.graph.nodes.find((node) => node.id === 'custom-route')?.data.targetNativeSourcePort).toEqual({ target: 'surge', kind: 'source-port', port: 443 })
    project.primaryTarget = 'surge'
    const restored = compileGraph(project, { validationTarget: 'surge' })
    expect(restored.success).toBe(true)
    expect(restored.nativeRoutes?.[0].id).toBe('custom-route')
  })
})
