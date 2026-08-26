import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import type { ProxyFlowIR } from '../../core/ir'
import { validateIR } from '../../core/semanticValidation'
import { checkSurgeCompatibility } from './compatibility'
import { createSurgeContext } from './context'
import { planSurgeDns } from './dns'
import { surgeIssue } from './errors'
import { composeSurgeGeneral } from './general'
import { compileSurgeGeneral } from './health'
import { createSurgeProjectionContext, createSurgeTargetProjectionSummary, surgeProjectionStats, type SurgeProjectionContext } from './projection'
import { compileSurgeRules } from './rules'
import { serializeSurgeProfile } from './serializer'
import { compileSurgeStrategies } from './strategies'
import { compileSurgeNativeStrategies } from './nativeStrategies'
import type { TargetNativeStrategyIR } from '../../core/targetNative'
import type { TargetNativeRouteIR } from '../../core/targetNative'

export interface SurgeCompileOptions {
  now?: () => Date
  targetNativeStrategies?: TargetNativeStrategyIR[]
  nativeStrategies?: TargetNativeStrategyIR[]
  nativeRoutes?: TargetNativeRouteIR[]
  nativeFinalRoute?: TargetNativeRouteIR
}

export function compileSurge(ir: ProxyFlowIR, options: SurgeCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const irIssues = validateIR(ir).filter((issue) => !(issue.code === 'FINAL_MISSING' && options.nativeFinalRoute))
  const issues = irIssues.map((issue) => surgeIssue(
    `IR_${issue.code}`, issue.severity, 'ir', issue.message, issue.entity?.id ?? issue.nodeId,
  ))
  const projection = createSurgeProjectionContext()
  const nativeStrategies = options.targetNativeStrategies ?? options.nativeStrategies ?? []
  const nativeRoutes = options.nativeRoutes ?? []
  const nativeFinalRoute = options.nativeFinalRoute
  const compatibility = checkSurgeCompatibility(ir, projection, nativeStrategies)
  issues.push(...compatibility.issues)
  if (!compatibility.supported || irIssues.some((issue) => issue.severity === 'error')) return failed(
    ir, issues, generatedAt, projection,
  )

  const context = createSurgeContext(ir, issues, projection, nativeStrategies, nativeRoutes, nativeFinalRoute)
  compileSurgeStrategies(context)
  compileSurgeNativeStrategies(nativeStrategies, context)
  const rules = compileSurgeRules(context)
  const general = composeSurgeGeneral([
    compileSurgeGeneral(ir),
    planSurgeDns(ir.dns).general,
  ], issues)
  if (issues.some((issue) => issue.severity === 'error')) return failed(
    ir, issues, generatedAt, projection,
  )

  const content = serializeSurgeProfile({
    general,
    proxies: context.proxies,
    proxyGroups: context.proxyGroups,
    rules,
  })
  const finalIssues = deduplicateDiagnostics(issues)
  const targetProjection = createSurgeTargetProjectionSummary(ir, projection, finalIssues)
  return {
    success: true,
    content,
    issues: finalIssues,
    generatedAt,
    mock: false,
    stats: compileStats(projection, finalIssues, context.proxies.length, context.registeredProxyIds.size),
    targetProjection,
  }
}

function failed(
  ir: ProxyFlowIR,
  issues: CompileResult['issues'],
  generatedAt: string,
  projection: SurgeProjectionContext,
): CompileResult {
  const finalIssues = deduplicateDiagnostics(issues)
  const targetProjection = createSurgeTargetProjectionSummary(ir, projection, finalIssues)
  return {
    success: false,
    content: '',
    issues: finalIssues,
    generatedAt,
    mock: false,
    stats: compileStats(projection, finalIssues, 0, 0),
    ...(targetProjection ? { targetProjection } : {}),
  }
}

function compileStats(
  projection: SurgeProjectionContext,
  issues: CompileResult['issues'],
  proxyCount: number,
  endpointCount: number,
): NonNullable<CompileResult['stats']> {
  const projected = surgeProjectionStats(projection)
  return {
    proxyCount,
    endpointCount,
    candidateCount: projected.candidateCount,
    compatibleEndpointCount: projected.compatibleEndpointCount,
    skippedEndpointCount: projected.skippedEndpointCount,
    blockingIssueCount: issues.filter((issue) => issue.severity === 'error').length,
  }
}

export class SurgeCompiler implements ConfigCompiler {
  readonly target = 'surge' as const

  constructor(private readonly now: () => Date = () => new Date()) {}

  async compile(ir: ProxyFlowIR, options?: import('../../core/compiler').TargetCompileOptions) {
    return compileSurge(ir, {
      now: this.now,
      targetNativeStrategies: options?.targetNativeStrategies,
      nativeStrategies: options?.nativeStrategies,
      nativeRoutes: options?.nativeRoutes,
      nativeFinalRoute: options?.nativeFinalRoute,
    })
  }
}
