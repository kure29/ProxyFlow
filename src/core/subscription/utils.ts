import { detectRegion, makeProxyId, stableOpaqueHash, validateProxyEndpointSemantics, type ProxyCompatibilityHint, type ResolvedProxyEndpointIR } from '../proxy'
import { subscriptionIssue } from './errors'
import type { ParsedSubscriptionNode, ProxyEndpointDraft, SubscriptionIssue } from './types'

export interface ProtocolParseContext {
  sourceId: string
  sourceName: string
  line?: number
}

export interface ParsedProtocolResult {
  node: ParsedSubscriptionNode
  issues: SubscriptionIssue[]
}

export function finalizeEndpoint(
  draft: ProxyEndpointDraft,
  context: ProtocolParseContext,
  issues: SubscriptionIssue[] = [],
  compatibility?: ProxyCompatibilityHint,
): ParsedProtocolResult {
  const identity = { ...draft } as ProxyEndpointDraft
  const endpointWithoutCompatibility = {
    ...identity,
    id: makeProxyId(context.sourceId, identity),
    metadata: {
      sourceId: context.sourceId,
      sourceName: context.sourceName,
      region: detectRegion(draft.name),
    },
  } as ResolvedProxyEndpointIR
  const mergedCompatibility = mergeEndpointSemanticCompatibility(endpointWithoutCompatibility, compatibility, issues, {
    nodeName: draft.name,
    line: context.line,
  })
  const endpoint = {
    ...endpointWithoutCompatibility,
    metadata: {
      ...endpointWithoutCompatibility.metadata,
      ...(mergedCompatibility ? { compatibility: mergedCompatibility } : {}),
    },
  } as ResolvedProxyEndpointIR
  const status = mergedCompatibility?.status === 'partial' ? 'partial' : 'ready'
  return {
    node: {
      id: endpoint.id,
      name: endpoint.name,
      protocol: endpoint.protocol,
      server: endpoint.server,
      port: endpoint.port,
      sourceId: context.sourceId,
      sourceName: context.sourceName,
      status,
      endpoint,
      issues,
    },
    issues,
  }
}

export function mergeEndpointSemanticCompatibility(
  endpoint: ResolvedProxyEndpointIR,
  compatibility: ProxyCompatibilityHint | undefined,
  issues: SubscriptionIssue[],
  location: { nodeName: string; line?: number },
): ProxyCompatibilityHint | undefined {
  const semanticIssues = validateProxyEndpointSemantics(endpoint)
  for (const semantic of semanticIssues) {
    if (!issues.some((issue) => issue.code === semantic.code)) issues.push(subscriptionIssue(
      semantic.code,
      'warning',
      semantic.message,
      location,
    ))
  }
  const unsupportedFeatures = unique([
    ...(compatibility?.unsupportedFeatures ?? []),
    ...semanticIssues.map((issue) => issue.feature),
  ])
  const unrecognizedParams = compatibility?.unrecognizedParams?.length
    ? unique(compatibility.unrecognizedParams)
    : undefined
  if (!unsupportedFeatures.length && !unrecognizedParams?.length) return undefined
  return {
    status: unsupportedFeatures.length || compatibility?.status === 'partial' ? 'partial' : 'ready',
    ...(unsupportedFeatures.length ? { unsupportedFeatures } : {}),
    ...(unrecognizedParams?.length ? { unrecognizedParams } : {}),
  }
}

export function unsupportedNode(
  protocol: string,
  name: string,
  context: ProtocolParseContext,
  issue: SubscriptionIssue,
): ParsedProtocolResult {
  return {
    node: {
      id: `unsupported-${stableOpaqueHash(`${context.sourceId}\u0000${protocol}\u0000${name}\u0000${context.line ?? 0}`)}`,
      name,
      protocol,
      sourceId: context.sourceId,
      sourceName: context.sourceName,
      status: 'unsupported',
      issues: [issue],
    },
    issues: [issue],
  }
}

export function safeDecode(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}

export function validPort(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 1 && number <= 65_535 ? number : undefined
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return undefined
}

export function parseTransport(params: URLSearchParams) {
  const kind = (params.get('type') ?? params.get('network') ?? 'tcp').toLocaleLowerCase()
  if (kind === 'tcp') return { transport: { kind: 'tcp' as const } }
  if (kind === 'ws') {
    const earlyDataValue = params.get('ed') ?? params.get('max-early-data')
    const maxEarlyData = nonNegativeInteger(earlyDataValue)
    return { transport: {
      kind: 'ws' as const,
      ...(params.get('path') ? { path: params.get('path')! } : {}),
      ...(params.get('host') ? { host: params.get('host')! } : {}),
      ...(maxEarlyData !== undefined ? { maxEarlyData } : {}),
      ...(params.get('eh') || params.get('early-data-header-name') ? { earlyDataHeaderName: params.get('eh') ?? params.get('early-data-header-name')! } : {}),
    }, ...(earlyDataValue !== null && maxEarlyData === undefined ? { unsupported: 'ws-early-data:invalid' } : {}) }
  }
  if (kind === 'http' || kind === 'h2') return { transport: { kind: 'http' as const, variant: kind as 'http' | 'h2', ...(params.get('path') ? { path: params.get('path')! } : {}), ...(params.get('host') ? { host: params.get('host')! } : {}) } }
  if (kind === 'grpc') return { transport: { kind: 'grpc' as const, ...(params.get('serviceName') || params.get('service-name') ? { serviceName: params.get('serviceName') ?? params.get('service-name')! } : {}) } }
  if (kind === 'httpupgrade') return { transport: { kind: 'httpupgrade' as const, ...(params.get('path') ? { path: params.get('path')! } : {}), ...(params.get('host') ? { host: params.get('host')! } : {}) } }
  if (kind === 'xhttp') {
    const mode = params.get('mode')?.toLocaleLowerCase()
    const supportedMode: 'auto' | 'stream-one' | 'stream-up' | 'packet-up' | undefined = mode === 'auto' || mode === 'stream-one' || mode === 'stream-up' || mode === 'packet-up' ? mode : undefined
    return {
      transport: { kind: 'xhttp' as const, ...(params.get('path') ? { path: params.get('path')! } : {}), ...(params.get('host') ? { host: params.get('host')! } : {}), ...(supportedMode ? { mode: supportedMode } : {}) },
      ...(mode && !supportedMode ? { unsupported: `xhttp-mode:${mode}` } : {}),
    }
  }
  return { transport: undefined, unsupported: `transport:${kind}` }
}

function nonNegativeInteger(value: string | null) {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined
  const number = Number(value.trim())
  return Number.isSafeInteger(number) ? number : undefined
}

export function duplicateParamNames(params: URLSearchParams): string[] {
  const counts = new Map<string, number>()
  for (const [key] of params) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts].filter(([, count]) => count > 1).map(([key]) => key).sort()
}

export interface ConnectionCriticalParamGroup {
  feature: string
  names: string[]
  caseInsensitive?: boolean
}

export function conflictingParamGroups(params: URLSearchParams, groups: ConnectionCriticalParamGroup[]): string[] {
  return groups.flatMap((group) => {
    const values = group.names.flatMap((name) => params.getAll(name)).map((value) => value.trim())
    const normalized = values.map((value) => group.caseInsensitive ? value.toLocaleLowerCase() : value)
    return new Set(normalized).size > 1 ? [group.feature] : []
  })
}

const unique = <T>(values: T[]) => [...new Set(values)]
