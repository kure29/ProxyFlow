import type { Edge, Node } from '@xyflow/react'
import type { TargetClient, OutputDefinition, MihomoOutputProfile } from './output'
import type { CustomRuleSource, ServiceDefinition } from './services'
import type { RegionCode, SupportedProxyProtocol } from '../core/proxy'
import type { PrimaryTarget } from '../core/capabilities'
import type { SubscriptionExportMode, SubscriptionRequestProfile } from '../core/subscription/types'
import type { TargetNativeStrategyConfig } from '../core/targetNative'

export type { TargetClient, OutputDefinition, MihomoDnsMode, MihomoOutputProfile, MihomoRuntimePreset, MihomoTunStack } from './output'
export type { PrimaryTarget } from '../core/capabilities'
export type { CustomRuleSource, CustomRuleSourceFormat, ServiceCategory, RuleSource, ServiceDefinition, ServiceMatcherDefinition } from './services'

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
  | 'target-native-strategy'
  | 'fixed-proxy'
  | 'proxy-chain'
  | 'routing-group'
  | 'service-rule'
  | 'custom-rule'
  | 'final'
  | 'dns'
  | 'output'

export type EdgeSemantic = 'data' | 'route' | 'strategy' | 'chain' | 'output' | 'dns'
export type RouteMatcherKind = 'service' | 'domain' | 'domain-suffix' | 'domain-keyword' | 'ip-cidr' | 'ip-cidr6' | 'port' | 'asn' | 'geo-ip' | 'geo-site' | 'rule-set'
export type DnsResolverKind = 'doh' | 'dot' | 'udp' | 'system'
export type DnsResolverRole = 'default' | 'direct' | 'fallback'
export type DnsResolverRegion = 'system' | 'global' | 'mainland-china'

export interface DnsResolverConfig {
  id: string
  name: string
  kind: DnsResolverKind
  role: DnsResolverRole
  address?: string
  enabled: boolean
  presetId?: string
  region?: DnsResolverRegion
}

export interface BlockNodeData extends Record<string, unknown> {
  blockType: BlockType
  category: BlockCategory
  title: string
  subtitle: string
  /** Translation keys are present only for built-in copy. User edits clear them. */
  titleKey?: string
  subtitleKey?: string
  icon: string
  disabled?: boolean
  protected?: boolean
  warning?: string
  highlighted?: boolean
  dimmed?: boolean
  subscriptionUrl?: string
  subscriptionInputKind?: 'url' | 'paste' | 'file'
  subscriptionRequestProfile?: SubscriptionRequestProfile
  subscriptionExportMode?: SubscriptionExportMode
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
  proxyClientFingerprint?: string
  proxyIdleSessionCheckInterval?: number
  proxyIdleSessionTimeout?: number
  proxyMinIdleSession?: number
  proxyTransport?: 'tcp' | 'ws' | 'http' | 'grpc'
  proxyTransportPath?: string
  proxyTransportHost?: string
  proxyGrpcServiceName?: string
  enabled?: boolean
  nodeCount?: number
  updatedAt?: string
  include?: string[]
  exclude?: string[]
  systemFilterKeywords?: boolean
  includeRegex?: string
  excludeRegex?: string
  includeRegions?: RegionCode[]
  excludeRegions?: RegionCode[]
  includeProtocols?: SupportedProxyProtocol[]
  excludeProtocols?: SupportedProxyProtocol[]
  filterMode?: 'keyword' | 'region' | 'regex'
  filterOperation?: 'include' | 'exclude'
  filterKeyword?: string
  filterRegions?: RegionCode[]
  filterRegexPattern?: string
  filterRegexIgnoreCase?: boolean
  strategyMode?: string
  /** Typed target-native semantics. Never lowered into Universal StrategyIR. */
  targetNativeStrategy?: TargetNativeStrategyConfig
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
  mihomoProfile?: MihomoOutputProfile
  compatibility?: string
  dnsResolvers?: DnsResolverConfig[]
  resolver?: string
  renamePattern?: string
  renameReplacement?: string
  renameMode?: 'simple' | 'regex'
  renameIgnoreCase?: boolean
  renameGlobal?: boolean
  sortBy?: 'name' | 'region' | 'protocol' | 'latency'
  sortDirection?: 'ascending' | 'descending'
  deduplicateBy?: 'identity'
  limit?: number
  loadBalanceMode?: 'round-robin' | 'consistent-hash'
  proxyId?: string
  routePriority?: number
  routeMatcherKind?: RouteMatcherKind
  routeMatcherValue?: string
  routeMatcherPort?: number
  customRuleSource?: CustomRuleSource
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
  primaryTarget?: PrimaryTarget
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
  code: string
  nodeId: string
  severity: 'warning' | 'error'
  message: string
}
