import type { HealthCheckIR, ProxySetRef, StrategyCandidateRef, StrategyIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import type { LoonParameter, LoonProxyGroup } from './model'
import type { LoonCompileContext } from './context'
import { isLoonStrategyActive, registerLoonProxy } from './context'
import { loonIssue } from './errors'
import {
  loonProxySetProjectionIssues,
  loonStrategyNoMemberIssue,
  projectLoonFixedEndpoint,
  projectLoonProxySet,
  type LoonProxySetProjection,
} from './projection'

interface CompiledMembers {
  members: string[]
  projections: LoonProxySetProjection[]
}

export function compileLoonStrategies(context: LoonCompileContext) {
  const byId = new Map(context.ir.strategies.map((strategy) => [strategy.id, strategy]))
  const visiting = new Set<string>()
  const compiled = new Set<string>()
  const compileOne = (id: string) => {
    if (compiled.has(id)) return
    const strategy = byId.get(id)
    if (!strategy) return
    if (visiting.has(id)) return // validateIR/compatibility owns the cycle diagnostic.
    visiting.add(id)
    if (strategy.kind === 'select' || strategy.kind === 'fallback') {
      for (const candidate of strategy.candidates) if (candidate.kind === 'strategy') compileOne(candidate.id)
    }
    if (strategy.kind === 'chain') {
      context.blockedStrategyIds.add(strategy.id)
      const active = isLoonStrategyActive(context, strategy)
      context.issues.push(loonIssue(
        'LOON_PROXY_CHAIN_UNPROVEN', active ? 'error' : 'warning', 'chain',
        active
          ? `Proxy Chain "${strategy.name}" has no audited native Loon chain syntax; nested policy groups are not a proxy chain.`
          : `Unused Proxy Chain "${strategy.name}" is not emitted because no active route or strategy references it, and native Loon chain syntax is unproven.`,
        strategy.id,
      ))
    } else {
      const group = compileStrategy(strategy, context)
      if (group) {
        context.proxyGroups.push(group)
        context.compiledStrategyIds.add(strategy.id)
      }
    }
    visiting.delete(id)
    compiled.add(id)
  }
  // Only policies reachable from an emitted route/final target belong in the
  // profile.  Keep scanning unused chains so the compatibility boundary can
  // report their omission, but do not materialize unrelated strategy groups.
  for (const strategy of context.ir.strategies) {
    if (!context.activeStrategyIds.has(strategy.id) && strategy.kind !== 'chain') continue
    compileOne(strategy.id)
  }
}

function compileStrategy(strategy: StrategyIR, context: LoonCompileContext): LoonProxyGroup | undefined {
  if (strategy.kind === 'fixed') {
    const fixed = projectLoonFixedEndpoint(context.ir, strategy, context.projection)
    if (!fixed.endpoint) {
      blockStrategy(context, strategy.id)
      context.issues.push(...adjustInactiveStrategyIssues(fixed.issues, context, strategy))
      return undefined
    }
    return { name: strategy.name, type: 'select', arguments: [registerLoonProxy(fixed.endpoint, context)] }
  }

  if (strategy.kind === 'select' || strategy.kind === 'fallback') {
    const resolved = compileCandidates(strategy.candidates, strategy, context)
    if (!ensureMembers(resolved, strategy, context)) return undefined
    const parameters = strategy.kind === 'fallback'
      ? fallbackParameters(strategy.healthCheck, strategy.id, strategy.name, context)
      : []
    if (parameters === undefined) return undefined
    return { name: strategy.name, type: strategy.kind, arguments: resolved.members, parameters }
  }

  if (strategy.kind === 'load-balance') {
    if (strategy.mode !== 'round-robin') {
      blockStrategy(context, strategy.id)
      context.issues.push(loonIssue(
        strategy.mode === 'consistent-hash' ? 'LOON_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED' : 'LOON_LOAD_BALANCE_ALGORITHM_UNPROVEN',
        isLoonStrategyActive(context, strategy) ? 'error' : 'warning', 'strategy',
        strategy.mode === 'consistent-hash'
          ? `Load Balance strategy "${strategy.name}" uses consistent hashing; Loon PCC is not proven equivalent to the Universal hash key and scope.`
          : `Load Balance strategy "${strategy.name}" has no explicit algorithm; selecting a Loon default would change Universal semantics.`,
        strategy.id,
      ))
      return undefined
    }
    const resolved = resolveProxySet(strategy.source, context)
    if (!ensureMembers(resolved, strategy, context)) return undefined
    return { name: strategy.name, type: 'load-balance', arguments: resolved.members, parameters: [{ key: 'algorithm', value: 'Round-Robin' }] }
  }

  if (strategy.kind !== 'auto-select') return undefined
  // auto-select
  const resolved = resolveProxySet(strategy.source, context)
  if (!ensureMembers(resolved, strategy, context)) return undefined
  const parameters = healthParameters(strategy.healthCheck)
  return { name: strategy.name, type: 'url-test', arguments: resolved.members, parameters }
}

function compileCandidates(candidates: StrategyCandidateRef[], strategy: Extract<StrategyIR, { kind: 'select' | 'fallback' }>, context: LoonCompileContext): CompiledMembers {
  const resolved: CompiledMembers = { members: [], projections: [] }
  for (const candidate of candidates) {
    if (candidate.kind === 'strategy') {
      const name = context.strategyNames.get(candidate.id)
      if (name && context.compiledStrategyIds.has(candidate.id)) resolved.members.push(name)
      else if (!context.blockedStrategyIds.has(candidate.id)) context.issues.push(loonIssue(
        'LOON_STRATEGY_REFERENCE_NOT_FOUND', 'error', 'strategy',
        `Strategy "${strategy.name}" references strategy "${candidate.id}" that did not compile to a Loon policy group.`, strategy.id,
      ))
    } else {
      const projected = resolveProxySet(candidate, context)
      resolved.members.push(...projected.members)
      resolved.projections.push(...projected.projections)
    }
  }
  resolved.members = [...new Set(resolved.members)]
  return resolved
}

function resolveProxySet(ref: ProxySetRef, context: LoonCompileContext): CompiledMembers {
  const projection = projectLoonProxySet(context.ir, ref, context.projection)
  return {
    members: projection.status === 'ready' ? [...new Set(projection.proxies.map((proxy) => registerLoonProxy(proxy, context)))] : [],
    projections: [projection],
  }
}

function ensureMembers(resolved: CompiledMembers, strategy: StrategyIR, context: LoonCompileContext) {
  context.issues.push(...adjustInactiveStrategyIssues(loonProxySetProjectionIssues(resolved.projections, strategy), context, strategy))
  if (resolved.members.length > 0) return true
  const issue = loonStrategyNoMemberIssue(strategy, resolved.projections)
  if (issue) {
    blockStrategy(context, strategy.id)
    context.issues.push(isLoonStrategyActive(context, strategy) ? issue : { ...issue, severity: 'warning' })
  }
  return false
}

function healthParameters(healthCheck: HealthCheckIR | undefined): LoonParameter[] {
  if (!healthCheck) return []
  return [
    ...(healthCheck.url !== undefined ? [{ key: 'url', value: healthCheck.url }] : []),
    ...(healthCheck.intervalSeconds !== undefined ? [{ key: 'interval', value: healthCheck.intervalSeconds }] : []),
    ...(healthCheck.toleranceMs !== undefined ? [{ key: 'tolerance', value: healthCheck.toleranceMs }] : []),
  ]
}

function fallbackParameters(
  healthCheck: HealthCheckIR | undefined,
  id: string,
  name: string,
  context: LoonCompileContext,
): LoonParameter[] | undefined {
  if (healthCheck?.toleranceMs !== undefined) {
    blockStrategy(context, id)
    context.issues.push(loonIssue(
      'LOON_FALLBACK_TOLERANCE_UNSUPPORTED', context.activeStrategyIds.has(id) ? 'error' : 'warning', 'strategy',
      `Fallback strategy "${name}" has tolerance intent, but Loon fallback exposes max-timeout rather than tolerance.`, id,
    ))
    return undefined
  }
  // Universal IR does not carry max-timeout. Omitting it is exact when no
  // timeout intent exists; Loon applies its own documented default.
  return [
    ...(healthCheck?.url !== undefined ? [{ key: 'url', value: healthCheck.url }] : []),
    ...(healthCheck?.intervalSeconds !== undefined ? [{ key: 'interval', value: healthCheck.intervalSeconds }] : []),
  ]
}

function blockStrategy(context: LoonCompileContext, id: string) {
  context.blockedStrategyIds.add(id)
}

function adjustInactiveStrategyIssues(
  issues: CompatibilityIssue[],
  context: LoonCompileContext,
  strategy: StrategyIR,
) {
  if (isLoonStrategyActive(context, strategy)) return issues
  return issues.map((issue) => issue.severity !== 'error' || issue.feature === 'serialization' || issue.feature === 'naming'
    ? issue
    : { ...issue, severity: 'warning' as const })
}
