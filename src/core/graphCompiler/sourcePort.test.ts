import { describe, expect, it } from 'vitest'
import { compileGraph } from './compileGraph'
import { customPortRouteFixture } from '../__fixtures__/graphFixtures'
import { surgeNativeAcceptanceProject } from '../__fixtures__/surgeNativeStrategies'
import { subscriptionSnapshotFixture } from '../__fixtures__/subscriptionFixtures'
import { parseSubscription } from '../subscription'
import { compileSurge } from '../../targets/surge/compiler'
import type { GraphNode, ProxyFlowProject } from '../../types/project'

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

function addDomainRoute(project: ProxyFlowProject, position: 'before' | 'after', priority: number) {
  const sourceIndex = project.graph.nodes.findIndex((node) => node.id === 'custom-route')
  const source = project.graph.nodes[sourceIndex]
  const domain = structuredClone(source)
  domain.id = 'domain-route'
  domain.data = {
    ...domain.data,
    title: 'Domain route',
    routeMatcherKind: 'domain',
    routeMatcherValue: 'example.com',
    routeMatcherPort: undefined,
    targetNativeSourcePort: undefined,
    targetKind: 'direct',
    targetId: undefined,
    targetLabel: 'DIRECT',
    routePriority: priority,
  }
  project.graph.nodes.splice(position === 'before' ? sourceIndex : sourceIndex + 1, 0, domain)
}

function compileProjectRules(project: ProxyFlowProject) {
  const subscription = project.graph.nodes.find((node) => node.data.blockType === 'subscription')
  const subscriptionSnapshots = subscription ? {
    [subscription.id]: subscriptionSnapshotFixture(subscription.id, parseSubscription(
      'http://fixture:password@proxy.example.com:8080#Proxy',
      { sourceId: subscription.id, sourceName: subscription.data.title },
    )),
  } : undefined
  const graph = compileGraph(project, { validationTarget: 'surge', subscriptionSnapshots })
  expect(graph.success, graph.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  const result = compileSurge(graph.ir!, {
    nativeStrategies: graph.nativeStrategies,
    nativeRoutes: graph.nativeRoutes,
    nativeFinalRoute: graph.nativeFinalRoute,
    targetNativeFinalOptions: graph.targetNativeFinalOptions,
    targetNativeRouteOptions: graph.targetNativeRouteOptions,
    nativeRuleSetSources: graph.nativeRuleSetSources,
  })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  return result.content.split('\n').filter((line) => line.startsWith('SRC-PORT,') || line.startsWith('DOMAIN,'))
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

  it('preserves mixed Universal/source-port insertion order for equal-priority ties in both directions', () => {
    const sourceFirst = sourcePortProject()
    sourceFirst.graph.nodes.find((node) => node.id === 'custom-route')!.data.routePriority = 10
    addDomainRoute(sourceFirst, 'after', 10)
    expect(compileProjectRules(sourceFirst)).toEqual([
      'SRC-PORT,443,DIRECT',
      'DOMAIN,example.com,DIRECT',
    ])

    const domainFirst = sourcePortProject()
    domainFirst.graph.nodes.find((node) => node.id === 'custom-route')!.data.routePriority = 10
    addDomainRoute(domainFirst, 'before', 10)
    expect(compileProjectRules(domainFirst)).toEqual([
      'DOMAIN,example.com,DIRECT',
      'SRC-PORT,443,DIRECT',
    ])
  })

  it('keeps priority authoritative over mixed-route insertion order', () => {
    const project = sourcePortProject()
    project.graph.nodes.find((node) => node.id === 'custom-route')!.data.routePriority = 10
    addDomainRoute(project, 'before', 20)
    expect(compileProjectRules(project)).toEqual([
      'SRC-PORT,443,DIRECT',
      'DOMAIN,example.com,DIRECT',
    ])
  })

  it.each([
    ['hk-smart', 'Hong Kong Smart'],
    ['hk-subnet', 'Hong Kong'],
  ])('preserves a mixed Universal/native-strategy tie for %s', (targetId, targetName) => {
    const project = structuredClone(surgeNativeAcceptanceProject)
    const finalIndex = project.graph.nodes.findIndex((node) => node.data.blockType === 'final')
    const nativeRoute: GraphNode = {
      id: 'native-domain', type: 'block', position: { x: 0, y: 0 }, data: {
        blockType: 'custom-rule', category: 'routing', title: 'Native domain', subtitle: '', icon: 'blocks',
        routeMatcherKind: 'domain', routeMatcherValue: 'native.example', routePriority: 10,
        targetKind: 'strategy', targetId, targetLabel: targetName,
      },
    }
    const universalRoute: GraphNode = {
      id: 'universal-domain', type: 'block', position: { x: 0, y: 0 }, data: {
        blockType: 'custom-rule', category: 'routing', title: 'Universal domain', subtitle: '', icon: 'blocks',
        routeMatcherKind: 'domain', routeMatcherValue: 'universal.example', routePriority: 10,
        targetKind: 'direct', targetLabel: 'DIRECT',
      },
    }
    project.graph.nodes.splice(finalIndex, 0, nativeRoute, universalRoute)
    expect(compileProjectRules(project)).toEqual([
      `DOMAIN,native.example,${targetName}`,
      'DOMAIN,universal.example,DIRECT',
    ])
  })
})
