import type { FinalRouteIR, RouteIR, RouteTargetIR, TrafficMatcherIR } from '../ir'
import { findRuleSourceMatches, normalizeCustomMatcher, semanticIssue } from '../ir'
import type { GraphCompileContext } from './context'
import { isStrategyNode } from './helpers'
import { rankRoutingRules, resolveRouteMatcherKind } from '../routing/routeProductModel'
import type { TargetNativeRouteIR } from '../targetNative'

export interface CompiledRouting {
  routes: RouteIR[]
  nativeRoutes: TargetNativeRouteIR[]
  nativeFinalRoute?: TargetNativeRouteIR
  finalRoute?: FinalRouteIR
}

export function compileRouting(context: GraphCompileContext): CompiledRouting {
  const nativeRoutes: TargetNativeRouteIR[] = []
  const routes = rankRoutingRules(context.project.graph.nodes).flatMap(({ node, priority }): RouteIR[] => {
    const matcherKind = resolveRouteMatcherKind(node.data)
    const matcher = matcherKind === 'service'
      ? compileServiceMatcher(node.id, node.data.title, node.data.services ?? [], context)
      : matcherKind
        ? compileCustomMatcher(node.id, node.data.title, matcherKind, node.data, context)
        : undefined
    if (!matcher) {
      context.addIssue(semanticIssue(
        'ROUTE_MATCHER_MISSING', 'error', 'compile', `Route "${node.data.title}" has no valid matcher.`,
        { nodeId: node.id, entity: { type: 'route', id: node.id } },
      ))
      return []
    }
    const nativeTarget = nativeStrategyTarget(node.data.targetId, context)
    if (nativeTarget) {
      nativeRoutes.push({ id: node.id, name: node.data.title, matcher, target: nativeTarget, priority })
      return []
    }
    const target = compileRouteTarget(node.data.targetKind, node.data.targetId, node.data.targetLabel, context)
    if (!target) {
      context.addIssue(semanticIssue(
        'ROUTE_TARGET_MISSING', 'error', 'compile', `Route "${node.data.title}" has no valid target.`,
        { nodeId: node.id, entity: { type: 'route', id: node.id } },
      ))
      return []
    }
    return [{
      id: node.id,
      name: node.data.title,
      matcher,
      target,
      priority,
    }]
  })

  const finalNodes = context.project.graph.nodes.filter((node) => !node.data.disabled && node.data.blockType === 'final')
  if (finalNodes.length === 0) {
    context.addIssue(semanticIssue('FINAL_MISSING', 'error', 'compile', 'The project has no Final route.'))
    return { routes, nativeRoutes }
  }
  if (finalNodes.length > 1) context.addIssue(semanticIssue(
    'FINAL_MULTIPLE', 'warning', 'compile', 'Multiple Final nodes exist; deterministic node order selects the first one.',
    { nodeId: finalNodes[0].id, entity: { type: 'final', id: finalNodes[0].id } },
  ))
  const finalNode = finalNodes[0]
  const target = compileRouteTarget(finalNode.data.targetKind, finalNode.data.targetId, finalNode.data.targetLabel, context)
  const nativeTarget = nativeStrategyTarget(finalNode.data.targetId, context)
  if (nativeTarget) return {
    routes,
    nativeRoutes,
    nativeFinalRoute: { id: finalNode.id, name: finalNode.data.title, target: nativeTarget, priority: Number.MAX_SAFE_INTEGER },
  }
  if (!target) {
    context.addIssue(semanticIssue(
      'FINAL_TARGET_MISSING', 'error', 'compile', `Final route "${finalNode.data.title}" has no valid target.`,
      { nodeId: finalNode.id, entity: { type: 'final', id: finalNode.id } },
    ))
    return { routes, nativeRoutes }
  }
  return { routes, nativeRoutes, finalRoute: { target } }
}

function nativeStrategyTarget(targetId: string | undefined, context: GraphCompileContext) {
  if (!targetId) return undefined
  const node = context.nodesById.get(targetId)
  return node && !node.data.disabled && node.data.blockType === 'target-native-strategy'
    ? { kind: 'strategy' as const, id: targetId }
    : undefined
}

