import { getTargetCapabilities, strategyCapabilityForBlockType } from '../capabilities'
import type { CapabilityStatus, PrimaryTarget } from '../capabilities'
import { diagnosticNodeId, type StructuredDiagnostic } from '../compiler/diagnostics'
import type { SubscriptionActiveState, SubscriptionFreshness, SubscriptionRefreshStatus } from '../subscription'
import type { BlockType, CompatibilityIssue, GraphNode } from '../../types/project'
import type { WorkspaceNodeItem, WorkspaceProxySummary, WorkspaceSourceAvailability } from './projectWorkspace'

export type WorkspacePresentationStatus = 'ready' | 'warning' | 'error' | 'stale' | 'unavailable' | 'disabled'
export type WorkspaceSourceStatus = WorkspaceSourceAvailability

export interface WorkspaceSourceRuntimeLike {
  refreshStatus?: SubscriptionRefreshStatus
  activeState?: SubscriptionActiveState
  freshness?: SubscriptionFreshness
  activeSnapshot?: {
    committedAt?: string
    result: { detectedCount: number }
  }
  lastSuccessfulAt?: string
}

export interface WorkspaceSourcePresentation {
  id: string
  title: string
  kind: BlockType
  hostname?: string
  nodeCount: number
  lastSuccessfulAt?: string
  status: WorkspaceSourceStatus
  usingLastKnownGood: boolean
}

export function extractSafeSourceHostname(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.hostname || undefined
  } catch {
    return undefined
  }
}

export function summarizeWorkspaceSource(
  node: GraphNode,
  runtime?: WorkspaceSourceRuntimeLike,
): WorkspaceSourcePresentation {
  const activeSnapshot = runtime?.activeSnapshot
  const hostname = node.data.subscriptionInputKind !== 'paste' && node.data.subscriptionInputKind !== 'file'
    ? extractSafeSourceHostname(node.data.subscriptionUrl)
    : undefined
  const usingLastKnownGood = Boolean(activeSnapshot && runtime?.refreshStatus === 'failed')
  return {
    id: node.id,
    title: node.data.title,
    kind: node.data.blockType,
    ...(hostname ? { hostname } : {}),
    nodeCount: finiteCount(activeSnapshot?.result.detectedCount ?? node.data.nodeCount),
    ...(runtime?.lastSuccessfulAt || activeSnapshot?.committedAt
      ? { lastSuccessfulAt: runtime?.lastSuccessfulAt ?? activeSnapshot?.committedAt }
      : {}),
    status: sourceStatus(node, runtime),
    usingLastKnownGood,
  }
}

export interface WorkspaceProxyFilters {
  search?: string
  sourceId?: string
  region?: string
  protocol?: WorkspaceProxySummary['protocol']
  compatibility?: WorkspaceProxySummary['compatibility']
  sourceAvailability?: WorkspaceProxySummary['sourceAvailability']
}

export function filterWorkspaceProxies(
  proxies: readonly WorkspaceProxySummary[],
  filters: WorkspaceProxyFilters,
): WorkspaceProxySummary[] {
  const search = normalize(filters.search)
  const sourceId = normalize(filters.sourceId)
  const region = normalize(filters.region)
  const protocol = normalize(filters.protocol)
  const compatibility = normalize(filters.compatibility)
  const sourceAvailability = normalize(filters.sourceAvailability)

  return proxies.filter((proxy) => {
    if (sourceId && normalize(proxy.sourceId) !== sourceId) return false
    if (region && normalize(proxy.region) !== region) return false
    if (protocol && normalize(proxy.protocol) !== protocol) return false
    if (compatibility && normalize(proxy.compatibility) !== compatibility) return false
    if (sourceAvailability && normalize(proxy.sourceAvailability) !== sourceAvailability) return false
    if (!search) return true
    return [proxy.name, proxy.sourceName, proxy.region, proxy.protocol]
      .some((value) => normalize(value).includes(search))
  })
}

export interface WorkspacePipelineRuntimeLike {
  status?: 'ready' | 'stale' | 'error' | 'unavailable'
  inputCount?: number
  outputCount?: number
  removedCount?: number
}

export interface WorkspacePresentationIssueLike extends StructuredDiagnostic {}

export type WorkspaceProcessingSummary =
  | { kind: 'filter'; mode: 'keyword' | 'region' | 'regex' | 'legacy'; operation?: 'include' | 'exclude'; criterionCount: number }
  | { kind: 'rename'; mode: 'simple' | 'regex'; configured: boolean }
  | { kind: 'sort'; by: 'name' | 'region' | 'protocol' | 'latency'; direction: 'ascending' | 'descending' }
  | { kind: 'deduplicate'; by: 'identity' }
  | { kind: 'merge'; sourceCount: number }
  | { kind: 'limit'; max?: number }
  | { kind: 'unknown' }

