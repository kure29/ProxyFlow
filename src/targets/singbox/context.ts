import type { ProxyFlowIR, ResolvedProxyEndpointIR } from '../../core/ir'
import { createMaterializationContext, type MaterializationContext } from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import type { SingBoxOutbound, SingBoxRuleSet } from './model'
import { SingBoxNameRegistry } from './naming'

export type ResolvedEndpoint = ResolvedProxyEndpointIR

export interface ResolvedProxyItem {
  key: string
  endpoint: ResolvedEndpoint
  tag: string
}

export interface SingBoxStrategyTemplate {
  kind: 'fixed' | 'selector' | 'urltest'
  tag: string
  memberTags: string[]
}

export interface SingBoxCompileContext {
  ir: ProxyFlowIR
  issues: CompatibilityIssue[]
  names: SingBoxNameRegistry
  endpointTags: Map<string, string>
  strategyTags: Map<string, string>
  outbounds: Map<string, SingBoxOutbound>
  ruleSets: Map<string, SingBoxRuleSet>
  strategyTemplates: Map<string, SingBoxStrategyTemplate>
  proxySetCache: Map<string, ResolvedProxyItem[]>
  dnsTag?: string
  materialization: MaterializationContext
}

export function createSingBoxContext(ir: ProxyFlowIR, issues: CompatibilityIssue[]): SingBoxCompileContext {
  const names = new SingBoxNameRegistry()
  const endpointTags = new Map(ir.sources.flatMap((source) => source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies
    ? (source.proxies ?? []).map((proxy) => [proxy.id, names.allocate(proxy.name, proxy.id)] as const)
    : []))
  const strategyTags = new Map(ir.strategies.map((strategy) => [strategy.id, names.allocate(strategy.name, strategy.id)]))
  return {
    ir,
    issues,
    names,
    endpointTags,
    strategyTags,
    outbounds: new Map([['direct', { type: 'direct', tag: 'direct' }]]),
    ruleSets: new Map(),
    strategyTemplates: new Map(),
    proxySetCache: new Map(),
    materialization: createMaterializationContext(),
  }
}
