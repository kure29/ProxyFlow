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
import { surgeIssue } from './errors'
import { checkSurgeProxy } from './proxies'

export interface SurgeSkippedEndpoint {
  endpoint: ResolvedProxyEndpointIR
  issues: CompatibilityIssue[]
}

export interface SurgeProjectionReason {
  code: string
  label: string
  count: number
}

export interface SurgeProxySetProjection {
  status: 'ready' | 'error'
  proxies: ResolvedProxyEndpointIR[]
  skipped: SurgeSkippedEndpoint[]
  reasons: SurgeProjectionReason[]
  inputCount: number
  materializationIssues: MaterializationIssue[]
  endpointIssues: CompatibilityIssue[]
  duplicateEndpointIds: string[]
}

export interface SurgeProjectionContext {
  materialization: MaterializationContext
  proxySets: Map<string, SurgeProxySetProjection>
  fixedEndpoints: Map<string, SurgeFixedEndpointProjection>
  endpointDefinitions: Map<string, string>
}

export interface SurgeFixedEndpointProjection {
  candidate?: ResolvedProxyEndpointIR
  endpoint?: ResolvedProxyEndpointIR
  issues: CompatibilityIssue[]
}

export interface SurgeProjectionStats {
  candidateCount: number
  compatibleEndpointCount: number
  skippedEndpointCount: number
}

export function createSurgeProjectionContext(): SurgeProjectionContext {
  return {
    materialization: createMaterializationContext(),
    proxySets: new Map(),
    fixedEndpoints: new Map(),
    endpointDefinitions: new Map(),
  }
}

export function projectSurgeProxySet(
  ir: ProxyFlowIR,
  ref: ProxySetRef,
  context: SurgeProjectionContext,
): SurgeProxySetProjection {
  const key = `${ref.kind}:${ref.id}`
  const cached = context.proxySets.get(key)
  if (cached) return cached

  const materialized = materializeProxySet(ir, ref, context.materialization)
  if (materialized.status === 'error') {
    const failed: SurgeProxySetProjection = {
      status: 'error', proxies: [], skipped: [], reasons: [], inputCount: 0,
      materializationIssues: materialized.issues, endpointIssues: [], duplicateEndpointIds: [],
    }
    context.proxySets.set(key, failed)
    return failed
  }

  const proxies: ResolvedProxyEndpointIR[] = []
  const skipped: SurgeSkippedEndpoint[] = []
  const endpointIssues: CompatibilityIssue[] = []
  const duplicateEndpointIds = new Set<string>()
  for (const endpoint of materialized.proxies) {
    const checked = checkSurgeProxy(endpoint, ref.id)
    if (checked.some((issue) => issue.severity === 'error')) skipped.push({ endpoint, issues: checked })
    else {
      proxies.push(endpoint)
      endpointIssues.push(...checked)
      const signature = surgeProjectionEndpointKey(endpoint)
      const existing = context.endpointDefinitions.get(endpoint.id)
      if (existing && existing !== signature) duplicateEndpointIds.add(endpoint.id)
      else context.endpointDefinitions.set(endpoint.id, signature)
    }
  }

  const projected: SurgeProxySetProjection = {
    status: 'ready',
    proxies,
    skipped,
    reasons: aggregateSkipReasons(skipped),
    inputCount: materialized.proxies.length,
    materializationIssues: materialized.issues,
    endpointIssues,
    duplicateEndpointIds: [...duplicateEndpointIds].sort(),
  }
  context.proxySets.set(key, projected)
  return projected
}

export function surgeProxySetProjectionIssues(
  projections: readonly SurgeProxySetProjection[],
  strategy: StrategyIR,
): CompatibilityIssue[] {
  const uniqueProjections = [...new Set(projections)]
  const issues = uniqueProjections.flatMap((projection) => projection.materializationIssues.map((issue) => surgeIssue(
    `SURGE_${issue.code}`, issue.severity, 'strategy', issue.message, issue.entityId ?? strategy.id,
  )))
  issues.push(...uniqueProjections.flatMap((projection) => projection.endpointIssues))
  for (const id of new Set(uniqueProjections.flatMap((projection) => projection.duplicateEndpointIds))) issues.push(surgeIssue(
    'SURGE_PROXY_ID_DUPLICATE', 'error', 'proxy',
    `Proxy endpoint id “${id}” resolves to more than one emitted endpoint.`, strategy.id,
  ))

  const compatibleIds = new Set(uniqueProjections.flatMap((projection) => projection.proxies.map(surgeProjectionEndpointKey)))
  const skippedById = new Map(uniqueProjections.flatMap((projection) => projection.skipped.map((item) => [surgeProjectionEndpointKey(item.endpoint), item] as const)))
  const candidateIds = new Set([...compatibleIds, ...skippedById.keys()])
  const skipped = [...skippedById.values()]
  if (skipped.length > 0) {
    const reasonSummary = aggregateSkipReasons(skipped).map((reason) => `${reason.label}: ${reason.count}`).join(', ')
    issues.push(surgeIssue(
      'SURGE_PROXY_SET_ENDPOINTS_SKIPPED',
      'warning',
      'strategy',
      `Surge can use ${compatibleIds.size} of ${candidateIds.size} candidates in strategy “${strategy.name}”. ${skipped.length} incompatible endpoint${skipped.length === 1 ? ' was' : 's were'} skipped${reasonSummary ? ` (${reasonSummary})` : ''}.`,
      strategy.id,
    ))
  }
  return issues
}

