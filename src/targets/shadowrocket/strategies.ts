import type { ProxySetRef, StrategyCandidateRef, StrategyIR } from '../../core/ir'
import type { ShadowrocketCompileContext } from './context'
import { isShadowrocketStrategyActive, registerShadowrocketProxy } from './context'
import { shadowrocketIssue } from './errors'
import type { ShadowrocketParameter, ShadowrocketPolicyEntry } from './model'
import { projectShadowrocketFixedEndpoint, projectShadowrocketProxySet, shadowrocketProxySetProjectionIssues, shadowrocketStrategyNoMemberIssue, type ShadowrocketProxySetProjection } from './projection'

interface Members { members: string[]; projections: ShadowrocketProxySetProjection[] }

export function compileShadowrocketStrategies(context: ShadowrocketCompileContext) {
  // Strategy order in the IR is a presentation detail. A select/fallback may
  // legally refer to a group declared later, so resolve the dependency graph
  // first and emit each group once in deterministic dependency order.
  const byId = new Map(context.ir.strategies.map((strategy) => [strategy.id, strategy]))
  const visiting = new Set<string>()
  const completed = new Set<string>()

  const compileById = (id: string): boolean => {
    if (context.compiledStrategyIds.has(id)) return true
    if (context.blockedStrategyIds.has(id)) return false
    if (completed.has(id)) return context.compiledStrategyIds.has(id)
    const strategy = byId.get(id)
    if (!strategy) return false
    if (visiting.has(id)) {
      context.blockedStrategyIds.add(id)
      context.issues.push(shadowrocketIssue(
        'SHADOWROCKET_STRATEGY_CYCLE',
        isShadowrocketStrategyActive(context, strategy) ? 'error' : 'warning',
        'strategy',
        `Strategy "${strategy.name}" contains a nested strategy cycle and cannot be emitted safely.`,
        strategy.id,
      ))
      return false
    }

    visiting.add(id)
    if (strategy.kind === 'select' || strategy.kind === 'fallback') {
      for (const candidate of strategy.candidates) {
        if (candidate.kind === 'strategy') compileById(candidate.id)
      }
    }

    const group = compileStrategy(strategy, context)
    visiting.delete(id)
    completed.add(id)
    if (!group) return false
    context.proxyGroups.push(group)
    context.compiledStrategyIds.add(strategy.id)
    return true
  }

  // Keep unrelated inventory out of the emitted profile. Chains are scanned
  // even when unused so their unproven capability remains visible as a
  // warning, matching the paused target's fail-closed diagnostics contract.
  for (const strategy of context.ir.strategies) {
    if (!context.activeStrategyIds.has(strategy.id) && strategy.kind !== 'chain') continue
    compileById(strategy.id)
  }
}

function compileStrategy(strategy: StrategyIR, context: ShadowrocketCompileContext): ShadowrocketPolicyEntry | undefined {
  if (strategy.kind === 'chain') {
    context.blockedStrategyIds.add(strategy.id)
    context.issues.push(shadowrocketIssue('SHADOWROCKET_PROXY_CHAIN_UNPROVEN', isShadowrocketStrategyActive(context, strategy) ? 'error' : 'warning', 'chain', `Proxy chain "${strategy.name}" is not emitted because Shadowrocket chain semantics are not proven against Universal hop order.`, strategy.id))
    return undefined
  }
  if (strategy.kind === 'fixed') {
    const fixed = projectShadowrocketFixedEndpoint(context.ir, strategy, context.projection)
    context.issues.push(...fixed.issues)
    return fixed.endpoint ? { name: strategy.name, type: 'select', arguments: [registerShadowrocketProxy(fixed.endpoint, context)] } : undefined
  }
  const resolved = strategy.kind === 'select' || strategy.kind === 'fallback' ? compileCandidates(strategy.candidates, strategy, context) : resolveProxySet(strategy.source, context)
  context.issues.push(...resolved.projections.flatMap((projection) => shadowrocketProxySetProjectionIssues([projection], strategy)))
  if (!ensureMembers(resolved, strategy, context)) return undefined
  if (strategy.kind === 'select') return { name: strategy.name, type: 'select', arguments: resolved.members }
  if (strategy.kind === 'fallback') return { name: strategy.name, type: 'fallback', arguments: resolved.members, parameters: healthParameters(strategy.healthCheck) }
  if (strategy.kind === 'load-balance') return { name: strategy.name, type: 'load-balance', arguments: resolved.members, parameters: [{ key: 'strategy', value: strategy.mode ?? 'round-robin' }] }
  return { name: strategy.name, type: 'url-test', arguments: resolved.members, parameters: healthParameters(strategy.healthCheck) }
}

function compileCandidates(candidates: StrategyCandidateRef[], strategy: Extract<StrategyIR, { kind: 'select' | 'fallback' }>, context: ShadowrocketCompileContext): Members {
  const result: Members = { members: [], projections: [] }
  for (const candidate of candidates) {
    if (candidate.kind === 'strategy') {
      const name = context.strategyNames.get(candidate.id)
      if (name && context.compiledStrategyIds.has(candidate.id)) result.members.push(name)
      else if (!context.blockedStrategyIds.has(candidate.id)) context.issues.push(shadowrocketIssue('SHADOWROCKET_STRATEGY_REFERENCE_NOT_FOUND', 'error', 'strategy', `Strategy "${strategy.name}" references strategy "${candidate.id}" that did not compile.`, strategy.id))
    } else {
      const projected = resolveProxySet(candidate, context)
      result.members.push(...projected.members)
      result.projections.push(...projected.projections)
    }
  }
  result.members = [...new Set(result.members)]
  return result
}

function resolveProxySet(ref: ProxySetRef, context: ShadowrocketCompileContext): Members {
  const projection = projectShadowrocketProxySet(context.ir, ref, context.projection)
  return { members: projection.status === 'ready' ? [...new Set(projection.proxies.map((proxy) => registerShadowrocketProxy(proxy, context)))] : [], projections: [projection] }
}
function ensureMembers(resolved: Members, strategy: StrategyIR, context: ShadowrocketCompileContext) {
  if (resolved.members.length) return true
  const issue = shadowrocketStrategyNoMemberIssue(strategy, resolved.projections)
  context.blockedStrategyIds.add(strategy.id)
  context.issues.push(isShadowrocketStrategyActive(context, strategy) ? issue : { ...issue, severity: 'warning' })
  return false
}
function healthParameters(healthCheck: StrategyIR extends infer _ ? { url?: string; intervalSeconds?: number; toleranceMs?: number } | undefined : never): ShadowrocketParameter[] {
  if (!healthCheck) return []
  return [...(healthCheck.url ? [{ key: 'url', value: healthCheck.url }] : []), ...(healthCheck.intervalSeconds !== undefined ? [{ key: 'interval', value: healthCheck.intervalSeconds }] : []), ...(healthCheck.toleranceMs !== undefined ? [{ key: 'tolerance', value: healthCheck.toleranceMs }] : [])]
}
