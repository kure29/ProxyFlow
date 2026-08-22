import type { ResolvedProxyEndpointIR, SupportedProxyProtocol } from '../proxy'

export type SubscriptionFormat =
  | 'share-links' | 'base64' | 'clash-yaml' | 'clash-json' | 'sing-box-json' | 'v2ray-json'
  | 'sub-store-json' | 'surge' | 'surfboard' | 'loon' | 'quantumult-x' | 'egern' | 'stash' | 'unsupported'
export type SubscriptionInputKind = 'url' | 'paste' | 'file'
export type SubscriptionRequestProfile = 'auto' | 'mihomo' | 'sing-box' | 'generic'
export type SubscriptionExportMode = 'auto' | 'remote' | 'materialized'
export type ParsedNodeStatus = 'ready' | 'partial' | 'unsupported'
export type SubscriptionRefreshStatus = 'idle' | 'loading' | 'succeeded' | 'failed'
export type SubscriptionActiveState = 'none' | 'usable' | 'empty'
export type SubscriptionFreshness = 'fresh' | 'stale'
export type SubscriptionLatestOutcome = 'success' | 'failure' | 'superseded' | 'empty-confirmation-required'
export type SubscriptionSnapshotQuality = 'usable' | 'empty' | 'invalid'

export type SubscriptionRefreshErrorCode =
  | 'SUBSCRIPTION_INVALID_URL'
  | 'SUBSCRIPTION_HTTP_ERROR'
  | 'SUBSCRIPTION_CORS_BLOCKED'
  | 'SUBSCRIPTION_NETWORK_ERROR'
  | 'SUBSCRIPTION_TIMEOUT'
  | 'SUBSCRIPTION_RUNTIME_UNAVAILABLE'
  | 'SUBSCRIPTION_RUNTIME_POLICY_BLOCKED'
  | 'SUBSCRIPTION_TLS_ERROR'
  | 'SUBSCRIPTION_REQUEST_PROFILE_INVALID'
  | 'SUBSCRIPTION_CONTENT_ENCODING_ERROR'
  | 'SUBSCRIPTION_TOO_LARGE'
  | 'SUBSCRIPTION_UNSUPPORTED_FORMAT'
  | 'SUBSCRIPTION_PARSE_FAILED'
  | 'SUBSCRIPTION_NO_USABLE_NODES'
  | 'SUBSCRIPTION_EMPTY_CONFIRMATION_REQUIRED'
  | 'SUBSCRIPTION_REFRESH_SUPERSEDED'
  | 'SUBSCRIPTION_CACHE_READ_FAILED'
  | 'SUBSCRIPTION_CACHE_WRITE_FAILED'
  | 'SUBSCRIPTION_SNAPSHOT_COMMIT_FAILED'
  | 'SUBSCRIPTION_IDENTITY_AMBIGUOUS'
  | 'SUBSCRIPTION_RUNTIME_INTERNAL_ERROR'

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
  snapshotId: string
  sourceId: string
  snapshotSchemaVersion: 1
  identityAlgorithmVersion: 1
  inputKind: SubscriptionInputKind
  createdAt: string
  fetchedAt: string
  parsedAt: string
  committedAt: string
  contentHash: string
  sourceConfigFingerprint: string
  format: SubscriptionFormat
  result: SubscriptionParseResult
  readyCount: number
  partialCount: number
  unsupportedCount: number
  issues: SubscriptionIssue[]
  quality: Exclude<SubscriptionSnapshotQuality, 'invalid'>
  http?: {
    status: number
    contentType?: string
    contentLength?: number
    responseBytes?: number
    etag?: string
    lastModified?: string
    durationMs: number
  }
}

export type SubscriptionSnapshotCandidate = Omit<SubscriptionSnapshot, 'committedAt' | 'quality'> & {
  quality: SubscriptionSnapshotQuality
}

export type SubscriptionDiffKind = 'added' | 'removed' | 'changed' | 'unchanged'
export type SubscriptionChangeType = 'renamed' | 'authentication' | 'connection' | 'metadata' | 'readiness'

export interface SubscriptionDiffEntry {
  kind: SubscriptionDiffKind
  identity: string
  name: string
  previousName?: string
  changeTypes: SubscriptionChangeType[]
  changedFields: string[]
}

export interface SubscriptionDiff {
  oldSnapshotId?: string
  newSnapshotId: string
  isInitialBaseline: boolean
  entries: SubscriptionDiffEntry[]
  added: number
  removed: number
  changed: number
  unchanged: number
  issues: Array<Pick<SubscriptionIssue, 'code' | 'severity' | 'message'>>
}

export interface SubscriptionRefreshError {
  code: SubscriptionRefreshErrorCode
  message: string
  at: string
  httpStatus?: number
}

export type SubscriptionFetchPath = 'browser' | 'runtime'

export interface SubscriptionRuntimeRecord {
  sourceId: string
  inputKind: SubscriptionInputKind
  sourceConfigFingerprint: string
  refreshStatus: SubscriptionRefreshStatus
  activeState: SubscriptionActiveState
  freshness: SubscriptionFreshness
  latestOutcome?: SubscriptionLatestOutcome
  activeSnapshot?: SubscriptionSnapshot
  pendingEmptySnapshot?: SubscriptionSnapshotCandidate
  pendingEmptyDiff?: SubscriptionDiff
  latestDiff?: SubscriptionDiff
  lastAttemptAt?: string
  lastSuccessfulAt?: string
  lastFailureAt?: string
  latestFetchPath?: SubscriptionFetchPath
  latestError?: SubscriptionRefreshError
  cacheError?: SubscriptionRefreshError
  requestGeneration: number
  fileName?: string
}

export interface RefreshAllSummary {
  succeeded: number
  failed: number
  skipped: number
  confirmationRequired: number
  retainedPrevious: number
}

export type ProxyEndpointDraft = ResolvedProxyEndpointIR extends infer Endpoint
  ? Endpoint extends ResolvedProxyEndpointIR ? Omit<Endpoint, 'id' | 'metadata'> : never
  : never
