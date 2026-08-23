import type { ProxyFlowIR, ResolvedProxyEndpointIR } from '../../core/ir'
import { createMaterializationContext, type MaterializationContext } from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import type { SurgePolicyEntry } from './model'
import { SurgeNameRegistry } from './naming'
import { compileSurgeProxy } from './proxies'

export interface SurgeStrategyTemplate {
  entry: SurgePolicyEntry
  /** Group-level underlying-proxy only applies losslessly to direct policy members. */
  directPolicyMembers: boolean
}

export interface SurgeCompileContext {
  ir: ProxyFlowIR
  issues: CompatibilityIssue[]
  strategyNames: Map<string, string>
  proxies: SurgePolicyEntry[]
  proxyGroups: SurgePolicyEntry[]
  strategyTemplates: Map<string, SurgeStrategyTemplate>
  compiledStrategyIds: Set<string>
  registeredProxyIds: Set<string>
  policyNames: SurgeNameRegistry
  materialization: MaterializationContext
}

export function createSurgeContext(ir: ProxyFlowIR, issues: CompatibilityIssue[]): SurgeCompileContext {
  const policyNames = new SurgeNameRegistry()
  for (const strategy of ir.strategies) policyNames.reserve(strategy.name)
  for (const source of ir.sources) {
    if (source.kind !== 'manual-proxy' && !(source.kind === 'subscription' && source.proxies)) continue
    for (const proxy of source.proxies ?? []) policyNames.reserve(proxy.name)
  }
  return {
    ir,
    issues,
    strategyNames: new Map(ir.strategies.map((strategy) => [strategy.id, strategy.name])),
    proxies: [],
    proxyGroups: [],
    strategyTemplates: new Map(),
    compiledStrategyIds: new Set(),
    registeredProxyIds: new Set(),
    policyNames,
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
