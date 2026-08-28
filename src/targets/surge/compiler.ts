import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import type { ProxyFlowIR } from '../../core/ir'
import type { TargetNativeFinalOptionsIR, TargetNativeFinalRouteIR, TargetNativeRouteIR, TargetNativeRouteOptionsIR, TargetNativeRuleSetSourceIR } from '../../core/targetNative'
import { isTargetNativeFinalRouteIR, isTargetNativeRouteIR, resolvesUniqueTargetNativeStrategy } from '../../core/targetNative'
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

export interface SurgeCompileOptions {
  now?: () => Date
  targetNativeStrategies?: TargetNativeStrategyIR[]
  nativeStrategies?: TargetNativeStrategyIR[]
  nativeRoutes?: TargetNativeRouteIR[]
  nativeFinalRoute?: TargetNativeFinalRouteIR
  /** Compiler-owned Project Final node identity used to bind Final options. */
  effectiveFinalNodeId?: string
  targetNativeFinalOptions?: TargetNativeFinalOptionsIR
  targetNativeRouteOptions?: TargetNativeRouteOptionsIR[]
  nativeRouteOptions?: TargetNativeRouteOptionsIR[]
  targetNativeRuleSetSources?: TargetNativeRuleSetSourceIR[]
  nativeRuleSetSources?: TargetNativeRuleSetSourceIR[]
}

export function compileSurge(ir: ProxyFlowIR, options: SurgeCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const inputIssues: CompileResult['issues'] = []
  const nativeStrategies = options.targetNativeStrategies ?? options.nativeStrategies ?? []
  const nativeRoutes = validateNativeRoutes(options.nativeRoutes, nativeStrategies, inputIssues)
  const nativeFinalRoute = validateNativeFinalRoute(
    options.nativeFinalRoute, nativeStrategies, options.effectiveFinalNodeId, inputIssues,
  )
  const irIssues = validateIR(ir).filter((issue) => !(issue.code === 'FINAL_MISSING' && nativeFinalRoute))
  const issues = [
    ...inputIssues,
    ...irIssues.map((issue) => surgeIssue(
    `IR_${issue.code}`, issue.severity, 'ir', issue.message, issue.entity?.id ?? issue.nodeId,
    )),
  ]
  const projection = createSurgeProjectionContext()
  const nativeRuleSetSources = options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? []
  const routeOptions = options.targetNativeRouteOptions ?? options.nativeRouteOptions ?? []
  const compatibility = checkSurgeCompatibility(ir, projection, nativeStrategies, nativeRuleSetSources, nativeRoutes, nativeFinalRoute, options.targetNativeFinalOptions, routeOptions, options.effectiveFinalNodeId)
  issues.push(...compatibility.issues)
  if (!compatibility.supported || irIssues.some((issue) => issue.severity === 'error')) return failed(
    ir, issues, generatedAt, projection,
  )

  const context = createSurgeContext(ir, issues, projection, nativeStrategies, nativeRoutes, nativeFinalRoute, nativeRuleSetSources, options.targetNativeFinalOptions, routeOptions)
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
      effectiveFinalNodeId: options?.effectiveFinalNodeId,
      targetNativeFinalOptions: options?.targetNativeFinalOptions,
      targetNativeRouteOptions: options?.targetNativeRouteOptions,
      nativeRouteOptions: options?.nativeRouteOptions,
      targetNativeRuleSetSources: options?.targetNativeRuleSetSources,
      nativeRuleSetSources: options?.nativeRuleSetSources,
    })
  }
}

function validateNativeRoutes(
  raw: unknown,
  nativeStrategies: readonly TargetNativeStrategyIR[],
  issues: CompileResult['issues'],
) {
  if (raw === undefined) return [] as TargetNativeRouteIR[]
  if (!Array.isArray(raw)) {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_ROUTE_INVALID', 'error', 'route',
      'Target-native routes must be supplied as an array of exact runtime route records.', 'native-routes',
    ))
    return [] as TargetNativeRouteIR[]
  }
  return raw.flatMap((route, index) => {
    if (isTargetNativeRouteIR(route) && (
      route.matcher.kind === 'source-port'
      || route.target.kind === 'strategy' && resolvesUniqueTargetNativeStrategy(route.target.id, nativeStrategies)
    )) return [route]
    reportNativeRouteBoundaryHints(route, issues)
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_ROUTE_INVALID', 'error', 'route',
      `Target-native route ${index + 1} has invalid runtime data.`, typeof (route as { id?: unknown })?.id === 'string' ? (route as { id: string }).id : 'native-route',
    ))
    return []
  })
}

function validateNativeFinalRoute(
  raw: unknown,
  nativeStrategies: readonly TargetNativeStrategyIR[],
  effectiveFinalNodeId: unknown,
  issues: CompileResult['issues'],
): TargetNativeFinalRouteIR | undefined {
  if (raw === undefined) return undefined
  if (isTargetNativeFinalRouteIR(raw)
    && typeof effectiveFinalNodeId === 'string' && Boolean(effectiveFinalNodeId.trim())
    && raw.id === effectiveFinalNodeId
    && resolvesUniqueTargetNativeStrategy(raw.target.id, nativeStrategies)) return raw
  issues.push(surgeIssue(
    'SURGE_TARGET_NATIVE_FINAL_ROUTE_INVALID', 'error', 'final',
    'Target-native Final route has invalid runtime data.', 'native-final',
  ))
  return undefined
}

/** Preserve the more specific historical diagnostics while the exact route boundary remains authoritative. */
function reportNativeRouteBoundaryHints(route: unknown, issues: CompileResult['issues']) {
  if (!route || typeof route !== 'object') return
  const candidate = route as Record<string, unknown>
  const matcher = candidate.matcher
  const provenance = candidate.targetNativeSourcePort
  const matcherKind = matcher && typeof matcher === 'object' ? (matcher as Record<string, unknown>).kind : undefined
  if (matcherKind === 'source-port' || provenance !== undefined) issues.push(surgeIssue(
    'SURGE_TARGET_NATIVE_SOURCE_PORT_INVALID', 'error', 'route',
    'Surge source-port route has invalid runtime data or owner provenance.', typeof candidate.id === 'string' ? candidate.id : 'native-route',
  ))
  if (candidate.routingOrder === undefined) issues.push(surgeIssue(
    'SURGE_ROUTE_ORDER_INVALID', 'error', 'route',
    'Target-native route ordering provenance is incomplete, duplicated, or outside the compiled route set.', 'route-order',
  ))
}
