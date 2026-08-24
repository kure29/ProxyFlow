import {
  isUnmodeledProxy,
  proxyProtocolLabel,
  type ProxyFlowIR,
  type ProxySetRef,
  type ResolvedProxyEndpointIR,
  type StrategyIR,
} from '../../core/ir'
import { proxyFingerprint } from '../../core/proxy'
import {
  createMaterializationContext,
  materializeProxySet,
  type MaterializationContext,
  type MaterializationIssue,
} from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import { loonIssue } from './errors'
import { checkLoonProxy } from './proxies'

export interface LoonSkippedEndpoint {
  endpoint: ResolvedProxyEndpointIR
  issues: CompatibilityIssue[]
}

export interface LoonProxySetProjection {
  status: 'ready' | 'error'
  proxies: ResolvedProxyEndpointIR[]
  skipped: LoonSkippedEndpoint[]
  reasons: Array<{ code: string; label: string; count: number }>
  inputCount: number
  materializationIssues: MaterializationIssue[]
  endpointIssues: CompatibilityIssue[]
  duplicateEndpointIds: string[]
}

export interface LoonFixedEndpointProjection {
  candidate?: ResolvedProxyEndpointIR
  endpoint?: ResolvedProxyEndpointIR
  issues: CompatibilityIssue[]
}

export interface LoonProjectionContext {
  materialization: MaterializationContext
  proxySets: Map<string, LoonProxySetProjection>
  fixedEndpoints: Map<string, LoonFixedEndpointProjection>
  endpointDefinitions: Map<string, string>
}

export interface LoonProjectionStats {
  candidateCount: number
  compatibleEndpointCount: number
  skippedEndpointCount: number
}

export function createLoonProjectionContext(): LoonProjectionContext {
  return {
    materialization: createMaterializationContext(),
    proxySets: new Map(),
    fixedEndpoints: new Map(),
    endpointDefinitions: new Map(),
  }
}

export function projectLoonProxySet(ir: ProxyFlowIR, ref: ProxySetRef, context: LoonProjectionContext): LoonProxySetProjection {
  const key = `${ref.kind}:${ref.id}`
  const cached = context.proxySets.get(key)
  if (cached) return cached
  const materialized = materializeProxySet(ir, ref, context.materialization)
  if (materialized.status === 'error') {
    const failed: LoonProxySetProjection = {
      status: 'error', proxies: [], skipped: [], reasons: [], inputCount: 0,
      materializationIssues: materialized.issues, endpointIssues: [], duplicateEndpointIds: [],
    }
    context.proxySets.set(key, failed)
    return failed
  }

  const proxies: ResolvedProxyEndpointIR[] = []
  const skipped: LoonSkippedEndpoint[] = []
  const endpointIssues: CompatibilityIssue[] = []
  const duplicateEndpointIds = new Set<string>()
  for (const endpoint of materialized.proxies) {
    const checked = checkLoonProxy(endpoint, ref.id)
    if (checked.some((issue) => issue.severity === 'error')) skipped.push({ endpoint, issues: checked })
    else {
      proxies.push(endpoint)
      endpointIssues.push(...checked)
      const signature = loonProjectionEndpointKey(endpoint)
      const existing = context.endpointDefinitions.get(endpoint.id)
      if (existing && existing !== signature) duplicateEndpointIds.add(endpoint.id)
      else context.endpointDefinitions.set(endpoint.id, signature)
    }
  }
  const projected: LoonProxySetProjection = {
    status: 'ready', proxies, skipped,
    reasons: aggregateSkipReasons(skipped), inputCount: materialized.proxies.length,
    materializationIssues: materialized.issues, endpointIssues,
    duplicateEndpointIds: [...duplicateEndpointIds].sort(),
  }
  context.proxySets.set(key, projected)
  return projected
}

export function loonProxySetProjectionIssues(
  projections: readonly LoonProxySetProjection[], strategy: StrategyIR,
): CompatibilityIssue[] {
  const unique = [...new Set(projections)]
  const issues = unique.flatMap((projection) => projection.materializationIssues.map((issue) => loonIssue(
    `LOON_${issue.code}`, issue.severity, 'strategy', issue.message, issue.entityId ?? strategy.id,
  )))
  issues.push(...unique.flatMap((projection) => projection.endpointIssues))
  for (const id of new Set(unique.flatMap((projection) => projection.duplicateEndpointIds))) issues.push(loonIssue(
    'LOON_PROXY_ID_DUPLICATE', 'error', 'proxy', `Proxy endpoint id "${id}" resolves to more than one emitted Loon endpoint.`, strategy.id,
  ))

  const compatibleIds = new Set(unique.flatMap((projection) => projection.proxies.map(loonProjectionEndpointKey)))
  const skippedById = new Map(unique.flatMap((projection) => projection.skipped.map((item) => [loonProjectionEndpointKey(item.endpoint), item] as const)))
  const skipped = [...skippedById.values()]
  if (skipped.length > 0) {
    const summary = aggregateSkipReasons(skipped).map((reason) => `${reason.label}: ${reason.count}`).join(', ')
    issues.push(loonIssue(
      'LOON_PROXY_SET_ENDPOINTS_SKIPPED', 'warning', 'strategy',
      `Loon can use ${compatibleIds.size} of ${compatibleIds.size + skipped.length} candidates in strategy "${strategy.name}". ${skipped.length} incompatible endpoint${skipped.length === 1 ? ' was' : 's were'} skipped${summary ? ` (${summary})` : ''}.`,
      strategy.id,
    ))
  }
  return issues
}

