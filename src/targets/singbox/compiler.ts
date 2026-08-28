import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { ProxyFlowIR } from '../../core/ir'
import { validateIR } from '../../core/semanticValidation'
import { compileSingBoxChains } from './chain'
import { checkSingBoxCompatibility } from './compatibility'
import { createSingBoxContext } from './context'
import { compileSingBoxDns } from './dns'
import { singBoxIssue } from './errors'
import type { SingBoxConfig } from './model'
import { compileSingBoxProxyOutbounds } from './outbounds'
import { compileSingBoxRouting } from './rules'
import { serializeSingBoxConfig } from './serializer'
import { compileSingBoxStrategies } from './strategies'
import { targetNativeUnsupportedIssues, type TargetNativeFinalOptionsIR, type TargetNativeStrategyIR, type TargetNativeSurgeDnsBehaviorIR, type TargetNativeSurgeGeneralConnectivityIR, type TargetNativeSurgeGeneralNetworkIR } from '../../core/targetNative'

export interface SingBoxCompileOptions {
  now?: () => Date
  outputNodeId?: string
  targetNativeStrategies?: TargetNativeStrategyIR[]
  nativeStrategies?: TargetNativeStrategyIR[]
  nativeRoutes?: import('../../core/targetNative').TargetNativeRouteIR[]
  nativeFinalRoute?: import('../../core/targetNative').TargetNativeFinalRouteIR
  targetNativeFinalOptions?: TargetNativeFinalOptionsIR
  targetNativeRouteOptions?: import('../../core/targetNative').TargetNativeRouteOptionsIR[]
  nativeRouteOptions?: import('../../core/targetNative').TargetNativeRouteOptionsIR[]
  targetNativeRuleSetSources?: import('../../core/targetNative').TargetNativeRuleSetSourceIR[]
  nativeRuleSetSources?: import('../../core/targetNative').TargetNativeRuleSetSourceIR[]
  targetNativeSurgeGeneralNetwork?: TargetNativeSurgeGeneralNetworkIR
  targetNativeSurgeGeneralConnectivity?: TargetNativeSurgeGeneralConnectivityIR
  targetNativeSurgeDnsBehavior?: TargetNativeSurgeDnsBehaviorIR
  effectiveDnsNodeId?: string
}

export function compileSingBox(ir: ProxyFlowIR, options: SingBoxCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const irIssues = validateIR(ir)
  const issues = irIssues.map((issue) => singBoxIssue(
    `IR_${issue.code}`, issue.severity, 'ir', issue.message, issue.entity?.id ?? issue.nodeId,
  ))
  const nativeStrategies = options.targetNativeStrategies ?? options.nativeStrategies ?? []
  const nativeRuleSetSources = options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? []
  issues.push(...targetNativeUnsupportedIssues('sing-box', nativeStrategies, options.nativeRoutes ?? [], nativeRuleSetSources, options.targetNativeFinalOptions, options.targetNativeRouteOptions ?? options.nativeRouteOptions, options.nativeFinalRoute, options.targetNativeSurgeGeneralNetwork, options.outputNodeId, ir.outputs, options.targetNativeSurgeGeneralConnectivity, options.targetNativeSurgeDnsBehavior, options.effectiveDnsNodeId))
  const compatibility = checkSingBoxCompatibility(ir)
  issues.push(...compatibility.issues)
  if (!compatibility.supported || irIssues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt)

  const context = createSingBoxContext(ir, issues)
  const dns = compileSingBoxDns(ir.dns, context)
  compileSingBoxProxyOutbounds(context)
  compileSingBoxStrategies(context)
  compileSingBoxChains(context)
  const routing = compileSingBoxRouting(context)
  if (issues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt)

  const config: SingBoxConfig = {
    log: { level: 'info' },
    ...(dns ? { dns } : {}),
    outbounds: [...context.outbounds.values()],
    route: {
      rules: routing.rules,
      ...(context.ruleSets.size > 0 ? { rule_set: [...context.ruleSets.values()] } : {}),
      final: routing.final,
      ...(context.dnsTag ? { default_domain_resolver: context.dnsTag } : {}),
    },
  }
  const proxyCount = [...context.endpointTags.values()].filter((tag) => context.outbounds.has(tag)).length
  return {
    success: true,
    content: serializeSingBoxConfig(config),
    issues: deduplicateDiagnostics(issues),
    generatedAt,
    mock: false,
    stats: { proxyCount, endpointCount: proxyCount },
  }
}

function failed(issues: CompileResult['issues'], generatedAt: string): CompileResult {
  return { success: false, content: '', issues: deduplicateDiagnostics(issues), generatedAt, mock: false }
}

export class SingBoxCompiler implements ConfigCompiler {
  readonly target = 'sing-box' as const

  constructor(private readonly now: () => Date = () => new Date()) {}

  async compile(ir: ProxyFlowIR, options?: import('../../core/compiler').TargetCompileOptions) {
    return compileSingBox(ir, { now: this.now, outputNodeId: options?.outputNodeId, targetNativeStrategies: options?.targetNativeStrategies, nativeStrategies: options?.nativeStrategies, nativeRoutes: options?.nativeRoutes, nativeFinalRoute: options?.nativeFinalRoute, targetNativeFinalOptions: options?.targetNativeFinalOptions, targetNativeRouteOptions: options?.targetNativeRouteOptions, nativeRouteOptions: options?.nativeRouteOptions, targetNativeRuleSetSources: options?.targetNativeRuleSetSources, nativeRuleSetSources: options?.nativeRuleSetSources, targetNativeSurgeGeneralNetwork: options?.targetNativeSurgeGeneralNetwork, targetNativeSurgeGeneralConnectivity: options?.targetNativeSurgeGeneralConnectivity, targetNativeSurgeDnsBehavior: options?.targetNativeSurgeDnsBehavior, effectiveDnsNodeId: options?.effectiveDnsNodeId })
  }
}
