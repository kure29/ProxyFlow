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
import type {
  TargetProjectionReason,
  TargetProjectionStatus,
  TargetProjectionSummary,
  TargetStrategyProjectionSummary,
} from '../../core/compiler/compilerTypes'
import { surgeIssue } from './errors'
import { checkSurgeProxy } from './proxies'

export interface SurgeSkippedEndpoint {
  endpoint: ResolvedProxyEndpointIR
  issues: CompatibilityIssue[]
}

export type SurgeProjectionReason = TargetProjectionReason

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

export function createSurgeTargetProjectionSummary(
  ir: ProxyFlowIR,
  context: SurgeProjectionContext,
  issues: readonly CompatibilityIssue[] = [],
): TargetProjectionSummary {
  const stats = surgeProjectionStats(context)
  const strategies = ir.strategies
    .filter((strategy) => strategy.kind !== 'chain')
    .map((strategy) => summarizeSurgeStrategyProjection(strategy, context, issues))
  const reasons = aggregateSurgeSkipReasons([...context.proxySets.values()].flatMap((projection) => projection.skipped))
  const blockingCount = issues.filter((issue) => issue.severity === 'error').length
  return {
    target: 'surge',
    candidateCount: stats.candidateCount,
    compatibleCount: stats.compatibleEndpointCount,
    skippedCount: stats.skippedEndpointCount,
    blockingCount,
    status: projectionStatus(stats.candidateCount, stats.compatibleEndpointCount, blockingCount),
    reasons,
    strategies,
  }
}

function summarizeSurgeStrategyProjection(
  strategy: StrategyIR,
  context: SurgeProjectionContext,
  issues: readonly CompatibilityIssue[],
): TargetStrategyProjectionSummary {
  const blockingCount = issues.filter((issue) => issue.severity === 'error' && issue.entityId === strategy.id).length
  if (strategy.kind === 'fixed') {
    const fixed = context.fixedEndpoints.get(strategy.id)
    const candidateCount = fixed?.candidate ? 1 : 0
    const compatibleCount = fixed?.endpoint ? 1 : 0
    const skippedCount = candidateCount - compatibleCount
    const reasons = fixed?.candidate
      ? aggregateSurgeSkipReasons([{ endpoint: fixed.candidate, issues: fixed.issues }])
      : []
    return {
      target: 'surge', strategyId: strategy.id, candidateCount, compatibleCount, skippedCount,
      blockingCount, status: projectionStatus(candidateCount, compatibleCount, blockingCount), reasons,
    }
  }

  const refs = strategyProxySetRefs(strategy)
  const projections = refs.flatMap((ref) => context.proxySets.get(`${ref.kind}:${ref.id}`) ?? [])
  const compatible = new Set(projections.flatMap((projection) => projection.proxies.map(surgeProjectionEndpointKey)))
  const skipped = new Map(projections.flatMap((projection) => projection.skipped.map((item) => [surgeProjectionEndpointKey(item.endpoint), item] as const)))
  const candidateCount = new Set([...compatible, ...skipped.keys()]).size
  const compatibleCount = compatible.size
  const skippedCount = skipped.size
  return {
    target: 'surge', strategyId: strategy.id, candidateCount, compatibleCount, skippedCount,
    blockingCount,
    status: projectionStatus(candidateCount, compatibleCount, blockingCount),
    reasons: aggregateSurgeSkipReasons([...skipped.values()]),
  }
}

function strategyProxySetRefs(strategy: StrategyIR): ProxySetRef[] {
  if (strategy.kind === 'auto-select' || strategy.kind === 'load-balance') return [strategy.source]
  if (strategy.kind === 'select' || strategy.kind === 'fallback') {
    return strategy.candidates.filter((candidate): candidate is ProxySetRef => candidate.kind !== 'strategy')
  }
  return []
}

function projectionStatus(candidateCount: number, compatibleCount: number, blockingCount: number): TargetProjectionStatus {
  if (blockingCount > 0 || candidateCount > 0 && compatibleCount === 0) return 'blocked'
  if (candidateCount > 0 && compatibleCount < candidateCount) return 'partial'
  return 'ready'
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
    reasons: aggregateSurgeSkipReasons(skipped),
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
    const reasonSummary = aggregateSurgeSkipReasons(skipped).map((reason) => `${reason.label}: ${reason.endpointCount}`).join(', ')
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

export function aggregateSurgeSkipReasons(skipped: SurgeSkippedEndpoint[]): SurgeProjectionReason[] {
  const counts = new Map<string, SurgeProjectionReason>()
  const endpointReasonKeys = new Map<string, Set<string>>()
  for (const item of skipped) {
    const endpointKey = surgeProjectionEndpointKey(item.endpoint)
    const seenForEndpoint = endpointReasonKeys.get(endpointKey) ?? new Set<string>()
    endpointReasonKeys.set(endpointKey, seenForEndpoint)
    const errors = item.issues.filter((issue) => issue.severity === 'error')
    const effectiveIssues = errors.length > 0 ? errors : [{
      code: 'SURGE_PROXY_VARIANT_UNSUPPORTED',
      target: 'surge' as const,
      severity: 'error' as const,
      feature: 'proxy',
      message: 'Endpoint variant is unsupported.',
    }]
    for (const issue of effectiveIssues) {
      const code = issue.code || 'SURGE_PROXY_VARIANT_UNSUPPORTED'
      const label = skipReasonLabel(item.endpoint, code)
      const endpointReasonKey = `${code}\u0000${label}`
      if (seenForEndpoint.has(endpointReasonKey)) continue
      seenForEndpoint.add(endpointReasonKey)
      const existing = counts.get(endpointReasonKey)
      if (existing) existing.endpointCount += 1
      else counts.set(endpointReasonKey, { code, label, endpointCount: 1 })
    }
  }
  return [...counts.values()].sort((left, right) => right.endpointCount - left.endpointCount
    || left.label.localeCompare(right.label) || left.code.localeCompare(right.code))
}

function skipReasonLabel(endpoint: ResolvedProxyEndpointIR, code: string) {
  if (code === 'SURGE_PROXY_PROTOCOL_UNSUPPORTED') return proxyProtocolLabel(endpoint.protocol)
  if (code === 'SURGE_SHADOWSOCKS_PLUGIN_UNSUPPORTED') return 'Shadowsocks plugin'
  if (code === 'SURGE_PROXY_TRANSPORT_UNSUPPORTED') return 'transport'
  if (code === 'SURGE_PROXY_VARIANT_UNSUPPORTED') return 'endpoint variant'
  if (code === 'SURGE_TLS_CLIENT_FINGERPRINT_UNSUPPORTED') return 'TLS client fingerprint unsupported'
  if (code === 'SURGE_ANYTLS_SESSION_PARAMETERS_UNSUPPORTED') return 'AnyTLS session parameters unsupported'
  if (code === 'SURGE_ANYTLS_UDP_DISABLE_UNSUPPORTED') return 'AnyTLS UDP disable unsupported'
  return code.replace(/^SURGE_/, '').toLowerCase().replaceAll('_', ' ')
}
