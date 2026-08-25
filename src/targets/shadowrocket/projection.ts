import { isUnmodeledProxy, type ProxyFlowIR, type ProxySetRef, type ResolvedProxyEndpointIR, type StrategyIR } from '../../core/ir'
import { proxyFingerprint } from '../../core/proxy'
import { createMaterializationContext, materializeProxySet, type MaterializationContext, type MaterializationIssue } from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import { shadowrocketIssue } from './errors'
import { checkShadowrocketProxy } from './proxies'

export interface ShadowrocketSkippedEndpoint { endpoint: ResolvedProxyEndpointIR; issues: CompatibilityIssue[] }
export interface ShadowrocketProxySetProjection {
  status: 'ready' | 'error'
  proxies: ResolvedProxyEndpointIR[]
  skipped: ShadowrocketSkippedEndpoint[]
  inputCount: number
  materializationIssues: MaterializationIssue[]
  endpointIssues: CompatibilityIssue[]
  duplicateEndpointIds: string[]
}
export interface ShadowrocketFixedEndpointProjection { candidate?: ResolvedProxyEndpointIR; endpoint?: ResolvedProxyEndpointIR; issues: CompatibilityIssue[] }
export interface ShadowrocketProjectionContext {
  materialization: MaterializationContext
  proxySets: Map<string, ShadowrocketProxySetProjection>
  fixedEndpoints: Map<string, ShadowrocketFixedEndpointProjection>
  endpointDefinitions: Map<string, string>
}
export function createShadowrocketProjectionContext(): ShadowrocketProjectionContext { return { materialization: createMaterializationContext(), proxySets: new Map(), fixedEndpoints: new Map(), endpointDefinitions: new Map() } }

export function projectShadowrocketProxySet(ir: ProxyFlowIR, ref: ProxySetRef, context: ShadowrocketProjectionContext): ShadowrocketProxySetProjection {
  const key = `${ref.kind}:${ref.id}`
  const cached = context.proxySets.get(key)
  if (cached) return cached
  const materialized = materializeProxySet(ir, ref, context.materialization)
  if (materialized.status === 'error') {
    const failed = { status: 'error' as const, proxies: [], skipped: [], inputCount: 0, materializationIssues: materialized.issues, endpointIssues: [], duplicateEndpointIds: [] }
    context.proxySets.set(key, failed)
    return failed
  }
  const proxies: ResolvedProxyEndpointIR[] = []
  const skipped: ShadowrocketSkippedEndpoint[] = []
  const endpointIssues: CompatibilityIssue[] = []
  const duplicateEndpointIds = new Set<string>()
  for (const endpoint of materialized.proxies) {
    const issues = checkShadowrocketProxy(endpoint, ref.id)
    if (issues.some((issue) => issue.severity === 'error')) skipped.push({ endpoint, issues })
    else {
      proxies.push(endpoint)
      endpointIssues.push(...issues)
      const signature = projectionEndpointKey(endpoint)
      const previous = context.endpointDefinitions.get(endpoint.id)
      if (previous && previous !== signature) duplicateEndpointIds.add(endpoint.id)
      else context.endpointDefinitions.set(endpoint.id, signature)
    }
  }
  const projected = { status: 'ready' as const, proxies, skipped, inputCount: materialized.proxies.length, materializationIssues: materialized.issues, endpointIssues, duplicateEndpointIds: [...duplicateEndpointIds].sort() }
  context.proxySets.set(key, projected)
  return projected
}

export function shadowrocketProxySetProjectionIssues(projections: readonly ShadowrocketProxySetProjection[], strategy: StrategyIR): CompatibilityIssue[] {
  const unique = [...new Set(projections)]
  const issues = unique.flatMap((projection) => projection.materializationIssues.map((issue) => shadowrocketIssue(`SHADOWROCKET_${issue.code}`, issue.severity, 'strategy', issue.message, issue.entityId ?? strategy.id)))
  issues.push(...unique.flatMap((projection) => projection.endpointIssues))
  // Retain each rejected endpoint's target-local blocker. The aggregate skip
  // warning is useful UX, but it must never turn an active source with one
  // compatible member into a silently downgraded successful export.
  issues.push(...unique.flatMap((projection) => projection.skipped.flatMap(({ issues: endpointIssues }) => endpointIssues)))
  for (const id of new Set(unique.flatMap((projection) => projection.duplicateEndpointIds))) issues.push(shadowrocketIssue('SHADOWROCKET_PROXY_ID_DUPLICATE', 'error', 'proxy', `Proxy endpoint id "${id}" resolves to more than one emitted endpoint.`, strategy.id))
  const skipped = unique.flatMap((projection) => projection.skipped)
  if (skipped.length) issues.push(shadowrocketIssue('SHADOWROCKET_PROXY_SET_ENDPOINTS_SKIPPED', 'warning', 'strategy', `Shadowrocket skipped ${skipped.length} endpoint${skipped.length === 1 ? '' : 's'} that are outside the audited subset for strategy "${strategy.name}".`, strategy.id))
  return issues
}

