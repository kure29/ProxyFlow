import type { GraphEdge, GraphNode } from '../../types/project'

export type ProcessingMoveDirection = 'up' | 'down'

export interface ProcessingMoveAvailability {
  up: boolean
  down: boolean
}

export function orderWorkspaceProcessingNodes(nodes: readonly GraphNode[], edges: readonly GraphEdge[]) {
  const processing = nodes.filter((node) => node.data.category === 'processing')
  const originalIndex = new Map(processing.map((node, index) => [node.id, index]))
  const processingIds = new Set(originalIndex.keys())
  const outgoing = new Map<string, string[]>()
  const indegree = new Map(processing.map((node) => [node.id, 0]))

  for (const edge of edges) {
    if (edge.data?.semantic !== 'data' || !processingIds.has(edge.source) || !processingIds.has(edge.target)) continue
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const ready = processing.filter((node) => indegree.get(node.id) === 0)
  const ordered: GraphNode[] = []
  while (ready.length) {
    ready.sort((left, right) => originalIndex.get(left.id)! - originalIndex.get(right.id)!)
    const current = ready.shift()!
    ordered.push(current)
    for (const targetId of outgoing.get(current.id) ?? []) {
      const nextIndegree = (indegree.get(targetId) ?? 0) - 1
      indegree.set(targetId, nextIndegree)
      if (nextIndegree === 0) ready.push(processing[originalIndex.get(targetId)!])
    }
  }

  const orderedIds = new Set(ordered.map((node) => node.id))
  return [...ordered, ...processing.filter((node) => !orderedIds.has(node.id))]
}

export function processingMoveAvailability(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  nodeId: string,
): ProcessingMoveAvailability {
  return {
    up: Boolean(resolveProcessingSwap(nodes, edges, nodeId, 'up')),
    down: Boolean(resolveProcessingSwap(nodes, edges, nodeId, 'down')),
  }
}

export function moveWorkspaceProcessingStep(
  nodes: readonly GraphNode[],
  edges: GraphEdge[],
  nodeId: string,
  direction: ProcessingMoveDirection,
): GraphEdge[] {
  const swap = resolveProcessingSwap(nodes, edges, nodeId, direction)
  if (!swap) return edges

  return edges.map((edge) => {
    if (swap.previous?.id === edge.id) return { ...edge, target: swap.downstream.id }
    if (edge.id === swap.bridge.id) return { ...edge, source: swap.downstream.id, target: swap.upstream.id }
    if (swap.next?.id === edge.id) return { ...edge, source: swap.upstream.id }
    return edge
  })
}

interface ProcessingSwap {
  upstream: GraphNode
  downstream: GraphNode
  previous?: GraphEdge
  bridge: GraphEdge
  next?: GraphEdge
}

function resolveProcessingSwap(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  nodeId: string,
  direction: ProcessingMoveDirection,
): ProcessingSwap | undefined {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const selected = nodeById.get(nodeId)
  if (selected?.data.category !== 'processing') return undefined

  const selectedNeighborEdge = direction === 'down'
    ? dataEdgesFrom(edges, selected.id)[0]
    : dataEdgesTo(edges, selected.id)[0]
  if (!selectedNeighborEdge) return undefined
  const neighborId = direction === 'down' ? selectedNeighborEdge.target : selectedNeighborEdge.source
  const neighbor = nodeById.get(neighborId)
  if (neighbor?.data.category !== 'processing') return undefined

  const upstream = direction === 'down' ? selected : neighbor
  const downstream = direction === 'down' ? neighbor : selected
  if (hasNonDataConnection(edges, upstream.id) || hasNonDataConnection(edges, downstream.id)) return undefined

  const upstreamIncoming = dataEdgesTo(edges, upstream.id)
  const upstreamOutgoing = dataEdgesFrom(edges, upstream.id)
  const downstreamIncoming = dataEdgesTo(edges, downstream.id)
  const downstreamOutgoing = dataEdgesFrom(edges, downstream.id)
  if (upstreamIncoming.length > 1 || upstreamOutgoing.length !== 1) return undefined
  if (downstreamIncoming.length !== 1 || downstreamOutgoing.length > 1) return undefined

  const bridge = upstreamOutgoing[0]
  if (bridge.source !== upstream.id || bridge.target !== downstream.id || downstreamIncoming[0].id !== bridge.id) return undefined
  if (hasDataPath(edges, downstream.id, upstream.id)) return undefined

  const previous = upstreamIncoming[0]
  const next = downstreamOutgoing[0]
  if (previous?.source === downstream.id || next?.target === upstream.id) return undefined
  const previousNode = previous ? nodeById.get(previous.source) : undefined
  const nextNode = next ? nodeById.get(next.target) : undefined
  if (previous && (!previousNode || !['source', 'processing'].includes(previousNode.data.category))) return undefined
  if (next && (!nextNode || !['processing', 'strategy'].includes(nextNode.data.category))) return undefined
  if (previousNode?.data.category === 'processing' && dataEdgesFrom(edges, previousNode.id).length !== 1) return undefined
  if (nextNode?.data.category === 'processing' && dataEdgesTo(edges, nextNode.id).length !== 1) return undefined

  return { upstream, downstream, ...(previous ? { previous } : {}), bridge, ...(next ? { next } : {}) }
}

function dataEdgesFrom(edges: readonly GraphEdge[], nodeId: string) {
  return edges.filter((edge) => edge.source === nodeId && edge.data?.semantic === 'data')
}

function dataEdgesTo(edges: readonly GraphEdge[], nodeId: string) {
  return edges.filter((edge) => edge.target === nodeId && edge.data?.semantic === 'data')
}

function hasNonDataConnection(edges: readonly GraphEdge[], nodeId: string) {
  return edges.some((edge) => (edge.source === nodeId || edge.target === nodeId) && edge.data?.semantic !== 'data')
}

function hasDataPath(edges: readonly GraphEdge[], sourceId: string, targetId: string) {
  const pending = [sourceId]
  const visited = new Set<string>()
  while (pending.length) {
    const current = pending.shift()!
    if (current === targetId) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of dataEdgesFrom(edges, current)) pending.push(edge.target)
  }
  return false
}
