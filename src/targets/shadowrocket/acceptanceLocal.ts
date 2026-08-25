import { compileGraph, type GraphCompileResult } from '../../core/graphCompiler'
import { proxyFingerprint, stableOpaqueHash } from '../../core/proxy'
import { parseSubscription, type SubscriptionParseResult, type SubscriptionSnapshot } from '../../core/subscription'
import type { ProxyFlowProject, BlockCategory, BlockType, BlockNodeData, GraphEdge, GraphNode } from '../../types/project'
import { compileShadowrocket } from './compiler'

export const SHADOWROCKET_LOCAL_PROFILES = [
  'core',
  'url-test',
  'fallback',
  'load-balance',
  'routing-overlap',
  'routing-inverted',
  'dns-system',
  'dns-udp',
  'subscription',
] as const

export type ShadowrocketLocalProfile = typeof SHADOWROCKET_LOCAL_PROFILES[number]

export type ShadowrocketLocalProfileRequest = ShadowrocketLocalProfile | 'routing' | 'dns' | 'all'

export interface ShadowrocketLocalSummary {
  candidateCount: number
  compatibleEndpointCount: number
  skippedEndpointCount: number
  blockingIssueCount: number
  issueCodeCounts: Record<string, number>
  protocolCounts: Record<string, number>
}

export interface ShadowrocketLocalCompilation {
  profile: ShadowrocketLocalProfile
  graph: GraphCompileResult
  result?: ReturnType<typeof compileShadowrocket>
  parsed?: SubscriptionParseResult
  summary: ShadowrocketLocalSummary
}

export interface ShadowrocketLocalCompileOptions {
  /** Supplied by the human for URL-test/fallback; never fetched by the harness. */
  healthUrl?: string
}

const fixedNow = () => new Date('2026-08-25T00:00:00.000Z')

/**
 * Parse a user-supplied local file without fetching or persisting it. The
 * returned snapshot is the same materialized-input shape used by runtime
 * compilation, but its timestamps and identity are deterministic for audit
 * reproduction.
 */
export function parseShadowrocketLocalInput(content: string): SubscriptionParseResult {
  return parseSubscription(content, {
    sourceId: 'shadowrocket-local-input',
    sourceName: 'Private local acceptance input',
    filename: 'shadowrocket-local-input.txt',
  })
}

export function expandShadowrocketLocalProfiles(request: ShadowrocketLocalProfileRequest): ShadowrocketLocalProfile[] {
  if (request === 'all') return [...SHADOWROCKET_LOCAL_PROFILES]
  if (request === 'routing') return ['routing-overlap', 'routing-inverted']
  if (request === 'dns') return ['dns-system', 'dns-udp']
  return [request]
}

export function shadowrocketLocalProfileNeedsInput(profile: ShadowrocketLocalProfile): boolean {
  return profile === 'core' || profile === 'url-test' || profile === 'fallback' || profile === 'load-balance' || profile === 'subscription'
}

export function compileShadowrocketLocalProfiles(
  content: string | undefined,
  request: ShadowrocketLocalProfileRequest,
  options: ShadowrocketLocalCompileOptions = {},
): ShadowrocketLocalCompilation[] {
  const profiles = expandShadowrocketLocalProfiles(request)
  const parsed = content === undefined ? undefined : parseShadowrocketLocalInput(content)
  return profiles.map((profile) => compileShadowrocketLocalProfile(profile, content, parsed, options))
}

export function compileShadowrocketLocalProfile(
  profile: ShadowrocketLocalProfile,
  content?: string,
  parsedOverride?: SubscriptionParseResult,
  options: ShadowrocketLocalCompileOptions = {},
): ShadowrocketLocalCompilation {
  const parsed = content === undefined && shadowrocketLocalProfileNeedsInput(profile)
    ? undefined
    : parsedOverride ?? (content === undefined ? undefined : parseShadowrocketLocalInput(content))

  if (shadowrocketLocalProfileNeedsInput(profile)) {
    if (!parsed || !content) return blockedLocalCompilation(profile, undefined, ['SHADOWROCKET_LOCAL_INPUT_REQUIRED'])
    if (parsed.issues.some((issue) => issue.severity === 'error')) {
      return blockedLocalCompilation(profile, parsed, uniqueIssueCodes(parsed.issues))
    }
    const distinct = distinctEndpointCount(parsed)
    if (profile !== 'subscription' && distinct < 2) {
      return blockedLocalCompilation(profile, parsed, ['SHADOWROCKET_LOCAL_SELECT_NEEDS_TWO_DISTINCT_MEMBERS'])
    }
    if (profile === 'subscription' && parsed.proxies.length < 1) {
      return blockedLocalCompilation(profile, parsed, ['SHADOWROCKET_LOCAL_SUBSCRIPTION_HAS_NO_ENDPOINTS'])
    }
  }

  const project = buildProject(profile, content, options.healthUrl)
  const snapshot = parsed && content ? createLocalSnapshot(content, parsed) : undefined
  const graph = compileGraph(project, {
    ...(snapshot ? { subscriptionSnapshots: { 'shadowrocket-local-source': snapshot } } : {}),
    validationTarget: 'shadowrocket',
  })
  const result = graph.ir ? compileShadowrocket(graph.ir, { now: fixedNow }) : undefined
  const issues = [...graph.issues, ...(result?.issues ?? [])]
  const summary = createSummary(parsed, result, issues)
  return { profile, graph, result, ...(parsed ? { parsed } : {}), summary }
}