export function loonStrategyNoMemberIssue(strategy: StrategyIR, projections: readonly LoonProxySetProjection[]): CompatibilityIssue | undefined {
  if (projections.some((projection) => projection.status === 'error')) return undefined
  const inputCount = new Set(projections.flatMap((projection) => [
    ...projection.proxies.map(loonProjectionEndpointKey),
    ...projection.skipped.map(({ endpoint }) => loonProjectionEndpointKey(endpoint)),
  ])).size
  return loonIssue(
    'LOON_STRATEGY_NO_COMPATIBLE_MEMBERS', 'error', 'strategy',
    inputCount > 0
      ? `Strategy "${strategy.name}" has ${inputCount} materialized candidate${inputCount === 1 ? '' : 's'}, but none can be represented by Loon.`
      : `Strategy "${strategy.name}" has no materialized policy members.`,
    strategy.id,
  )
}

export function projectLoonFixedEndpoint(
  ir: ProxyFlowIR,
  strategy: Extract<StrategyIR, { kind: 'fixed' }>,
  context: LoonProjectionContext,
): LoonFixedEndpointProjection {
  const cached = context.fixedEndpoints.get(strategy.id)
  if (cached) return cached
  const matches = strategy.proxyId
    ? ir.sources.flatMap((source) => source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies
      ? (source.proxies ?? []).filter((endpoint) => endpoint.id === strategy.proxyId)
      : [])
    : []
  const issues: CompatibilityIssue[] = []
  if (matches.length > 1) issues.push(loonIssue(
    'LOON_PROXY_ID_DUPLICATE', 'error', 'proxy', `Fixed strategy "${strategy.name}" resolves proxy id "${strategy.proxyId}" more than once.`, strategy.id,
  ))
  const endpoint = matches[0]
  if (!endpoint || isUnmodeledProxy(endpoint)) {
    issues.push(loonIssue('LOON_FIXED_PROXY_UNRESOLVED', 'error', 'strategy', `Fixed strategy "${strategy.name}" does not resolve to a modeled proxy endpoint.`, strategy.id))
    const unresolved = { issues }
    context.fixedEndpoints.set(strategy.id, unresolved)
    return unresolved
  }
  issues.push(...checkLoonProxy(endpoint, endpoint.id))
  const projected = {
    candidate: endpoint,
    ...(issues.some((issue) => issue.severity === 'error') ? {} : { endpoint }),
    issues,
  }
  context.fixedEndpoints.set(strategy.id, projected)
  return projected
}

export function loonProjectionStats(context: LoonProjectionContext): LoonProjectionStats {
  const candidates = new Set<string>()
  const compatible = new Set<string>()
  const skipped = new Set<string>()
  for (const projection of context.proxySets.values()) {
    for (const endpoint of projection.proxies) { const key = loonProjectionEndpointKey(endpoint); candidates.add(key); compatible.add(key) }
    for (const { endpoint } of projection.skipped) { const key = loonProjectionEndpointKey(endpoint); candidates.add(key); skipped.add(key) }
  }
  for (const projection of context.fixedEndpoints.values()) {
    if (projection.candidate) candidates.add(loonProjectionEndpointKey(projection.candidate))
    if (projection.endpoint) compatible.add(loonProjectionEndpointKey(projection.endpoint))
  }
  return { candidateCount: candidates.size, compatibleEndpointCount: compatible.size, skippedEndpointCount: skipped.size }
}

export function loonProjectionEndpointKey(endpoint: ResolvedProxyEndpointIR) {
  return `${endpoint.id}\u0000${endpoint.name}\u0000${proxyFingerprint(endpoint)}`
}

function aggregateSkipReasons(skipped: LoonSkippedEndpoint[]): Array<{ code: string; label: string; count: number }> {
  const counts = new Map<string, { code: string; label: string; count: number }>()
  for (const item of skipped) {
    const issue = primarySkipIssue(item.issues)
    const code = issue?.code ?? 'LOON_PROXY_VARIANT_UNSUPPORTED'
    const label = code === 'LOON_PROXY_PROTOCOL_UNSUPPORTED' ? proxyProtocolLabel(item.endpoint.protocol)
      : code === 'LOON_PROXY_CIPHER_UNSUPPORTED' ? 'proxy cipher'
        : code === 'LOON_PROXY_TRANSPORT_UNSUPPORTED' ? 'transport' : 'endpoint variant'
    const key = `${code}\u0000${label}`
    const existing = counts.get(key)
    if (existing) existing.count += 1
    else counts.set(key, { code, label, count: 1 })
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label) || left.code.localeCompare(right.code))
}

function primarySkipIssue(issues: CompatibilityIssue[]) {
  const priority = ['LOON_PROXY_PROTOCOL_UNSUPPORTED', 'LOON_PROXY_CIPHER_UNSUPPORTED', 'LOON_PROXY_TRANSPORT_UNSUPPORTED', 'LOON_PROXY_VARIANT_UNSUPPORTED']
  return priority.map((code) => issues.find((issue) => issue.code === code)).find(Boolean)
    ?? issues.find((issue) => issue.severity === 'error')
}
