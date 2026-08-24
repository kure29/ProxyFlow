import type { ProxyFlowIR, ResolvedProxyEndpointIR, StrategyIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import type { LoonProxy, LoonProxyGroup } from './model'
import { compileLoonProxy } from './proxies'
import { createLoonProjectionContext, type LoonProjectionContext } from './projection'

export interface LoonCompileContext {
  ir: ProxyFlowIR
  issues: CompatibilityIssue[]
  strategyNames: Map<string, string>
  proxies: LoonProxy[]
  proxyGroups: LoonProxyGroup[]
  compiledStrategyIds: Set<string>
  blockedStrategyIds: Set<string>
  activeStrategyIds: ReadonlySet<string>
  registeredProxyIds: Set<string>
  projection: LoonProjectionContext
}

export function createLoonContext(
  ir: ProxyFlowIR,
  issues: CompatibilityIssue[],
  projection = createLoonProjectionContext(),
): LoonCompileContext {
  return {
    ir,
    issues,
    strategyNames: new Map(ir.strategies.map((strategy) => [strategy.id, strategy.name])),
    proxies: [],
    proxyGroups: [],
    compiledStrategyIds: new Set(),
    blockedStrategyIds: new Set(),
    activeStrategyIds: collectActiveLoonStrategyIds(ir),
    registeredProxyIds: new Set(),
    projection,
  }
}

/** Strategies reachable from an emitted route/final target, including nested groups and chain hops. */
export function collectActiveLoonStrategyIds(
  ir: Pick<ProxyFlowIR, 'routes' | 'finalRoute' | 'strategies'>,
) {
  const byId = new Map(ir.strategies.map((strategy) => [strategy.id, strategy]))
  const active = new Set<string>()
  const visit = (id: string) => {
    if (active.has(id)) return
    active.add(id)
    const strategy = byId.get(id)
    if (!strategy) return
    if (strategy.kind === 'select' || strategy.kind === 'fallback') {
      for (const candidate of strategy.candidates) if (candidate.kind === 'strategy') visit(candidate.id)
    } else if (strategy.kind === 'chain') {
      for (const hop of strategy.hops) visit(hop.id)
    }
  }
  for (const route of ir.routes) if (route.target.kind === 'strategy') visit(route.target.id)
  if (ir.finalRoute?.target.kind === 'strategy') visit(ir.finalRoute.target.id)
  return active
}

export function isLoonStrategyActive(context: Pick<LoonCompileContext, 'activeStrategyIds'>, strategy: StrategyIR) {
  return context.activeStrategyIds.has(strategy.id)
}

export function registerLoonProxy(endpoint: ResolvedProxyEndpointIR, context: LoonCompileContext) {
  if (!context.registeredProxyIds.has(endpoint.id)) {
    const compiled = compileLoonProxy(endpoint)
    if (compiled) {
      context.proxies.push(compiled)
      context.registeredProxyIds.add(endpoint.id)
    }
  }
  return endpoint.name
}
