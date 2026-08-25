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

export const SHADOWROCKET_LOCAL_DEFAULT_HEALTH_URL = 'https://your-controlled-health-endpoint.example/health'
export const SHADOWROCKET_LOCAL_DEFAULT_DNS_SERVER = '192.0.2.53:53'
export const SHADOWROCKET_LOCAL_DEFAULT_ROUTING_VALUES = {
  domain: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  geoipCountry: 'US',
} as const

export interface ShadowrocketLocalRoutingValues {
  domain?: string
  ipv4?: string
  ipv6?: string
  geoipCountry?: string
}

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
  /** Supplied by the human; never persisted in tracked fixtures. */
  dnsServer?: string
  /** Supplied by the human; never persisted in tracked fixtures. */
  routing?: ShadowrocketLocalRoutingValues
}

export type ShadowrocketLocalValidation<T> = { ok: true; value: T } | { ok: false; code: string }

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

export function validateShadowrocketLocalDnsServer(value: string): ShadowrocketLocalValidation<string> {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\r\n\u0000-\u001f\u007f\s]/.test(value)) {
    return { ok: false, code: 'SHADOWROCKET_LOCAL_DNS_SERVER_INVALID' }
  }
  const separator = value.indexOf(':')
  if (separator !== -1 && separator !== value.lastIndexOf(':')) return { ok: false, code: 'SHADOWROCKET_LOCAL_DNS_SERVER_INVALID' }
  const address = separator === -1 ? value : value.slice(0, separator)
  const portText = separator === -1 ? '53' : value.slice(separator + 1)
  if (!isValidIpv4Literal(address) || !/^(?:[1-9]\d{0,4}|0)$/.test(portText)) return { ok: false, code: 'SHADOWROCKET_LOCAL_DNS_SERVER_INVALID' }
  const port = Number(portText)
  if (port < 1 || port > 65_535) return { ok: false, code: 'SHADOWROCKET_LOCAL_DNS_SERVER_INVALID' }
  return { ok: true, value: `${address}:${port}` }
}

export function validateShadowrocketLocalRoutingValues(values: ShadowrocketLocalRoutingValues): ShadowrocketLocalValidation<Required<ShadowrocketLocalRoutingValues>> {
  const domain = values.domain ?? SHADOWROCKET_LOCAL_DEFAULT_ROUTING_VALUES.domain
  const ipv4 = values.ipv4 ?? SHADOWROCKET_LOCAL_DEFAULT_ROUTING_VALUES.ipv4
  const ipv6 = values.ipv6 ?? SHADOWROCKET_LOCAL_DEFAULT_ROUTING_VALUES.ipv6
  const geoipCountry = values.geoipCountry ?? SHADOWROCKET_LOCAL_DEFAULT_ROUTING_VALUES.geoipCountry
  if (!isValidRoutingDomain(domain)) return { ok: false, code: 'SHADOWROCKET_LOCAL_ROUTING_DOMAIN_INVALID' }
  if (!isValidIpv4Literal(ipv4)) return { ok: false, code: 'SHADOWROCKET_LOCAL_ROUTING_IPV4_INVALID' }
  if (!isValidIpv6Literal(ipv6)) return { ok: false, code: 'SHADOWROCKET_LOCAL_ROUTING_IPV6_INVALID' }
  if (!/^[A-Za-z]{2}$/.test(geoipCountry) || /[\r\n\u0000-\u001f\u007f]/.test(geoipCountry)) return { ok: false, code: 'SHADOWROCKET_LOCAL_ROUTING_GEOIP_INVALID' }
  return { ok: true, value: { domain, ipv4, ipv6, geoipCountry: geoipCountry.toUpperCase() } }
}

