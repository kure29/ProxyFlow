import type { Edge, Node } from '@xyflow/react'

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
export type TargetClient =
  | 'mihomo'
  | 'sing-box'
  | 'surge'
  | 'loon'
  | 'quantumult-x'
  | 'shadowrocket'
  | 'stash'

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
}

export interface FlowEdgeData extends Record<string, unknown> {
  semantic: EdgeSemantic
}

export type GraphNode = Node<BlockNodeData, 'block'>
export type GraphEdge = Edge<FlowEdgeData>

export type ServiceCategory = 'ai' | 'streaming' | 'social' | 'development' | 'gaming' | 'regional'

export interface RuleSource {
  id: string
  provider: 'ios-rule-script' | 'builtin' | 'remote' | 'custom'
  format?: string
  url?: string
  updatedAt?: string
  ruleCount?: number
}

export interface ServiceDefinition {
  id: string
  name: string
  category: ServiceCategory
  icon?: string
  description?: string
  ruleSources: RuleSource[]
  defaultMatchers?: string[]
}

export interface OutputDefinition {
  id: string
  target: TargetClient
  label: string
  status: 'supported' | 'prototype' | 'coming-soon'
}

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