export interface WorkspaceProcessingPresentation {
  id: string
  title: string
  blockType: BlockType
  status: WorkspacePresentationStatus
  inputCount?: number
  outputCount?: number
  removedCount?: number
  summary: WorkspaceProcessingSummary
}

export function summarizeWorkspaceProcessing(
  item: WorkspaceNodeItem,
  runtime?: WorkspacePipelineRuntimeLike,
  issues: readonly WorkspacePresentationIssueLike[] = [],
): WorkspaceProcessingPresentation {
  return {
    id: item.node.id,
    title: item.node.data.title,
    blockType: item.node.data.blockType,
    status: presentationStatus(item.node, runtime, issues),
    ...runtimeCounts(item.node, runtime),
    summary: processingSummary(item),
  }
}

export type WorkspaceStrategyKind = 'manual' | 'auto' | 'failover' | 'load-balance' | 'fixed' | 'chain' | 'target-native' | 'unknown'

export type WorkspaceStrategySummary =
  | { kind: 'manual' }
  | { kind: 'auto'; intervalSeconds?: number; toleranceMs?: number }
  | { kind: 'failover'; intervalSeconds?: number; toleranceMs?: number }
  | { kind: 'load-balance'; mode?: 'round-robin' | 'consistent-hash' }
  | { kind: 'fixed'; configured: boolean }
  | { kind: 'chain'; hopCount: number }
  | { kind: 'target-native'; nativeKind: 'smart' | 'subnet'; conditionCount?: number; candidateCount?: number; defaultTarget?: string }
  | { kind: 'unknown' }

export interface WorkspaceStrategyPresentation {
  id: string
  title: string
  blockType: BlockType
  kind: WorkspaceStrategyKind
  advanced: boolean
  status: WorkspacePresentationStatus
  capability: CapabilityStatus | 'unknown'
  candidateCount?: number
  summary: WorkspaceStrategySummary
}

export function summarizeWorkspaceStrategy(
  item: WorkspaceNodeItem,
  target: PrimaryTarget | null,
  runtime?: WorkspacePipelineRuntimeLike,
  issues: readonly WorkspacePresentationIssueLike[] = [],
): WorkspaceStrategyPresentation {
  const kind = strategyKind(item.node.data.blockType)
  const capability = strategyCapability(item.node.data.blockType, target)
  return {
    id: item.node.id,
    title: item.node.data.title,
    blockType: item.node.data.blockType,
    kind,
    advanced: kind === 'load-balance' || kind === 'fixed' || kind === 'chain',
    status: presentationStatus(item.node, runtime, issues),
    capability,
    ...strategyCandidateCount(item.node, runtime),
    summary: strategySummary(item.node, kind),
  }
}

export interface WorkspaceHealthEntry {
  code: string
  severity: StructuredDiagnostic['severity']
  message: string
  locationNodeId?: string
  target?: CompatibilityIssue['target']
  feature?: string
  related?: WorkspaceHealthEntry[]
}

export interface WorkspaceHealthGroups {
  errors: WorkspaceHealthEntry[]
  warnings: WorkspaceHealthEntry[]
  compatibility: WorkspaceHealthEntry[]
}

export function groupProjectHealthDiagnostics(
  diagnostics: readonly StructuredDiagnostic[],
  compatibilityDiagnostics: readonly CompatibilityIssue[],
  availableNodeIds: ReadonlySet<string>,
): WorkspaceHealthGroups {
  const errors: WorkspaceHealthEntry[] = []
  const warnings: WorkspaceHealthEntry[] = []
  for (const issue of diagnostics) {
    const entry = healthEntry(issue, availableNodeIds)
    if (issue.severity === 'error') errors.push(entry)
    else warnings.push(entry)
  }
  return {
    errors: collapseHealthEntries(errors),
    warnings: collapseHealthEntries(warnings),
    compatibility: collapseHealthEntries(compatibilityDiagnostics.map((issue) => healthEntry(issue, availableNodeIds))),
  }
}