export function surgeStrategyNoMemberIssue(
  strategy: StrategyIR,
  projections: readonly SurgeProxySetProjection[],
): CompatibilityIssue | undefined {
  if (projections.some((projection) => projection.status === 'error')) return undefined
  const inputCount = new Set(projections.flatMap((projection) => [
    ...projection.proxies.map(surgeProjectionEndpointKey),
    ...projection.skipped.map(({ endpoint }) => surgeProjectionEndpointKey(endpoint)),
  ])).size
  if (inputCount > 0) return surgeIssue(
    'SURGE_STRATEGY_NO_COMPATIBLE_MEMBERS',
    'error',
    'strategy',
    `Strategy “${strategy.name}” has ${inputCount} materialized candidate${inputCount === 1 ? '' : 's'}, but none can be represented by Surge.`,
    strategy.id,
  )
  return surgeIssue(
    'SURGE_STRATEGY_EMPTY', 'error', 'strategy', `Strategy “${strategy.name}” has no materialized policy members.`, strategy.id,
  )
}

export function projectSurgeFixedEndpoint(
  ir: ProxyFlowIR,
  strategy: Extract<StrategyIR, { kind: 'fixed' }>,
  context: SurgeProjectionContext,
): SurgeFixedEndpointProjection {
  const cached = context.fixedEndpoints.get(strategy.id)
  if (cached) return cached
  const matches = strategy.proxyId
    ? ir.sources.flatMap((source) => source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies
      ? (source.proxies ?? []).filter((endpoint) => endpoint.id === strategy.proxyId)
      : [])
    : []
  const issues: CompatibilityIssue[] = []
  if (matches.length > 1) issues.push(surgeIssue(
    'SURGE_PROXY_ID_DUPLICATE', 'error', 'proxy',
    `Fixed strategy “${strategy.name}” resolves proxy id “${strategy.proxyId}” to more than one endpoint.`, strategy.id,
  ))
  const endpoint = matches[0]
  if (!endpoint || isUnmodeledProxy(endpoint)) {
    issues.push(surgeIssue(
      'SURGE_FIXED_PROXY_UNRESOLVED', 'error', 'strategy',
      `Fixed strategy “${strategy.name}” does not resolve to a modeled proxy endpoint.`, strategy.id,
    ))
    const unresolved = { issues }
    context.fixedEndpoints.set(strategy.id, unresolved)
    return unresolved
  }
  issues.push(...checkSurgeProxy(endpoint, endpoint.id))
  const projected = {
    candidate: endpoint,
    ...(issues.some((issue) => issue.severity === 'error') ? {} : { endpoint }),
    issues,
  }
  context.fixedEndpoints.set(strategy.id, projected)
  return projected
}

export function surgeProjectionStats(context: SurgeProjectionContext): SurgeProjectionStats {
  const candidateIds = new Set<string>()
  const compatibleIds = new Set<string>()
  const skippedIds = new Set<string>()
  for (const projection of context.proxySets.values()) {
    for (const endpoint of projection.proxies) {
      const key = surgeProjectionEndpointKey(endpoint)
      candidateIds.add(key)
      compatibleIds.add(key)
    }
    for (const { endpoint } of projection.skipped) {
      const key = surgeProjectionEndpointKey(endpoint)
      candidateIds.add(key)
      skippedIds.add(key)
    }
  }
  for (const projection of context.fixedEndpoints.values()) {
    if (projection.candidate) candidateIds.add(surgeProjectionEndpointKey(projection.candidate))
    if (projection.endpoint) compatibleIds.add(surgeProjectionEndpointKey(projection.endpoint))
  }
  return {
    candidateCount: candidateIds.size,
    compatibleEndpointCount: compatibleIds.size,
    skippedEndpointCount: skippedIds.size,
  }
}

export function surgeProjectionEndpointKey(endpoint: ResolvedProxyEndpointIR) {
  return `${endpoint.id}\u0000${endpoint.name}\u0000${proxyFingerprint(endpoint)}`
}

function aggregateSkipReasons(skipped: SurgeSkippedEndpoint[]): SurgeProjectionReason[] {
  const counts = new Map<string, SurgeProjectionReason>()
  for (const item of skipped) {
    const issue = primarySkipIssue(item.issues)
    const code = issue?.code ?? 'SURGE_PROXY_VARIANT_UNSUPPORTED'
    const label = skipReasonLabel(item.endpoint, code)
    const key = `${code}\u0000${label}`
    const existing = counts.get(key)
    if (existing) existing.count += 1
    else counts.set(key, { code, label, count: 1 })
  }
  return [...counts.values()].sort((left, right) => right.count - left.count
    || left.label.localeCompare(right.label) || left.code.localeCompare(right.code))
}

function primarySkipIssue(issues: CompatibilityIssue[]) {
  const priority = [
    'SURGE_PROXY_PROTOCOL_UNSUPPORTED',
    'SURGE_SHADOWSOCKS_PLUGIN_UNSUPPORTED',
    'SURGE_PROXY_TRANSPORT_UNSUPPORTED',
    'SURGE_PROXY_VARIANT_UNSUPPORTED',
  ]
  return priority.flatMap((code) => issues.find((issue) => issue.code === code) ?? []).at(0)
    ?? issues.find((issue) => issue.severity === 'error')
}

function skipReasonLabel(endpoint: ResolvedProxyEndpointIR, code: string) {
  if (code === 'SURGE_PROXY_PROTOCOL_UNSUPPORTED') return proxyProtocolLabel(endpoint.protocol)
  if (code === 'SURGE_SHADOWSOCKS_PLUGIN_UNSUPPORTED') return 'Shadowsocks plugin'
  if (code === 'SURGE_PROXY_TRANSPORT_UNSUPPORTED') return 'transport'
  if (code === 'SURGE_PROXY_VARIANT_UNSUPPORTED') return 'endpoint variant'
  return code.replace(/^SURGE_/, '').toLowerCase().replaceAll('_', ' ')
}
