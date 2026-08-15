import type { GraphEdge, GraphNode } from '../../types/project'

export function getHighlightedPath(selectedNodeId: string | null, nodes: GraphNode[], edges: GraphEdge[]) {
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  if (!selectedNodeId) return { nodeIds, edgeIds }

  const queue = [selectedNodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (nodeIds.has(current)) continue
    nodeIds.add(current)
    const currentNode = nodes.find((node) => node.id === current)
    if (currentNode?.data.blockType === 'proxy-chain') {
      for (const hopId of currentNode.data.hopIds ?? []) nodeIds.add(hopId)
    }
    for (const edge of edges.filter((item) => item.source === current)) {
      edgeIds.add(edge.id)
      queue.push(edge.target)
    }
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) edgeIds.add(edge.id)
  }
  return { nodeIds, edgeIds }
}
