import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import type { ProxyFlowIR } from '../../core/ir'
import { validateIR } from '../../core/semanticValidation'
import { checkShadowrocketCompatibility } from './compatibility'
import { createShadowrocketContext } from './context'
import { planShadowrocketDns } from './dns'
import { shadowrocketIssue } from './errors'
import { compileShadowrocketRouting } from './routing'
import { serializeShadowrocketProfile } from './serializer'
import { compileShadowrocketStrategies } from './strategies'
import { createShadowrocketProjectionContext, shadowrocketProjectionStats } from './projection'
import { targetNativeUnsupportedIssues, type TargetNativeFinalOptionsIR, type TargetNativeStrategyIR } from '../../core/targetNative'

export interface ShadowrocketCompileOptions { now?: () => Date; targetNativeStrategies?: TargetNativeStrategyIR[]; nativeStrategies?: TargetNativeStrategyIR[]; nativeRoutes?: import('../../core/targetNative').TargetNativeRouteIR[]; nativeFinalRoute?: import('../../core/targetNative').TargetNativeRouteIR; targetNativeFinalOptions?: TargetNativeFinalOptionsIR; targetNativeRuleSetSources?: import('../../core/targetNative').TargetNativeRuleSetSourceIR[]; nativeRuleSetSources?: import('../../core/targetNative').TargetNativeRuleSetSourceIR[] }

export function compileShadowrocket(ir: ProxyFlowIR, options: ShadowrocketCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const projection = createShadowrocketProjectionContext()
  const issues: CompileResult['issues'] = []
  try {
    let irIssues
    try {
      irIssues = validateIR(ir)
    } catch {
      issues.push(shadowrocketIssue('IR_VALIDATION_EXCEPTION', 'error', 'ir', 'Universal IR validation failed closed because the deserialized project contains malformed runtime data.', 'ir'))
      return failed(issues, generatedAt, projection)
    }
    issues.push(...irIssues.map((issue) => shadowrocketIssue(`IR_${issue.code}`, issue.severity, 'ir', issue.message, issue.entity?.id ?? issue.nodeId)))
    const nativeStrategies = options.targetNativeStrategies ?? options.nativeStrategies ?? []
    const nativeRuleSetSources = options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? []
    issues.push(...targetNativeUnsupportedIssues('shadowrocket', nativeStrategies, [...(options.nativeRoutes ?? []), ...(options.nativeFinalRoute ? [options.nativeFinalRoute] : [])], nativeRuleSetSources, options.targetNativeFinalOptions))
    let compatibility
    try {
      compatibility = checkShadowrocketCompatibility(ir, projection)
    } catch {
      issues.push(shadowrocketIssue('SHADOWROCKET_COMPATIBILITY_EXCEPTION', 'error', 'compatibility', 'Shadowrocket compatibility validation rejected malformed runtime data.', 'shadowrocket'))
      return failed(issues, generatedAt, projection)
    }
    issues.push(...compatibility.issues)
    if (!compatibility.supported || irIssues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt, projection)
    const context = createShadowrocketContext(ir, issues, projection)
    compileShadowrocketStrategies(context)
    const rules = compileShadowrocketRouting(ir, context.strategyNames, context.compiledStrategyIds, context.blockedStrategyIds, issues)
    const dns = planShadowrocketDns(ir.dns)
    issues.push(...dns.issues)
    if (issues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt, projection)
    let content: string
    try { content = serializeShadowrocketProfile({ general: dns.general, proxies: context.proxies, proxyGroups: context.proxyGroups, rules }) }
    catch (error) { issues.push(shadowrocketIssue('SHADOWROCKET_SERIALIZER_UNSAFE_VALUE', 'error', 'serialization', error instanceof Error ? error.message : 'Shadowrocket serializer rejected an unsafe value.', 'serializer')); return failed(issues, generatedAt, projection) }
    const finalIssues = deduplicateDiagnostics(issues)
    return { success: true, content, issues: finalIssues, generatedAt, mock: false, stats: compileStats(projection, finalIssues, context.proxies.length, context.registeredProxyIds.size) }
  } catch {
    issues.push(shadowrocketIssue('SHADOWROCKET_COMPILER_EXCEPTION', 'error', 'compiler', 'Shadowrocket compilation failed closed because the runtime project data was malformed.', 'shadowrocket'))
    return failed(issues, generatedAt, projection)
  }
}

function failed(issues: CompileResult['issues'], generatedAt: string, projection: ReturnType<typeof createShadowrocketProjectionContext>): CompileResult { const finalIssues = deduplicateDiagnostics(issues); return { success: false, content: '', issues: finalIssues, generatedAt, mock: false, stats: compileStats(projection, finalIssues, 0, 0) } }
function compileStats(projection: ReturnType<typeof createShadowrocketProjectionContext>, issues: CompileResult['issues'], proxyCount: number, endpointCount: number) { const projected = shadowrocketProjectionStats(projection); return { proxyCount, endpointCount, candidateCount: projected.candidateCount, compatibleEndpointCount: projected.compatibleEndpointCount, skippedEndpointCount: projected.skippedEndpointCount, blockingIssueCount: issues.filter((issue) => issue.severity === 'error').length } }

export class ShadowrocketCompiler implements ConfigCompiler {
  readonly target = 'shadowrocket' as const
  constructor(private readonly now: () => Date = () => new Date()) {}
  async compile(ir: ProxyFlowIR, options?: import('../../core/compiler').TargetCompileOptions) { return compileShadowrocket(ir, { now: this.now, targetNativeStrategies: options?.targetNativeStrategies, nativeStrategies: options?.nativeStrategies, nativeRoutes: options?.nativeRoutes, nativeFinalRoute: options?.nativeFinalRoute, targetNativeFinalOptions: options?.targetNativeFinalOptions, targetNativeRuleSetSources: options?.targetNativeRuleSetSources, nativeRuleSetSources: options?.nativeRuleSetSources }) }
}
