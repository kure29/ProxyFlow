import type { ProxyFlowIR, ResolvedProxyEndpointIR, StrategyIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import type { ShadowrocketPolicyEntry } from './model'
import { compileShadowrocketProxy } from './proxies'
import { createShadowrocketProjectionContext, type ShadowrocketProjectionContext } from './projection'

export interface ShadowrocketCompileContext {
  ir: ProxyFlowIR
  issues: CompatibilityIssue[]
  strategyNames: Map<string, string>
  proxies: ShadowrocketPolicyEntry[]
  proxyGroups: ShadowrocketPolicyEntry[]
  compiledStrategyIds: Set<string>
  blockedStrategyIds: Set<string>
  activeStrategyIds: ReadonlySet<string>
  registeredProxyIds: Set<string>
  projection: ShadowrocketProjectionContext
}
export function createShadowrocketContext(ir: ProxyFlowIR, issues: CompatibilityIssue[], projection = createShadowrocketProjectionContext()): ShadowrocketCompileContext {
  return { ir, issues, strategyNames: new Map(ir.strategies.map((strategy) => [strategy.id, strategy.name])), proxies: [], proxyGroups: [], compiledStrategyIds: new Set(), blockedStrategyIds: new Set(), activeStrategyIds: collectActiveShadowrocketStrategyIds(ir), registeredProxyIds: new Set(), projection }
}
export function collectActiveShadowrocketStrategyIds(ir: Pick<ProxyFlowIR, 'routes' | 'finalRoute' | 'strategies'>) {
  const byId = new Map(ir.strategies.map((strategy) => [strategy.id, strategy])), active = new Set<string>()
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
export function isShadowrocketStrategyActive(context: Pick<ShadowrocketCompileContext, 'activeStrategyIds'>, strategy: StrategyIR) { return context.activeStrategyIds.has(strategy.id) }
export function registerShadowrocketProxy(endpoint: ResolvedProxyEndpointIR, context: ShadowrocketCompileContext) {
  if (!context.registeredProxyIds.has(endpoint.id)) { const compiled = compileShadowrocketProxy(endpoint); if (compiled) { context.proxies.push(compiled); context.registeredProxyIds.add(endpoint.id) } }
  return endpoint.name
}
