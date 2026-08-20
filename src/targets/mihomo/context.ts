import type { ProxyFlowIR } from '../../core/ir'
import { createMaterializationContext, type MaterializationContext } from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import type { MihomoProxy, MihomoProxyGroup, MihomoProxyProvider, MihomoRuleProvider } from './model'
import { createOutboundNameRegistry, NameRegistry } from './naming'

export interface ResolvedProxySet {
  providers: string[]
  proxyNames: string[]
  include: string[]
  exclude: string[]
}

export interface CompiledGroupTemplate {
  group: MihomoProxyGroup
  providerNames: string[]
  proxyNames: string[]
}

export interface MihomoCompileContext {
  ir: ProxyFlowIR
  issues: CompatibilityIssue[]
  outboundNames: NameRegistry
  ruleProviderNames: NameRegistry
  sourceNames: Map<string, string>
  proxyNamesById: Map<string, string>
  compiledEndpointIds: Set<string>
  proxies: Map<string, MihomoProxy>
  strategyNames: Map<string, string>
  providers: Map<string, MihomoProxyProvider>
  groups: MihomoProxyGroup[]
  groupTemplates: Map<string, CompiledGroupTemplate>
  ruleProviders: Map<string, MihomoRuleProvider>
  derivedProviderNames: Map<string, string>
  materialization: MaterializationContext
}

export function createMihomoContext(ir: ProxyFlowIR, issues: CompatibilityIssue[]): MihomoCompileContext {
  const outboundNames = createOutboundNameRegistry()
  const sourceNames = new Map(ir.sources
    .filter((source) => source.kind === 'subscription' || source.kind === 'provider')
    .map((source) => [source.id, outboundNames.allocate(source.name, source.id)]))
  const proxyNamesById = new Map(ir.sources.flatMap((source) => source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies
    ? (source.proxies ?? []).map((proxy) => [proxy.id, outboundNames.allocate(proxy.name, proxy.id)] as const)
    : []))
  const strategyNames = new Map(ir.strategies.map((strategy) => [strategy.id, outboundNames.allocate(strategy.name, strategy.id)]))
  return {
    ir,
    issues,
    outboundNames,
    ruleProviderNames: new NameRegistry(),
    sourceNames,
    proxyNamesById,
    compiledEndpointIds: new Set(),
    proxies: new Map(),
    strategyNames,
    providers: new Map(),
    groups: [],
    groupTemplates: new Map(),
    ruleProviders: new Map(),
    derivedProviderNames: new Map(),
    materialization: createMaterializationContext(),
  }
}
