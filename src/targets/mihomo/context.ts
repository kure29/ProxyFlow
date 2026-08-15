import type { ProxyFlowIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import type { MihomoProxyGroup, MihomoProxyProvider, MihomoRuleProvider } from './model'
import { createOutboundNameRegistry, NameRegistry } from './naming'

export interface ResolvedProxySet {
  providers: string[]
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
  strategyNames: Map<string, string>
  providers: Map<string, MihomoProxyProvider>
  groups: MihomoProxyGroup[]
  groupTemplates: Map<string, CompiledGroupTemplate>
  ruleProviders: Map<string, MihomoRuleProvider>
  derivedProviderNames: Map<string, string>
}

export function createMihomoContext(ir: ProxyFlowIR, issues: CompatibilityIssue[]): MihomoCompileContext {
  const outboundNames = createOutboundNameRegistry()
  const sourceNames = new Map(ir.sources.map((source) => [source.id, outboundNames.allocate(source.name, source.id)]))
  const strategyNames = new Map(ir.strategies.map((strategy) => [strategy.id, outboundNames.allocate(strategy.name, strategy.id)]))
  return {
    ir,
    issues,
    outboundNames,
    ruleProviderNames: new NameRegistry(),
    sourceNames,
    strategyNames,
    providers: new Map(),
    groups: [],
    groupTemplates: new Map(),
    ruleProviders: new Map(),
    derivedProviderNames: new Map(),
  }
}