function buildProject(profile: ShadowrocketLocalProfile, content?: string, healthUrl?: string): ProxyFlowProject {
  if (profile === 'routing-overlap' || profile === 'routing-inverted') return buildRoutingProject(profile)
  if (profile === 'dns-system' || profile === 'dns-udp') return buildDnsProject(profile)

  const strategy = strategyNode(profile, healthUrl)
  const source = sourceNode(content)
  const final = node('shadowrocket-local-final', 'final', 'routing', {
    title: 'Final', targetId: strategy.id, targetLabel: strategy.data.title, targetKind: 'strategy',
  })
  const output = outputNode()
  return project(`shadowrocket-local-${profile}`, [source, strategy, final, output], [
    edge('shadowrocket-local-source-strategy', source.id, strategy.id, 'data'),
    edge('shadowrocket-local-final-strategy', final.id, strategy.id, 'route'),
    edge('shadowrocket-local-strategy-output', strategy.id, output.id, 'output'),
  ])
}

function strategyNode(profile: Exclude<ShadowrocketLocalProfile, 'routing-overlap' | 'routing-inverted' | 'dns-system' | 'dns-udp'>, healthUrl?: string): GraphNode {
  const base = { category: 'strategy' as const, icon: 'gauge' }
  if (profile === 'url-test') return node('shadowrocket-local-url-test', 'auto-select', 'strategy', {
    ...base, title: 'Local URL Test', ...(healthUrl ? { testUrl: healthUrl } : {}), interval: 60,
  })
  if (profile === 'fallback') return node('shadowrocket-local-fallback', 'fallback', 'strategy', {
    ...base, title: 'Local Fallback', ...(healthUrl ? { testUrl: healthUrl } : {}), interval: 60,
  })
  if (profile === 'load-balance') return node('shadowrocket-local-load-balance', 'load-balance', 'strategy', {
    ...base, title: 'Local Load Balance', loadBalanceMode: 'round-robin',
  })
  return node('shadowrocket-local-select', 'manual-select', 'strategy', { ...base, title: profile === 'subscription' ? 'Materialized Subscription' : 'Local Select' })
}

function sourceNode(content?: string) {
  return node('shadowrocket-local-source', 'subscription', 'source', {
    title: 'Private Local Input',
    subscriptionInputKind: 'file',
    subscriptionExportMode: 'materialized',
    enabled: true,
    ...(content === undefined ? {} : { subscriptionContent: content }),
  })
}

function buildRoutingProject(profile: 'routing-overlap' | 'routing-inverted') {
  const invert = profile === 'routing-inverted'
  const matchers: Array<{ kind: NonNullable<BlockNodeData['routeMatcherKind']>; value: string; targetKind: 'direct' | 'reject'; priority: number }> = [
    { kind: 'domain', value: 'example.com', targetKind: invert ? 'direct' : 'reject', priority: invert ? 20 : 10 },
    { kind: 'domain-suffix', value: 'example.com', targetKind: invert ? 'reject' : 'direct', priority: invert ? 10 : 20 },
    { kind: 'ip-cidr', value: '192.0.2.0/24', targetKind: invert ? 'direct' : 'reject', priority: invert ? 40 : 30 },
    { kind: 'ip-cidr6', value: '2001:db8::/32', targetKind: invert ? 'reject' : 'direct', priority: invert ? 30 : 40 },
    { kind: 'geo-ip', value: 'US', targetKind: invert ? 'direct' : 'reject', priority: 50 },
  ]
  const routes = matchers.map((matcher, index) => node(`shadowrocket-local-route-${index + 1}`, 'custom-rule', 'routing', {
    title: `Controlled ${matcher.kind}`,
    routeMatcherKind: matcher.kind,
    routeMatcherValue: matcher.value,
    targetKind: matcher.targetKind,
    routePriority: matcher.priority,
  }))
  const final = node('shadowrocket-local-final', 'final', 'routing', { title: 'Final', targetKind: 'direct', targetLabel: 'DIRECT' })
  return project(`shadowrocket-local-${profile}`, [...routes, final, outputNode()], [])
}