export function shadowrocketStrategyNoMemberIssue(strategy: StrategyIR, projections: readonly ShadowrocketProxySetProjection[]) {
  const inputCount = new Set(projections.flatMap((projection) => [...projection.proxies, ...projection.skipped.map(({ endpoint }) => endpoint)].map(projectionEndpointKey))).size
  return shadowrocketIssue('SHADOWROCKET_STRATEGY_NO_COMPATIBLE_MEMBERS', 'error', 'strategy', inputCount ? `Strategy "${strategy.name}" has no compatible Shadowrocket members.` : `Strategy "${strategy.name}" has no materialized policy members.`, strategy.id)
}

export function projectShadowrocketFixedEndpoint(ir: ProxyFlowIR, strategy: Extract<StrategyIR, { kind: 'fixed' }>, context: ShadowrocketProjectionContext): ShadowrocketFixedEndpointProjection {
  const cached = context.fixedEndpoints.get(strategy.id)
  if (cached) return cached
  const matches = strategy.proxyId ? ir.sources.flatMap((source) => source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies ? (source.proxies ?? []).filter((endpoint) => endpoint.id === strategy.proxyId) : []) : []
  const issues: CompatibilityIssue[] = []
  if (matches.length > 1) issues.push(shadowrocketIssue('SHADOWROCKET_PROXY_ID_DUPLICATE', 'error', 'proxy', `Fixed strategy "${strategy.name}" resolves duplicate proxy id "${strategy.proxyId}".`, strategy.id))
  const endpoint = matches[0]
  const candidate = endpoint && !isUnmodeledProxy(endpoint) ? endpoint : undefined
  if (!candidate) issues.push(shadowrocketIssue('SHADOWROCKET_FIXED_PROXY_UNRESOLVED', 'error', 'strategy', `Fixed strategy "${strategy.name}" does not resolve to a modeled proxy endpoint.`, strategy.id))
  else issues.push(...checkShadowrocketProxy(candidate, candidate.id))
  const result: ShadowrocketFixedEndpointProjection = { candidate, ...(candidate && !issues.some((issue) => issue.severity === 'error') ? { endpoint: candidate } : {}), issues }
  context.fixedEndpoints.set(strategy.id, result)
  return result
}

export function shadowrocketProjectionStats(context: ShadowrocketProjectionContext) {
  const candidates = new Set<string>(), compatible = new Set<string>(), skipped = new Set<string>()
  for (const projection of context.proxySets.values()) { for (const endpoint of projection.proxies) { const key = projectionEndpointKey(endpoint); candidates.add(key); compatible.add(key) }; for (const { endpoint } of projection.skipped) { const key = projectionEndpointKey(endpoint); candidates.add(key); skipped.add(key) } }
  for (const projection of context.fixedEndpoints.values()) { if (projection.candidate) candidates.add(projectionEndpointKey(projection.candidate)); if (projection.endpoint) compatible.add(projectionEndpointKey(projection.endpoint)) }
  return { candidateCount: candidates.size, compatibleEndpointCount: compatible.size, skippedEndpointCount: skipped.size }
}
export function projectionEndpointKey(endpoint: ResolvedProxyEndpointIR) {
  const runtimeEndpoint = endpoint as unknown as { id?: unknown; name?: unknown; protocol?: unknown; server?: unknown; port?: unknown }
  let fingerprint: string
  try { fingerprint = proxyFingerprint(endpoint) }
  catch {
    fingerprint = JSON.stringify([runtimeEndpoint.protocol, runtimeEndpoint.server, runtimeEndpoint.port, runtimeEndpoint.id, runtimeEndpoint.name]) ?? String(runtimeEndpoint.protocol)
  }
  return `${String(runtimeEndpoint.id)}\u0000${String(runtimeEndpoint.name)}\u0000${fingerprint}`
}
