import type { Edge, Node } from '@xyflow/react'
import type { TargetClient, OutputDefinition } from './output'
import type { ServiceDefinition } from './services'

export type { TargetClient, OutputDefinition } from './output'
export type { ServiceCategory, RuleSource, ServiceDefinition } from './services'

export type BlockCategory =
  | 'source'
  | 'processing'
  | 'strategy'
  | 'chain'
  | 'routing'
  | 'dns'
  | 'output'

export type BlockType =
  | 'subscription'
  | 'manual-proxy'
  | 'provider'
  | 'import-config'
  | 'filter'
  | 'rename'
  | 'sort'
  | 'deduplicate'
  | 'merge'
  | 'limit'
  | 'manual-select'
  | 'auto-select'
  | 'fallback'
  | 'load-balance'
  | 'fixed-proxy'
  | 'proxy-chain'
  | 'routing-group'
  | 'service-rule'
  | 'custom-rule'
  | 'final'
  | 'dns'
  | 'output'

export type EdgeSemantic = 'data' | 'route' | 'strategy' | 'chain' | 'output' | 'dns'
export interface BlockNodeData extends Record<string, unknown> {
  blockType: BlockType
  category: BlockCategory
  title: string
  subtitle: string
  icon: string
  disabled?: boolean
  protected?: boolean
  warning?: string
  highlighted?: boolean
  dimmed?: boolean
  subscriptionUrl?: string
  enabled?: boolean
  nodeCount?: number
  updatedAt?: string
  include?: string[]
  exclude?: string[]
  strategyMode?: string
  testUrl?: string
  interval?: number
  tolerance?: number
  hopIds?: string[]
  services?: string[]
  targetId?: string
  targetLabel?: string
  ruleSource?: string
  client?: TargetClient
  compatibility?: string
  resolver?: string
  renamePattern?: string
  renameReplacement?: string
  sortBy?: 'name' | 'latency'
  sortDirection?: 'ascending' | 'descending'
  deduplicateBy?: 'name' | 'server'
  limit?: number
  loadBalanceMode?: 'round-robin' | 'consistent-hash'
  proxyId?: string
  routePriority?: number
}

export interface FlowEdgeData extends Record<string, unknown> {
  semantic: EdgeSemantic
}

export type GraphNode = Node<BlockNodeData, 'block'>
export type GraphEdge = Edge<FlowEdgeData>

export interface ProxyFlowProject {
  version: number
  id: string
  name: string
  graph: {
    nodes: GraphNode[]
    edges: GraphEdge[]
  }
  services: ServiceDefinition[]
  outputs: OutputDefinition[]
  updatedAt: string
}

export interface CompatibilityIssue {
  target: TargetClient
  severity: 'info' | 'warning' | 'error'
  feature: string
  message: string
}

export interface ValidationIssue {
  id: string
  nodeId: string
  severity: 'warning' | 'error'
  message: string
}
