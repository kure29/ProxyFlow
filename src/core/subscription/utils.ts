import { detectRegion, makeProxyId, stableOpaqueHash, type ProxyCompatibilityHint, type ResolvedProxyEndpointIR } from '../proxy'
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
  const endpoint = {
    ...identity,
    id: makeProxyId(context.sourceId, identity),
    metadata: {
      sourceId: context.sourceId,
      sourceName: context.sourceName,
      region: detectRegion(draft.name),
      ...(compatibility ? { compatibility } : {}),
    },
  } as ResolvedProxyEndpointIR
  const status = compatibility?.status === 'partial' || issues.some((issue) => issue.severity === 'warning') ? 'partial' : 'ready'
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
  if (kind === 'ws') return { transport: { kind: 'ws' as const, ...(params.get('path') ? { path: params.get('path')! } : {}), ...(params.get('host') ? { host: params.get('host')! } : {}) } }
  if (kind === 'http' || kind === 'h2') return { transport: { kind: 'http' as const, ...(params.get('path') ? { path: params.get('path')! } : {}), ...(params.get('host') ? { host: params.get('host')! } : {}) } }
  if (kind === 'grpc') return { transport: { kind: 'grpc' as const, ...(params.get('serviceName') || params.get('service-name') ? { serviceName: params.get('serviceName') ?? params.get('service-name')! } : {}) } }
  return { transport: undefined, unsupported: `transport:${kind}` }
}

export function duplicateParamNames(params: URLSearchParams): string[] {
  const counts = new Map<string, number>()
  for (const [key] of params) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts].filter(([, count]) => count > 1).map(([key]) => key).sort()
}
