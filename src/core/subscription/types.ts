import type { ResolvedProxyEndpointIR, SupportedProxyProtocol } from '../proxy'

export type SubscriptionFormat = 'share-links' | 'base64' | 'clash-yaml' | 'unsupported'
export type SubscriptionInputKind = 'url' | 'paste' | 'file'
export type SubscriptionFetchStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'cors'
export type ParsedNodeStatus = 'ready' | 'partial' | 'unsupported'

export interface SubscriptionIssue {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  nodeId?: string
  nodeName?: string
  line?: number
}

export interface ParsedSubscriptionNode {
  id: string
  name: string
  protocol: SupportedProxyProtocol | string
  server?: string
  port?: number
  sourceId: string
  sourceName: string
  status: ParsedNodeStatus
  endpoint?: ResolvedProxyEndpointIR
  issues: SubscriptionIssue[]
}

export interface SubscriptionParseResult {
  format: SubscriptionFormat
  proxies: ResolvedProxyEndpointIR[]
  nodes: ParsedSubscriptionNode[]
  issues: SubscriptionIssue[]
  detectedCount: number
  readyCount: number
  partialCount: number
  unsupportedCount: number
}

export interface ParseSubscriptionOptions {
  sourceId: string
  sourceName?: string
  filename?: string
  maxBytes?: number
  maxNodes?: number
}

export interface SubscriptionSnapshot {
  inputKind: SubscriptionInputKind
  fetchStatus: SubscriptionFetchStatus
  result?: SubscriptionParseResult
  lastSuccessfulAt?: string
  latestAttemptAt?: string
  latestErrorCode?: string
  latestErrorMessage?: string
  fileName?: string
  stale?: boolean
}

export type ProxyEndpointDraft = ResolvedProxyEndpointIR extends infer Endpoint
  ? Endpoint extends ResolvedProxyEndpointIR ? Omit<Endpoint, 'id' | 'metadata'> : never
  : never
