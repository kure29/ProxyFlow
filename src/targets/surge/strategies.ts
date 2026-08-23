import type { ProxySetRef, StrategyCandidateRef, StrategyIR } from '../../core/ir'
import { materializeProxySet } from '../../core/proxySet'
import type { SurgeCompileContext } from './context'
import { registerSurgeProxy } from './context'
import { surgeIssue } from './errors'
import type { SurgeParameter, SurgePolicyEntry } from './model'

export function compileSurgeStrategies(context: SurgeCompileContext) {
  for (const strategy of context.ir.strategies) {
    const group = compileStrategy(strategy, context)
    if (group) context.proxyGroups.push(group)
  }
}

function compileStrategy(strategy: StrategyIR, context: SurgeCompileContext): SurgePolicyEntry | undefined {
  if (strategy.kind === 'fixed' || strategy.kind === 'chain') return undefined
  if (strategy.kind === 'select' || strategy.kind === 'fallback') {
    const members = compileCandidates(strategy.candidates, strategy, context)
    if (!ensureMembers(members, strategy, context)) return undefined
    const parameters: SurgeParameter[] = strategy.kind === 'fallback' && strategy.healthCheck?.intervalSeconds !== undefined
      ? [{ key: 'interval', value: strategy.healthCheck.intervalSeconds }]
      : []
    return {
      name: strategy.name,
      type: strategy.kind === 'select' ? 'select' : 'fallback',
      arguments: members,
      parameters,
    }
  }

  const members = resolveProxySet(strategy.source, strategy, context)
  if (!ensureMembers(members, strategy, context)) return undefined
  if (strategy.kind === 'load-balance') return undefined
  return {
    name: strategy.name,
    type: 'url-test',
    arguments: members,
    parameters: [
      ...(strategy.healthCheck?.intervalSeconds !== undefined
        ? [{ key: 'interval', value: strategy.healthCheck.intervalSeconds } as const]
        : []),
      ...(strategy.healthCheck?.toleranceMs !== undefined
        ? [{ key: 'tolerance', value: strategy.healthCheck.toleranceMs } as const]
        : []),
    ],
  }
}

function compileCandidates(
  candidates: StrategyCandidateRef[],
  strategy: Extract<StrategyIR, { kind: 'select' | 'fallback' }>,
  context: SurgeCompileContext,
) {
  const members: string[] = []
  for (const candidate of candidates) {
    if (candidate.kind === 'strategy') {
      const name = context.strategyNames.get(candidate.id)
      if (name) members.push(name)
      else context.issues.push(surgeIssue(
        'SURGE_STRATEGY_REFERENCE_NOT_FOUND', 'error', 'strategy',
        `Strategy “${strategy.name}” references missing strategy “${candidate.id}”.`, strategy.id,
      ))
    } else members.push(...resolveProxySet(candidate, strategy, context))
  }
  return members
}

function resolveProxySet(ref: ProxySetRef, strategy: StrategyIR, context: SurgeCompileContext) {
  const result = materializeProxySet(context.ir, ref, context.materialization)
  for (const issue of result.issues) context.issues.push(surgeIssue(
    `SURGE_${issue.code}`, issue.severity, 'strategy', issue.message, issue.entityId ?? strategy.id,
  ))
  return result.status === 'ready' ? result.proxies.map((proxy) => registerSurgeProxy(proxy, context)) : []
}

function ensureMembers(members: string[], strategy: StrategyIR, context: SurgeCompileContext) {
  if (members.length > 0) return true
  context.issues.push(surgeIssue(
    'SURGE_STRATEGY_EMPTY', 'error', 'strategy', `Strategy “${strategy.name}” has no materialized policy members.`, strategy.id,
  ))
  return false
}