function collapseHealthEntries(entries: WorkspaceHealthEntry[]): WorkspaceHealthEntry[] {
  const groups = new Map<string, WorkspaceHealthEntry[]>()
  for (const entry of entries) {
    const key = `${entry.target ?? 'project'}\u0000${entry.locationNodeId ?? 'project'}`
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return [...groups.values()].flatMap(collapseScopedHealthEntries)
}

function collapseScopedHealthEntries(entries: WorkspaceHealthEntry[]) {
  const byCode = new Map<string, WorkspaceHealthEntry[]>()
  for (const entry of entries) {
    const code = canonicalDiagnosticCode(entry.code)
    byCode.set(code, [...(byCode.get(code) ?? []), entry])
  }
  const unique = [...byCode.entries()].map(([code, matches]) => ({
    code,
    entry: matches.length > 1 ? { ...matches[0], related: matches.slice(1) } : matches[0],
  }))
  const forcedIndex = unique.findIndex(({ code }) => code === 'REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED')
  if (forcedIndex < 0) return unique.map(({ entry }) => entry)
  const [forced] = unique.splice(forcedIndex, 1)
  const root = unique.find(({ code }) => REMOTE_SOURCE_ROOT_CAUSES.has(code))
  if (!root) return [...unique.map(({ entry }) => entry), forced.entry]
  root.entry = { ...root.entry, related: [...(root.entry.related ?? []), forced.entry] }
  return unique.map(({ entry }) => entry)
}

const REMOTE_SOURCE_ROOT_CAUSES = new Set([
  'REMOTE_SOURCE_PROCESSING_UNSUPPORTED',
  'REMOTE_SOURCE_TARGET_UNSUPPORTED',
  'REMOTE_SOURCE_REQUEST_PROFILE_UNSUPPORTED',
  'REMOTE_SOURCE_SNAPSHOT_UNAVAILABLE',
  'REMOTE_SOURCE_MIXED_INPUTS',
])

function canonicalDiagnosticCode(code: string) {
  const remoteIndex = code.indexOf('REMOTE_')
  return remoteIndex >= 0 ? code.slice(remoteIndex) : code
}

function sourceStatus(node: GraphNode, runtime?: WorkspaceSourceRuntimeLike): WorkspaceSourceStatus {
  if (node.data.disabled || node.data.enabled === false) return 'disabled'
  if (runtime?.refreshStatus === 'loading') return 'refreshing'
  if (runtime?.refreshStatus === 'failed') return 'error'
  if (runtime?.freshness === 'stale') return 'stale'
  if (runtime?.refreshStatus === 'succeeded' || runtime?.activeSnapshot || runtime?.activeState === 'usable') return 'healthy'
  if (node.data.blockType === 'manual-proxy' || node.data.blockType === 'import-config') return 'healthy'
  return 'idle'
}

function processingSummary(item: WorkspaceNodeItem): WorkspaceProcessingSummary {
  const data = item.node.data
  switch (data.blockType) {
    case 'filter':
      if (data.filterMode) return {
        kind: 'filter',
        mode: data.filterMode,
        operation: data.filterOperation === 'exclude' ? 'exclude' : 'include',
        criterionCount: canonicalFilterCriterionCount(data),
      }
      return { kind: 'filter', mode: 'legacy', criterionCount: legacyFilterCriterionCount(data) }
    case 'rename':
      return { kind: 'rename', mode: data.renameMode ?? 'regex', configured: Boolean(data.renamePattern) }
    case 'sort':
      return { kind: 'sort', by: data.sortBy ?? 'name', direction: data.sortDirection ?? 'ascending' }
    case 'deduplicate':
      return { kind: 'deduplicate', by: 'identity' }
    case 'merge':
      return { kind: 'merge', sourceCount: item.incoming.filter(({ semantic }) => semantic === 'data').length }
    case 'limit':
      return { kind: 'limit', ...(data.limit === undefined ? {} : { max: data.limit }) }
    default:
      return { kind: 'unknown' }
  }
}

function canonicalFilterCriterionCount(data: GraphNode['data']) {
  if (data.filterMode === 'region') return data.filterRegions?.length ?? 0
  if (data.filterMode === 'regex') return data.filterRegexPattern?.trim() ? 1 : 0
  return data.filterKeyword?.trim() ? 1 : 0
}

function legacyFilterCriterionCount(data: GraphNode['data']) {
  return [
    ...(data.include ?? []), ...(data.exclude ?? []),
    ...(data.includeRegions ?? []), ...(data.excludeRegions ?? []),
    ...(data.includeProtocols ?? []), ...(data.excludeProtocols ?? []),
    data.includeRegex, data.excludeRegex,
  ].filter((value) => typeof value === 'string' && value.trim()).length
}

function strategyKind(blockType: BlockType): WorkspaceStrategyKind {
  if (blockType === 'target-native-strategy') return 'target-native'
  if (blockType === 'manual-select') return 'manual'
  if (blockType === 'auto-select') return 'auto'
  if (blockType === 'fallback') return 'failover'
  if (blockType === 'load-balance') return 'load-balance'
  if (blockType === 'fixed-proxy') return 'fixed'
  if (blockType === 'proxy-chain') return 'chain'
  return 'unknown'
}

function strategySummary(node: GraphNode, kind: WorkspaceStrategyKind): WorkspaceStrategySummary {
  if (kind === 'target-native') {
    const native = node.data.targetNativeStrategy
    if (native?.kind === 'smart') return { kind, nativeKind: 'smart', candidateCount: native.members.length }
    if (native?.kind === 'subnet') return { kind, nativeKind: 'subnet', conditionCount: native.conditions.length, defaultTarget: native.defaultPolicy.kind === 'builtin' ? native.defaultPolicy.id : native.defaultPolicy.id }
    return { kind, nativeKind: 'subnet', conditionCount: 0 }
  }
  if (kind === 'auto' || kind === 'failover') return {
    kind,
    ...(node.data.interval === undefined ? {} : { intervalSeconds: node.data.interval }),
    ...(node.data.tolerance === undefined ? {} : { toleranceMs: node.data.tolerance }),
  }
  if (kind === 'load-balance') return {
    kind,
    ...(node.data.loadBalanceMode ? { mode: node.data.loadBalanceMode } : {}),
  }
  if (kind === 'fixed') return { kind, configured: Boolean(node.data.proxyId) }
  if (kind === 'chain') return { kind, hopCount: node.data.hopIds?.length ?? 0 }
  if (kind === 'manual') return { kind }
  return { kind: 'unknown' }
}

function strategyCapability(blockType: BlockType, target: PrimaryTarget | null): CapabilityStatus | 'unknown' {
  if (!target) return 'unknown'
  if (blockType === 'target-native-strategy') {
    return target === 'surge' ? 'target-native' : 'unsupported'
  }
  const capability = strategyCapabilityForBlockType(blockType)
  return capability ? getTargetCapabilities(target).strategies[capability].status : 'unknown'
}

function strategyCandidateCount(node: GraphNode, runtime?: WorkspacePipelineRuntimeLike) {
  if (node.data.blockType === 'proxy-chain') return {}
  if (node.data.blockType === 'fixed-proxy') return { candidateCount: node.data.proxyId ? 1 : 0 }
  const count = runtime?.outputCount ?? node.data.runtimeOutputCount
  return count === undefined ? {} : { candidateCount: finiteCount(count) }
}

function presentationStatus(
  node: GraphNode,
  runtime: WorkspacePipelineRuntimeLike | undefined,
  issues: readonly WorkspacePresentationIssueLike[],
): WorkspacePresentationStatus {
  if (node.data.disabled) return 'disabled'
  const availableNodeIds = new Set([node.id])
  const nodeIssues = issues.filter((issue) => diagnosticNodeId(issue, availableNodeIds) === node.id)
  if (nodeIssues.some(({ severity }) => severity === 'error') || runtime?.status === 'error') return 'error'
  if (runtime?.status === 'unavailable') return 'unavailable'
  if (nodeIssues.some(({ severity }) => severity === 'warning')) return 'warning'
  if (runtime?.status === 'stale') return 'stale'
  return 'ready'
}

function runtimeCounts(node: GraphNode, runtime?: WorkspacePipelineRuntimeLike) {
  const inputCount = runtime?.inputCount ?? node.data.runtimeInputCount
  const outputCount = runtime?.outputCount ?? node.data.runtimeOutputCount
  const removedCount = runtime?.removedCount ?? node.data.runtimeRemovedCount
  return {
    ...(inputCount === undefined ? {} : { inputCount: finiteCount(inputCount) }),
    ...(outputCount === undefined ? {} : { outputCount: finiteCount(outputCount) }),
    ...(removedCount === undefined ? {} : { removedCount: finiteCount(removedCount) }),
  }
}

function healthEntry(
  issue: StructuredDiagnostic & Partial<Pick<CompatibilityIssue, 'target' | 'feature'>>,
  availableNodeIds: ReadonlySet<string>,
): WorkspaceHealthEntry {
  const locationNodeId = diagnosticNodeId(issue, availableNodeIds)
  return {
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    ...(locationNodeId ? { locationNodeId } : {}),
    ...(issue.target ? { target: issue.target } : {}),
    ...(issue.feature ? { feature: issue.feature } : {}),
  }
}

function finiteCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function normalize(value: unknown) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
}
