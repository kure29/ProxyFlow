import type { ProxyFlowIR, ResolvedProxyEndpointIR } from '../../core/ir'
import { createMaterializationContext, type MaterializationContext } from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import type { SurgePolicyEntry } from './model'
import { compileSurgeProxy } from './proxies'

export interface SurgeCompileContext {
  ir: ProxyFlowIR
  issues: CompatibilityIssue[]
  strategyNames: Map<string, string>
  proxies: SurgePolicyEntry[]
  proxyGroups: SurgePolicyEntry[]
  registeredProxyIds: Set<string>
  materialization: MaterializationContext
}

export function createSurgeContext(ir: ProxyFlowIR, issues: CompatibilityIssue[]): SurgeCompileContext {
  return {
    ir,
    issues,
    strategyNames: new Map(ir.strategies.map((strategy) => [strategy.id, strategy.name])),
    proxies: [],
    proxyGroups: [],
    registeredProxyIds: new Set(),
    materialization: createMaterializationContext(),
  }
}

export function registerSurgeProxy(endpoint: ResolvedProxyEndpointIR, context: SurgeCompileContext) {
  if (!context.registeredProxyIds.has(endpoint.id)) {
    const compiled = compileSurgeProxy(endpoint)
    if (compiled) {
      context.proxies.push(compiled)
      context.registeredProxyIds.add(endpoint.id)
    }
  }
  return endpoint.name
}
