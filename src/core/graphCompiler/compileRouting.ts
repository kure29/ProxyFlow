import type { FinalRouteIR, RouteIR, RouteTargetIR } from '../ir'
import { semanticIssue } from '../ir'
import type { GraphCompileContext } from './context'
import { isStrategyNode } from './helpers'

const routeTypes = new Set(['routing-group', 'service-rule', 'custom-rule'])

export interface CompiledRouting {
  routes: RouteIR[]
  finalRoute?: FinalRouteIR
}

export function compileRouting(context: GraphCompileContext): CompiledRouting {
  const routeNodes = context.project.graph.nodes.filter((node) => !node.data.disabled && routeTypes.has(node.data.blockType))
  const routes = routeNodes.flatMap((node, index): RouteIR[] => {
    const serviceIds = compileServiceIds(node.id, node.data.title, node.data.services ?? [], context)
    if (serviceIds.length === 0) {
      context.addIssue(semanticIssue(
        'ROUTE_MATCHER_MISSING', 'error', 'compile', `Route "${node.data.title}" has no valid service matcher.`,
        { nodeId: node.id, entity: { type: 'route', id: node.id } },
      ))
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
      matcher: { kind: 'service', serviceIds },
      target,
      priority: Number.isFinite(node.data.routePriority) ? node.data.routePriority! : (index + 1) * 10,
    }]
  })

  const finalNodes = context.project.graph.nodes.filter((node) => !node.data.disabled && node.data.blockType === 'final')
  if (finalNodes.length === 0) {
    context.addIssue(semanticIssue('FINAL_MISSING', 'error', 'compile', 'The project has no Final route.'))
    return { routes }
  }
  if (finalNodes.length > 1) context.addIssue(semanticIssue(
    'FINAL_MULTIPLE', 'warning', 'compile', 'Multiple Final nodes exist; deterministic node order selects the first one.',
    { nodeId: finalNodes[0].id, entity: { type: 'final', id: finalNodes[0].id } },
  ))
  const finalNode = finalNodes[0]
  const target = compileRouteTarget(finalNode.data.targetKind, finalNode.data.targetId, finalNode.data.targetLabel, context)
  if (!target) {
    context.addIssue(semanticIssue(
      'FINAL_TARGET_MISSING', 'error', 'compile', `Final route "${finalNode.data.title}" has no valid target.`,
      { nodeId: finalNode.id, entity: { type: 'final', id: finalNode.id } },
    ))
    return { routes }
  }
  return { routes, finalRoute: { target } }
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
