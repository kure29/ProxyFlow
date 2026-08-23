import type { ChainStrategyIR, ProxySetRef, StrategyCandidateRef, StrategyIR } from '../../core/ir'
import type { SurgeCompileContext } from './context'
import { registerSurgeProxy } from './context'
import { surgeIssue } from './errors'
import type { SurgeParameter, SurgePolicyEntry } from './model'
import {
  projectSurgeFixedEndpoint,
  projectSurgeProxySet,
  surgeStrategyNoMemberIssue,
  type SurgeProxySetProjection,
} from './projection'

interface CompiledMembers {
  members: string[]
  projections: SurgeProxySetProjection[]
}

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
    const fixed = projectSurgeFixedEndpoint(context.ir, strategy, context.projection)
    if (!fixed.endpoint) {
      context.issues.push(...fixed.issues)
      return undefined
    }
    return {
      name: strategy.name,
      type: 'select',
      arguments: [registerSurgeProxy(fixed.endpoint, context)],
    }
  }
  if (strategy.kind === 'select' || strategy.kind === 'fallback') {
    const resolved = compileCandidates(strategy.candidates, strategy, context)
    if (!ensureMembers(resolved, strategy, context)) return undefined
    const parameters: SurgeParameter[] = strategy.kind === 'fallback' && strategy.healthCheck?.intervalSeconds !== undefined
      ? [{ key: 'interval', value: strategy.healthCheck.intervalSeconds }]
      : []
    return {
      name: strategy.name,
      type: strategy.kind === 'select' ? 'select' : 'fallback',
      arguments: resolved.members,
      parameters,
    }
  }

  const resolved = resolveProxySet(strategy.source, context)
  if (!ensureMembers(resolved, strategy, context)) return undefined
  if (strategy.kind === 'load-balance') return undefined
  return {
    name: strategy.name,
    type: 'url-test',
    arguments: resolved.members,
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

function compileCandidates(
  candidates: StrategyCandidateRef[],
  strategy: Extract<StrategyIR, { kind: 'select' | 'fallback' }>,
  context: SurgeCompileContext,
): CompiledMembers {
  const resolved: CompiledMembers = { members: [], projections: [] }
  for (const candidate of candidates) {
    if (candidate.kind === 'strategy') {
      const name = context.strategyNames.get(candidate.id)
      if (name) resolved.members.push(name)
      else context.issues.push(surgeIssue(
        'SURGE_STRATEGY_REFERENCE_NOT_FOUND', 'error', 'strategy',
        `Strategy “${strategy.name}” references missing strategy “${candidate.id}”.`, strategy.id,
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

function resolveProxySet(ref: ProxySetRef, context: SurgeCompileContext): CompiledMembers {
  const projection = projectSurgeProxySet(context.ir, ref, context.projection)
  return {
    members: projection.status === 'ready'
      ? [...new Set(projection.proxies.map((proxy) => registerSurgeProxy(proxy, context)))]
      : [],
    projections: [projection],
  }
}

function ensureMembers(resolved: CompiledMembers, strategy: StrategyIR, context: SurgeCompileContext) {
  if (resolved.members.length > 0) return true
  const issue = surgeStrategyNoMemberIssue(strategy, resolved.projections)
  if (issue) context.issues.push(issue)
  return false
}
