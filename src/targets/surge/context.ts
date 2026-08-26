import type { ProxyFlowIR, ResolvedProxyEndpointIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import type { SurgePolicyEntry } from './model'
import { SurgeNameRegistry } from './naming'
import { createSurgeProjectionContext, type SurgeProjectionContext } from './projection'
import { compileSurgeProxy } from './proxies'
import type { TargetNativeRouteIR, TargetNativeStrategyIR } from '../../core/targetNative'

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
  projection: SurgeProjectionContext
  nativeRoutes: TargetNativeRouteIR[]
  nativeFinalRoute?: TargetNativeRouteIR
}

export function createSurgeContext(
  ir: ProxyFlowIR,
  issues: CompatibilityIssue[],
  projection = createSurgeProjectionContext(),
  nativeStrategies: readonly TargetNativeStrategyIR[] = [],
  nativeRoutes: readonly TargetNativeRouteIR[] = [],
  nativeFinalRoute?: TargetNativeRouteIR,
): SurgeCompileContext {
  const policyNames = new SurgeNameRegistry()
  for (const strategy of ir.strategies) policyNames.reserve(strategy.name)
  for (const strategy of nativeStrategies) policyNames.reserve(strategy.name)
  return {
    ir,
    issues,
    strategyNames: new Map([
      ...ir.strategies.map((strategy) => [strategy.id, strategy.name] as const),
      ...nativeStrategies.map((strategy) => [strategy.id, strategy.name] as const),
    ]),
    proxies: [],
    proxyGroups: [],
    strategyTemplates: new Map(),
    compiledStrategyIds: new Set(),
    registeredProxyIds: new Set(),
    policyNames,
    projection,
    nativeRoutes: [...nativeRoutes],
    nativeFinalRoute,
  }
}

export function registerSurgeProxy(endpoint: ResolvedProxyEndpointIR, context: SurgeCompileContext) {
  if (!context.registeredProxyIds.has(endpoint.id)) {
    const compiled = compileSurgeProxy(endpoint)
    if (compiled) {
      context.proxies.push(compiled)
      context.registeredProxyIds.add(endpoint.id)
      context.policyNames.reserve(endpoint.name)
    }
  }
  return endpoint.name
}
