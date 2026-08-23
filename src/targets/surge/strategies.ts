import { isUnmodeledProxy, type ChainStrategyIR, type ProxySetRef, type ResolvedProxyEndpointIR, type StrategyCandidateRef, type StrategyIR } from '../../core/ir'
import { materializeProxySet } from '../../core/proxySet'
import type { SurgeCompileContext } from './context'
import { registerSurgeProxy } from './context'
import { surgeIssue } from './errors'
import type { SurgeParameter, SurgePolicyEntry } from './model'

export function compileSurgeStrategies(context: SurgeCompileContext) {
  for (const strategy of context.ir.strategies) {
    if (strategy.kind === 'chain') continue
    const group = compileStrategy(strategy, context)
    if (!group) continue
    context.proxyGroups.push(group)
    context.strategyTemplates.set(strategy.id, {
      entry: group,
      directPolicyMembers: strategy.kind === 'fixed' || strategy.kind === 'auto-select'
        || (strategy.kind === 'select' || strategy.kind === 'fallback')
          && strategy.candidates.every((candidate) => candidate.kind !== 'strategy'),
    })
    context.compiledStrategyIds.add(strategy.id)
  }
  for (const chain of context.ir.strategies.filter((strategy): strategy is ChainStrategyIR => strategy.kind === 'chain')) {
    compileChain(chain, context)
  }
}

function compileStrategy(strategy: StrategyIR, context: SurgeCompileContext): SurgePolicyEntry | undefined {
  if (strategy.kind === 'chain') return undefined
  if (strategy.kind === 'fixed') {
    const endpoint = findFixedEndpoint(strategy.proxyId, context)
    if (!endpoint) {
      context.issues.push(surgeIssue(
        'SURGE_FIXED_PROXY_UNRESOLVED', 'error', 'strategy',
        `Fixed strategy “${strategy.name}” does not resolve to a modeled proxy endpoint.`, strategy.id,
      ))
      return undefined
    }
    return {
      name: strategy.name,
      type: 'select',
      arguments: [registerSurgeProxy(endpoint, context)],
    }
  }
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

function compileChain(chain: ChainStrategyIR, context: SurgeCompileContext) {
  const templates = chain.hops.map((hop) => context.strategyTemplates.get(hop.id))
  if (templates.some((template) => !template)) {
    context.issues.push(surgeIssue(
      'SURGE_PROXY_CHAIN_HOP_UNRESOLVED', 'error', 'chain',
      `Proxy Chain “${chain.name}” contains a hop that did not compile to a Surge policy group.`, chain.id,
    ))
    return
  }

  if (templates.length === 1) {
    const template = templates[0]!
    const entry = cloneGroup(template.entry, chain.name)
    context.proxyGroups.push(entry)
    context.strategyTemplates.set(chain.id, { entry, directPolicyMembers: template.directPolicyMembers })
    context.compiledStrategyIds.add(chain.id)
    return
  }

  let underlyingPolicy = templates[0]!.entry.name
  let finalEntry: SurgePolicyEntry | undefined
  for (let index = 1; index < templates.length; index += 1) {
    const template = templates[index]!
    if (!template.directPolicyMembers) {
      context.issues.push(surgeIssue(
        'SURGE_PROXY_CHAIN_NESTED_MEMBER_UNSUPPORTED', 'error', 'chain',
        `Proxy Chain “${chain.name}” cannot apply an underlying policy to nested groups in hop ${index + 1}.`, chain.id,
      ))
      return
    }
    const isLast = index === templates.length - 1
    const name = isLast
      ? chain.name
      : context.policyNames.allocate(`${chain.name} · Hop ${index + 1}`, `${chain.id}-hop-${index + 1}`)
    const entry = cloneGroup(template.entry, name, underlyingPolicy)
    context.proxyGroups.push(entry)
    underlyingPolicy = name
    finalEntry = entry
  }

  if (finalEntry) {
    context.strategyTemplates.set(chain.id, { entry: finalEntry, directPolicyMembers: true })
    context.compiledStrategyIds.add(chain.id)
  }
}

function cloneGroup(entry: SurgePolicyEntry, name: string, underlyingProxy?: string): SurgePolicyEntry {
  return {
    ...entry,
    name,
    arguments: [...entry.arguments],
    parameters: [
      ...(entry.parameters?.map((parameter) => ({ ...parameter })) ?? []),
      ...(underlyingProxy ? [{ key: 'underlying-proxy', value: underlyingProxy }] : []),
    ],
  }
}

function findFixedEndpoint(proxyId: string | undefined, context: SurgeCompileContext): ResolvedProxyEndpointIR | undefined {
  if (!proxyId) return undefined
  for (const source of context.ir.sources) {
    if (source.kind !== 'manual-proxy' && !(source.kind === 'subscription' && source.proxies)) continue
    const endpoint = (source.proxies ?? []).find((proxy) => proxy.id === proxyId)
    if (endpoint && !isUnmodeledProxy(endpoint)) return endpoint
  }
  return undefined
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