function buildDnsProject(profile: 'dns-system' | 'dns-udp') {
  const dnsResolvers = profile === 'dns-system'
    ? [{ id: 'system', name: 'System', kind: 'system' as const, role: 'default' as const, enabled: true }]
    : [{ id: 'udp', name: 'IPv4 UDP', kind: 'udp' as const, role: 'default' as const, address: '192.0.2.53:53', enabled: true }]
  return project(`shadowrocket-local-${profile}`, [
    node('shadowrocket-local-dns', 'dns', 'dns', { title: profile === 'dns-system' ? 'System DNS' : 'IPv4 UDP DNS', dnsResolvers }),
    node('shadowrocket-local-final', 'final', 'routing', { title: 'Final', targetKind: 'direct', targetLabel: 'DIRECT' }),
    outputNode(),
  ], [])
}

function createLocalSnapshot(content: string, result: SubscriptionParseResult): SubscriptionSnapshot {
  const timestamp = fixedNow().toISOString()
  const contentHash = stableOpaqueHash(content)
  return {
    snapshotId: `shadowrocket-local-${contentHash}`,
    sourceId: 'shadowrocket-local-source',
    snapshotSchemaVersion: 1,
    identityAlgorithmVersion: 1,
    inputKind: 'file',
    createdAt: timestamp,
    fetchedAt: timestamp,
    parsedAt: timestamp,
    committedAt: timestamp,
    contentHash,
    sourceConfigFingerprint: stableOpaqueHash(`shadowrocket-local-source\u0000${content}`),
    format: result.format,
    result,
    readyCount: result.readyCount,
    partialCount: result.partialCount,
    unsupportedCount: result.unsupportedCount,
    issues: result.issues,
    quality: result.readyCount + result.partialCount > 0 ? 'usable' : 'empty',
  }
}

function createSummary(parsed: SubscriptionParseResult | undefined, result: ReturnType<typeof compileShadowrocket> | undefined, issues: readonly { code: string; severity: string }[]): ShadowrocketLocalSummary {
  const stats = result?.stats
  return {
    candidateCount: stats?.candidateCount ?? parsed?.detectedCount ?? 0,
    compatibleEndpointCount: stats?.compatibleEndpointCount ?? 0,
    skippedEndpointCount: stats?.skippedEndpointCount ?? 0,
    blockingIssueCount: stats?.blockingIssueCount ?? issues.filter((issue) => issue.severity === 'error').length,
    issueCodeCounts: countIssueCodes(issues),
    protocolCounts: countProtocols(parsed),
  }
}

function blockedLocalCompilation(profile: ShadowrocketLocalProfile, parsed: SubscriptionParseResult | undefined, codes: string[]): ShadowrocketLocalCompilation {
  const issues = [...new Set(codes)].sort().map((code) => ({ code, severity: 'error' as const }))
  const summary = createSummary(parsed, undefined, issues)
  return {
    profile,
    graph: { success: false, issues: issues.map((issue) => ({ ...issue, stage: 'compile' as const, message: issue.code })) },
    ...(parsed ? { parsed } : {}),
    summary,
  }
}

function distinctEndpointCount(parsed: SubscriptionParseResult) {
  const fingerprints = new Set<string>()
  for (const endpoint of parsed.proxies) {
    try { fingerprints.add(proxyFingerprint(endpoint)) } catch { fingerprints.add(`${endpoint.id}\u0000${endpoint.name}`) }
  }
  return fingerprints.size
}

function countProtocols(parsed: SubscriptionParseResult | undefined) {
  const counts: Record<string, number> = {}
  for (const endpoint of parsed?.proxies ?? []) counts[endpoint.protocol] = (counts[endpoint.protocol] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

function countIssueCodes(issues: readonly { code: string }[]) {
  const counts: Record<string, number> = {}
  for (const issue of issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

function uniqueIssueCodes(issues: readonly { code: string }[]) {
  return [...new Set(issues.map((issue) => issue.code))].sort()
}

function project(id: string, nodes: GraphNode[], edges: GraphEdge[]): ProxyFlowProject {
  return {
    version: 2,
    id,
    name: id,
    primaryTarget: 'shadowrocket',
    graph: { nodes, edges },
    services: [],
    outputs: [],
    updatedAt: fixedNow().toISOString(),
  }
}

function node(id: string, blockType: BlockType, category: BlockCategory, data: Partial<BlockNodeData> = {}): GraphNode {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    data: { blockType, category, title: data.title ?? id, subtitle: data.subtitle ?? '', icon: data.icon ?? 'blocks', ...data },
  }
}

function outputNode() {
  return node('shadowrocket-local-output', 'output', 'output', { title: 'Shadowrocket Output', client: 'shadowrocket' })
}

function edge(id: string, source: string, target: string, semantic: GraphEdge['data'] extends infer _ ? NonNullable<GraphEdge['data']>['semantic'] : never): GraphEdge {
  return { id, source, target, type: 'smoothstep', data: { semantic } }
}

export function summarizeParsedSubscription(parsed: SubscriptionParseResult) {
  return {
    candidateCount: parsed.detectedCount,
    protocolCounts: countProtocols(parsed),
    issueCodeCounts: countIssueCodes(parsed.issues),
  }
}
