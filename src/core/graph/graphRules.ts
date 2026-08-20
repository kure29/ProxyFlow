import type { Connection } from '@xyflow/react'
import type { BlockCategory, GraphNode } from '../../types/project'

const allowedTargets: Record<BlockCategory, BlockCategory[]> = {
  source: ['processing', 'strategy', 'output'],
  processing: ['processing', 'strategy'],
  strategy: ['chain', 'output'],
  chain: ['output'],
  routing: ['strategy', 'chain', 'output'],
  dns: ['output'],
  output: [],
}

export function isConnectionAllowed(connection: Connection, nodes: GraphNode[]): boolean {
  if (!connection.source || !connection.target || connection.source === connection.target) return false
  const source = nodes.find((node) => node.id === connection.source)
  const target = nodes.find((node) => node.id === connection.target)
  if (!source || !target) return false
  return allowedTargets[source.data.category].includes(target.data.category)
}

export function semanticForConnection(connection: Connection, nodes: GraphNode[]) {
  const source = nodes.find((node) => node.id === connection.source)
  const target = nodes.find((node) => node.id === connection.target)
  if (!source || !target) return 'data' as const
  if (source.data.category === 'dns') return 'dns' as const
  if (target.data.category === 'output') return 'output' as const
  if (source.data.category === 'routing') return 'route' as const
  if (target.data.category === 'chain') return 'strategy' as const
  return 'data' as const
}
