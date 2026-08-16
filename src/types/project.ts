import type { Edge, Node } from '@xyflow/react'
import type { TargetClient, OutputDefinition } from './output'
import type { ServiceDefinition } from './services'
import type { RegionCode, SupportedProxyProtocol } from '../core/proxy'

export type { TargetClient, OutputDefinition } from './output'
export type { ServiceCategory, RuleSource, ServiceDefinition, ServiceMatcherDefinition } from './services'

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
  subscriptionInputKind?: 'url' | 'paste' | 'file'
  subscriptionContent?: string
  subscriptionFileName?: string
  proxyProtocol?: SupportedProxyProtocol | 'socks'
  proxyServer?: string
  proxyPort?: number
  proxyUsername?: string
  proxyPassword?: string
  proxyUuid?: string
  proxyMethod?: string
  proxySecurity?: string
  proxyAlterId?: number
  proxyTls?: boolean
  proxyServerName?: string
  proxyAllowInsecure?: boolean
  proxyTransport?: 'tcp' | 'ws' | 'http' | 'grpc'
  proxyTransportPath?: string
  proxyTransportHost?: string
  proxyGrpcServiceName?: string
  enabled?: boolean
  nodeCount?: number
  updatedAt?: string
  include?: string[]
  exclude?: string[]
  includeRegex?: string
  excludeRegex?: string
  includeRegions?: RegionCode[]
  excludeRegions?: RegionCode[]
  includeProtocols?: SupportedProxyProtocol[]
  excludeProtocols?: SupportedProxyProtocol[]
  strategyMode?: string
  testUrl?: string
  interval?: number
  tolerance?: number
  hopIds?: string[]
  services?: string[]
  targetId?: string
  targetLabel?: string
  targetKind?: 'strategy' | 'direct' | 'reject'
  ruleSource?: string
  client?: TargetClient
  compatibility?: string
  resolver?: string
  renamePattern?: string
  renameReplacement?: string
  sortBy?: 'name' | 'region' | 'protocol' | 'latency'
  sortDirection?: 'ascending' | 'descending'
  deduplicateBy?: 'identity'
  limit?: number
  loadBalanceMode?: 'round-robin' | 'consistent-hash'
  proxyId?: string
  routePriority?: number
  runtimeStatus?: 'ready' | 'stale' | 'error' | 'unavailable'
  runtimeInputCount?: number
  runtimeOutputCount?: number
  runtimeRemovedCount?: number
  runtimeProtocolCount?: number
  runtimeIssueCount?: number
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
  code: string
  severity: 'info' | 'warning' | 'error'
  feature: string
  message: string
  entityId?: string
}

export interface ValidationIssue {
  id: string
  nodeId: string
  severity: 'warning' | 'error'
  message: string
}
