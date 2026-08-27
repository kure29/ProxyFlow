import type { BlockNodeData, GraphNode, RouteMatcherKind } from '../../types/project'

export const ROUTING_RULE_TYPES = ['routing-group', 'service-rule', 'custom-rule'] as const

export const BASIC_ROUTE_MATCHERS: RouteMatcherKind[] = [
  'service', 'domain', 'domain-suffix', 'domain-keyword', 'ip-cidr', 'ip-cidr6', 'port', 'source-port',
]

export const ADVANCED_ROUTE_MATCHERS: RouteMatcherKind[] = ['asn', 'geo-ip', 'geo-site', 'rule-set']

export function isRoutingRuleType(type: BlockNodeData['blockType'] | string): type is typeof ROUTING_RULE_TYPES[number] {
  return (ROUTING_RULE_TYPES as readonly string[]).includes(type)
}

/** Maps legacy node types to the single user-facing Routing Rule model. */
export function resolveRouteMatcherKind(data: BlockNodeData): RouteMatcherKind | undefined {
  if (data.routeMatcherKind) return data.routeMatcherKind
  if (data.blockType === 'routing-group' || data.blockType === 'service-rule') return 'service'
  return undefined
}

export interface RankedRoutingRule {
  node: GraphNode
  insertionIndex: number
  priority: number
}

/** Returns the exact order used by the graph compiler and target lowerers. */
export function rankRoutingRules(nodes: GraphNode[]): RankedRoutingRule[] {
  return nodes
    .map((node, insertionIndex) => ({ node, insertionIndex }))
    .filter(({ node }) => !node.data.disabled && isRoutingRuleType(node.data.blockType))
    .map(({ node, insertionIndex }, routeIndex) => ({
      node,
      insertionIndex,
      priority: Number.isFinite(node.data.routePriority) ? node.data.routePriority! : (routeIndex + 1) * 10,
    }))
    .sort((left, right) => left.priority - right.priority || left.insertionIndex - right.insertionIndex)
}

export function rankWorkspaceRoutingRules(nodes: GraphNode[]): RankedRoutingRule[] {
  return nodes
    .map((node, insertionIndex) => ({ node, insertionIndex }))
    .filter(({ node }) => isRoutingRuleType(node.data.blockType))
    .map(({ node, insertionIndex }, routeIndex) => ({
      node,
      insertionIndex,
      priority: Number.isFinite(node.data.routePriority) ? node.data.routePriority! : (routeIndex + 1) * 10,
    }))
    .sort((left, right) => left.priority - right.priority || left.insertionIndex - right.insertionIndex)
}

export function moveRoutingRule(nodes: GraphNode[], nodeId: string, direction: 'up' | 'down') {
  const ranked = rankWorkspaceRoutingRules(nodes)
  const index = ranked.findIndex(({ node }) => node.id === nodeId)
  const nextIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || nextIndex < 0 || nextIndex >= ranked.length) return nodes
  const reordered = [...ranked]
  const [item] = reordered.splice(index, 1)
  reordered.splice(nextIndex, 0, item)
  const priorities = new Map(reordered.map(({ node }, order) => [node.id, (order + 1) * 10]))
  return nodes.map((node) => priorities.has(node.id)
    ? { ...node, data: { ...node.data, routePriority: priorities.get(node.id) } }
    : node)
}

export function moveRoutingRuleToIndex(nodes: GraphNode[], nodeId: string, targetIndex: number) {
  const ranked = rankWorkspaceRoutingRules(nodes)
  const currentIndex = ranked.findIndex(({ node }) => node.id === nodeId)
  const boundedIndex = Math.max(0, Math.min(Math.trunc(targetIndex), ranked.length - 1))
  if (currentIndex < 0 || currentIndex === boundedIndex) return nodes
  const reordered = [...ranked]
  const [item] = reordered.splice(currentIndex, 1)
  reordered.splice(boundedIndex, 0, item)
  const priorities = new Map(reordered.map(({ node }, order) => [node.id, (order + 1) * 10]))
  return nodes.map((node) => priorities.has(node.id)
    ? { ...node, data: { ...node.data, routePriority: priorities.get(node.id) } }
    : node)
}

export function routeOrder(nodeId: string, nodes: GraphNode[]) {
  const ranked = rankWorkspaceRoutingRules(nodes)
  const index = ranked.findIndex(({ node }) => node.id === nodeId)
  return index < 0 ? undefined : { index, count: ranked.length, canMoveUp: index > 0, canMoveDown: index < ranked.length - 1 }
}