export function localBehavioralEvidenceMode(profile: ShadowrocketLocalProfile, options: ShadowrocketLocalCompileOptions = {}): 'SYNTAX_IMPORT_ONLY' | 'HUMAN_INPUT_READY' {
  if ((profile === 'url-test' || profile === 'fallback') && options.healthUrl === undefined) return 'SYNTAX_IMPORT_ONLY'
  if (profile === 'dns-udp' && options.dnsServer === undefined) return 'SYNTAX_IMPORT_ONLY'
  if ((profile === 'routing-overlap' || profile === 'routing-inverted') && (!options.routing?.domain || !options.routing?.ipv4 || !options.routing?.ipv6 || !options.routing?.geoipCountry)) return 'SYNTAX_IMPORT_ONLY'
  return 'HUMAN_INPUT_READY'
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
  if ((profile === 'dns-system' || profile === 'dns-udp') && options.dnsServer !== undefined) {
    const dns = validateShadowrocketLocalDnsServer(options.dnsServer)
    if (!dns.ok) return blockedLocalCompilation(profile, undefined, [dns.code])
  }
  if ((profile === 'routing-overlap' || profile === 'routing-inverted') && options.routing) {
    const routing = validateShadowrocketLocalRoutingValues(options.routing)
    if (!routing.ok) return blockedLocalCompilation(profile, undefined, [routing.code])
  }
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

  const project = buildProject(profile, content, options)
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

function buildProject(profile: ShadowrocketLocalProfile, content: string | undefined, options: ShadowrocketLocalCompileOptions): ProxyFlowProject {
  if (profile === 'routing-overlap' || profile === 'routing-inverted') return buildRoutingProject(profile, options.routing)
  if (profile === 'dns-system' || profile === 'dns-udp') return buildDnsProject(profile, options.dnsServer)

  const strategy = strategyNode(profile, options.healthUrl)
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

function buildRoutingProject(profile: 'routing-overlap' | 'routing-inverted', supplied?: ShadowrocketLocalRoutingValues) {
  const routing = validateShadowrocketLocalRoutingValues(supplied ?? {})
  if (!routing.ok) throw new Error(routing.code)
  const invert = profile === 'routing-inverted'
  const values = routing.value
  const matchers: Array<{ kind: NonNullable<BlockNodeData['routeMatcherKind']>; value: string; targetKind: 'direct' | 'reject'; priority: number }> = [
    { kind: 'domain', value: values.domain, targetKind: invert ? 'direct' : 'reject', priority: invert ? 20 : 10 },
    { kind: 'domain-suffix', value: values.domain, targetKind: invert ? 'reject' : 'direct', priority: invert ? 10 : 20 },
    { kind: 'ip-cidr', value: supplied?.ipv4 ? `${values.ipv4}/32` : '192.0.2.0/24', targetKind: invert ? 'direct' : 'reject', priority: invert ? 40 : 30 },
    { kind: 'ip-cidr6', value: supplied?.ipv6 ? `${values.ipv6}/128` : '2001:db8::/32', targetKind: invert ? 'reject' : 'direct', priority: invert ? 30 : 40 },
    { kind: 'geo-ip', value: values.geoipCountry, targetKind: invert ? 'direct' : 'reject', priority: 50 },
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

function buildDnsProject(profile: 'dns-system' | 'dns-udp', suppliedServer?: string) {
  const server = suppliedServer === undefined ? SHADOWROCKET_LOCAL_DEFAULT_DNS_SERVER : validateShadowrocketLocalDnsServer(suppliedServer)
  if (typeof server !== 'string' && !server.ok) throw new Error(server.code)
  const dnsServer = typeof server === 'string' ? server : server.value
  const dnsResolvers = profile === 'dns-system'
    ? [{ id: 'system', name: 'System', kind: 'system' as const, role: 'default' as const, enabled: true }]
    : [{ id: 'udp', name: 'IPv4 UDP', kind: 'udp' as const, role: 'default' as const, address: dnsServer, enabled: true }]
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

function isValidIpv4Literal(value: string): boolean {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return false
  return value.split('.').every((part) => (part.length === 1 || part[0] !== '0') && Number(part) <= 255)
}

function isValidIpv6Literal(value: string): boolean {
  if (!value || value !== value.trim() || /[\r\n\u0000-\u001f\u007f\s.[\]"',=\\]/.test(value) || value.includes('.')) return false
  const halves = value.split('::')
  if (halves.length > 2) return false
  const count = (part: string) => part ? part.split(':').every((segment) => /^[0-9A-Fa-f]{1,4}$/.test(segment)) ? part.split(':').length : -1 : 0
  const left = count(halves[0])
  const right = count(halves.length === 2 ? halves[1] : '')
  if (left < 0 || right < 0) return false
  return halves.length === 2 ? left + right < 8 : left === 8
}

function isValidRoutingDomain(value: string): boolean {
  return typeof value === 'string'
    && value === value.trim()
    && value.length <= 253
    && /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(value)
    && !/[\r\n\u0000-\u001f\u007f,=\\"/]/.test(value)
}