function compileServiceMatcher(nodeId: string, name: string, services: string[], context: GraphCompileContext): TrafficMatcherIR | undefined {
  const serviceIds = compileServiceIds(nodeId, name, services, context)
  return serviceIds.length > 0 ? { kind: 'service', serviceIds } : undefined
}

function compileCustomMatcher(nodeId: string, name: string, kind: Exclude<NonNullable<GraphCompileContext['project']['graph']['nodes'][number]['data']['routeMatcherKind']>, 'service'>, data: GraphCompileContext['project']['graph']['nodes'][number]['data'], context: GraphCompileContext): TrafficMatcherIR | undefined {
  const normalized = normalizeCustomMatcher(kind, data.routeMatcherValue, data.routeMatcherPort)
  if (!normalized.ok) {
    context.addIssue(semanticIssue(
      normalized.code, 'error', 'compile', `Route "${name}" has an invalid ${kind} matcher.`,
      { nodeId, entity: { type: 'route', id: nodeId } },
    ))
    return undefined
  }
  if (normalized.matcher.kind === 'rule-set') {
    const customSource = data.customRuleSource
    if (customSource) {
      if (customSource.id !== normalized.matcher.id) {
        context.addIssue(semanticIssue(
          'ROUTE_RULE_SOURCE_REFERENCE_MISMATCH', 'error', 'compile', `Route "${name}" does not reference its attached rule source.`,
          { nodeId, entity: { type: 'route', id: nodeId } },
        ))
        return undefined
      }
      if (!customSource.enabled) {
        context.addIssue(semanticIssue(
          'RULE_SOURCE_DISABLED', 'error', 'compile', `Rule source "${customSource.name}" is disabled.`,
          { nodeId, entity: { type: 'route', id: nodeId } },
        ))
        return undefined
      }
      return normalized.matcher
    }
    const matches = findRuleSourceMatches(context.project.services, normalized.matcher.id)
    if (matches.length === 0) {
      context.addIssue(semanticIssue(
        'ROUTE_RULE_SET_NOT_FOUND', 'error', 'compile', `Route "${name}" references missing rule set "${normalized.matcher.id}".`,
        { nodeId, entity: { type: 'route', id: nodeId } },
      ))
      return undefined
    }
    if (matches.length > 1) {
      context.addIssue(semanticIssue(
        'ROUTE_RULE_SET_AMBIGUOUS', 'error', 'compile', `Rule set "${normalized.matcher.id}" is defined more than once.`,
        { nodeId, entity: { type: 'route', id: nodeId } },
      ))
      return undefined
    }
  }
  return normalized.matcher
}

function compileServiceIds(nodeId: string, name: string, services: string[], context: GraphCompileContext) {
  return services.flatMap((service): string[] => {
    const serviceId = context.serviceIdsByLookup.get(service.toLowerCase())
    if (serviceId) return [serviceId]
    context.addIssue(semanticIssue(
      'SERVICE_REFERENCE_NOT_FOUND', 'warning', 'compile', `Service "${service}" in route "${name}" is not in the project service catalog.`,
      { nodeId, entity: { type: 'route', id: nodeId } },
    ))
    return []
  })
}

function compileRouteTarget(
  targetKind: 'strategy' | 'direct' | 'reject' | undefined,
  targetId: string | undefined,
  targetLabel: string | undefined,
  context: GraphCompileContext,
): RouteTargetIR | undefined {
  if (targetKind === 'direct') return { kind: 'direct' }
  if (targetKind === 'reject') return { kind: 'reject' }
  const normalized = `${targetId ?? ''} ${targetLabel ?? ''}`.trim().toLowerCase()
  if (/\bdirect\b/.test(normalized)) return { kind: 'direct' }
  if (/\breject\b/.test(normalized)) return { kind: 'reject' }
  if (!targetId) return undefined
  const targetNode = context.nodesById.get(targetId)
  return targetNode && isStrategyNode(targetNode) ? { kind: 'strategy', id: targetId } : undefined
}
