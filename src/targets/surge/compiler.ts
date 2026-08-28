import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import type { ProxyFlowIR } from '../../core/ir'
import type { TargetNativeFinalOptionsIR, TargetNativeFinalRouteIR, TargetNativeRouteIR, TargetNativeRouteOptionsIR, TargetNativeRuleSetSourceIR, TargetNativeSurgeDnsBehaviorIR, TargetNativeSurgeGeneralConnectivityIR, TargetNativeSurgeGeneralNetworkIR } from '../../core/targetNative'
import { classifySurgeVifRouteIssue, isTargetNativeFinalRouteIR, isTargetNativeRouteIR, isTargetNativeSurgeDnsBehaviorIR, isTargetNativeSurgeGeneralConnectivityIR, isTargetNativeSurgeGeneralNetworkIR, resolvesUniqueTargetNativeStrategy } from '../../core/targetNative'
import { validateIR } from '../../core/semanticValidation'
import { parseCidr } from '../../core/network/cidr'
import { checkSurgeCompatibility } from './compatibility'
import { createSurgeContext } from './context'
import { planSurgeDns } from './dns'
import { surgeIssue } from './errors'
import { compileSurgeDnsBehavior, compileSurgeGeneralConnectivity, compileSurgeGeneralNetwork, composeSurgeGeneral } from './general'
import { compileSurgeGeneral } from './health'
import { createSurgeProjectionContext, createSurgeTargetProjectionSummary, surgeProjectionStats, type SurgeProjectionContext } from './projection'
import { compileSurgeRules } from './rules'
import { serializeSurgeProfile } from './serializer'
import { compileSurgeStrategies } from './strategies'
import { compileSurgeNativeStrategies } from './nativeStrategies'
import type { TargetNativeStrategyIR } from '../../core/targetNative'

export interface SurgeCompileOptions {
  now?: () => Date
  /** Compiler-selected Output owner for output-scoped target-native state. */
  outputNodeId?: string
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
  targetNativeSurgeGeneralNetwork?: TargetNativeSurgeGeneralNetworkIR
  targetNativeSurgeGeneralConnectivity?: TargetNativeSurgeGeneralConnectivityIR
  /** DNS-node-owned Surge-native DNS behavior. */
  targetNativeSurgeDnsBehavior?: TargetNativeSurgeDnsBehaviorIR
  /** Compiler-owned effective DNS graph owner identity. */
  effectiveDnsNodeId?: string
}

export function compileSurge(ir: ProxyFlowIR, options: SurgeCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const inputIssues: CompileResult['issues'] = []
  const nativeStrategies = options.targetNativeStrategies ?? options.nativeStrategies ?? []
  const targetNativeSurgeGeneralNetwork = validateSurgeGeneralNetwork(
    options.targetNativeSurgeGeneralNetwork, options.outputNodeId, ir, inputIssues,
  )
  const targetNativeSurgeGeneralConnectivity = validateSurgeGeneralConnectivity(
    options.targetNativeSurgeGeneralConnectivity, options.outputNodeId, ir, inputIssues,
  )
  const targetNativeSurgeDnsBehavior = validateSurgeDnsBehavior(
    options.targetNativeSurgeDnsBehavior, options.effectiveDnsNodeId, inputIssues,
  )
  const nativeRoutes = validateNativeRoutes(options.nativeRoutes, nativeStrategies, inputIssues)
  const nativeFinalRoute = validateNativeFinalRoute(
    options.nativeFinalRoute, nativeStrategies, options.effectiveFinalNodeId, inputIssues,
  )
  let irIssues
  try {
    irIssues = validateIR(ir).filter((issue) => !(issue.code === 'FINAL_MISSING' && nativeFinalRoute))
  } catch {
    return failed(ir, [
      ...inputIssues,
      surgeIssue(
        'SURGE_IR_VALIDATION_EXCEPTION', 'error', 'ir',
        'Universal IR validation failed closed because the runtime IR is malformed.', 'ir',
      ),
    ], generatedAt, createSurgeProjectionContext())
  }
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
  if (!compatibility.supported || issues.some((issue) => issue.severity === 'error') || irIssues.some((issue) => issue.severity === 'error')) return failed(
    ir, issues, generatedAt, projection,
  )

  const context = createSurgeContext(ir, issues, projection, nativeStrategies, nativeRoutes, nativeFinalRoute, nativeRuleSetSources, options.targetNativeFinalOptions, routeOptions)
  compileSurgeStrategies(context)
  compileSurgeNativeStrategies(nativeStrategies, context)
  const rules = compileSurgeRules(context)
  const general = composeSurgeGeneral([
    compileSurgeGeneral(ir, nativeStrategies),
    compileSurgeGeneralConnectivity(targetNativeSurgeGeneralConnectivity),
    compileSurgeGeneralNetwork(targetNativeSurgeGeneralNetwork),
    planSurgeDns(ir.dns).general,
    compileSurgeDnsBehavior(targetNativeSurgeDnsBehavior),
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
  let targetProjection: ReturnType<typeof createSurgeTargetProjectionSummary> | undefined
  try {
    targetProjection = createSurgeTargetProjectionSummary(ir, projection, finalIssues)
  } catch {
    // A malformed runtime IR must still produce the stable empty-content
    // failure contract even when projection diagnostics cannot be derived.
    targetProjection = undefined
  }
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
      outputNodeId: options?.outputNodeId,
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
      targetNativeSurgeGeneralNetwork: options?.targetNativeSurgeGeneralNetwork,
      targetNativeSurgeGeneralConnectivity: options?.targetNativeSurgeGeneralConnectivity,
      targetNativeSurgeDnsBehavior: options?.targetNativeSurgeDnsBehavior,
      effectiveDnsNodeId: options?.effectiveDnsNodeId,
    })
  }
}

function validateSurgeDnsBehavior(
  raw: unknown,
  effectiveDnsNodeId: unknown,
  issues: CompileResult['issues'],
): TargetNativeSurgeDnsBehaviorIR | undefined {
  if (raw === undefined) return undefined
  if (!isTargetNativeSurgeDnsBehaviorIR(raw)) {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_DNS_INVALID', 'error', 'general',
      'Target-native Surge DNS behavior contains invalid runtime data.',
      readRuntimeDnsNodeId(raw) ?? 'dns-behavior',
    ))
    return undefined
  }
  let validated: TargetNativeSurgeDnsBehaviorIR
  try {
    validated = structuredClone(raw)
  } catch {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_DNS_INVALID', 'error', 'general',
      'Target-native Surge DNS behavior contains unserialisable runtime data.',
      raw.dnsNodeId,
    ))
    return undefined
  }
  if (!isTargetNativeSurgeDnsBehaviorIR(validated)) {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_DNS_INVALID', 'error', 'general',
      'Target-native Surge DNS behavior changed during runtime validation.',
      raw.dnsNodeId,
    ))
    return undefined
  }
  if (typeof effectiveDnsNodeId !== 'string' || !effectiveDnsNodeId.trim() || validated.dnsNodeId !== effectiveDnsNodeId) {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_DNS_OWNER_MISMATCH', 'error', 'general',
      'Target-native Surge DNS behavior does not belong to the compiler-selected DNS owner.',
      validated.dnsNodeId,
    ))
    return undefined
  }
  return validated
}

function validateSurgeGeneralConnectivity(
  raw: unknown,
  outputNodeId: unknown,
  ir: ProxyFlowIR,
  issues: CompileResult['issues'],
): TargetNativeSurgeGeneralConnectivityIR | undefined {
  if (raw === undefined) return undefined
  if (!isTargetNativeSurgeGeneralConnectivityIR(raw)) {
    issues.push(surgeIssue('SURGE_TARGET_NATIVE_GENERAL_INVALID', 'error', 'general', 'Target-native Surge General Connectivity settings contain invalid runtime data.', readRuntimeOutputNodeId(raw) ?? 'general-connectivity'))
    return undefined
  }
  let validated: TargetNativeSurgeGeneralConnectivityIR
  try { validated = structuredClone(raw) } catch {
    issues.push(surgeIssue('SURGE_TARGET_NATIVE_GENERAL_INVALID', 'error', 'general', 'Target-native Surge General Connectivity settings contain unserialisable runtime data.', raw.outputNodeId))
    return undefined
  }
  if (!isTargetNativeSurgeGeneralConnectivityIR(validated)) {
    issues.push(surgeIssue('SURGE_TARGET_NATIVE_GENERAL_INVALID', 'error', 'general', 'Target-native Surge General Connectivity settings changed during runtime validation.', raw.outputNodeId))
    return undefined
  }
  if (typeof outputNodeId !== 'string' || !outputNodeId.trim() || validated.outputNodeId !== outputNodeId) {
    issues.push(surgeIssue('SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH', 'error', 'general', 'Target-native Surge General Connectivity settings do not belong to the compiler-selected Output.', validated.outputNodeId))
    return undefined
  }
  const outputs = readRuntimeOutputs(ir)
  let owners: Array<{ id?: unknown; enabled?: unknown; target?: unknown }> = []
  let surgeOwners: Array<{ id?: unknown; enabled?: unknown; target?: unknown }> = []
  try {
    owners = outputs?.filter((output) => output.id === outputNodeId) ?? []
    surgeOwners = outputs?.filter((output) => isSurgeOutputCandidate(output)) ?? []
  } catch { owners = []; surgeOwners = [] }
  if (!outputs || owners.length !== 1 || surgeOwners.length !== 1 || !isEnabledSurgeOutput(owners[0])) {
    issues.push(surgeIssue('SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH', 'error', 'general', 'Target-native Surge General Connectivity settings do not resolve to one enabled Surge Output.', outputNodeId))
    return undefined
  }
  return validated
}

function validateSurgeGeneralNetwork(
  raw: unknown,
  outputNodeId: unknown,
  ir: ProxyFlowIR,
  issues: CompileResult['issues'],
): TargetNativeSurgeGeneralNetworkIR | undefined {
  if (raw === undefined) return undefined
  const routeIssue = classifySurgeVifRouteIssue(raw)
  if (routeIssue) {
    issues.push(surgeIssue(routeIssue, 'error', 'general', 'Surge VIF route controls contain invalid or unsafe CIDR semantics.', readRuntimeOutputNodeId(raw) ?? 'general-network'))
    return undefined
  }
  if (!isTargetNativeSurgeGeneralNetworkIR(raw)) {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_GENERAL_INVALID', 'error', 'general',
      'Target-native Surge General Network settings contain invalid runtime data.',
      readRuntimeOutputNodeId(raw) ?? 'general-network',
    ))
    return undefined
  }
  let validated: TargetNativeSurgeGeneralNetworkIR
  try {
    // Snapshot the untrusted runtime value before using it for lowering.  A
    // getter/proxy must not be able to change semantic fields between guard
    // validation and serialization.
    validated = structuredClone(raw)
  } catch {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_GENERAL_INVALID', 'error', 'general',
      'Target-native Surge General Network settings contain unserialisable runtime data.',
      readRuntimeOutputNodeId(raw) ?? 'general-network',
    ))
    return undefined
  }
  if (!isTargetNativeSurgeGeneralNetworkIR(validated)) {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_GENERAL_INVALID', 'error', 'general',
      'Target-native Surge General Network settings changed during runtime validation.',
      readRuntimeOutputNodeId(raw) ?? 'general-network',
    ))
    return undefined
  }
  if (typeof outputNodeId !== 'string' || !outputNodeId.trim() || validated.outputNodeId !== outputNodeId) {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH', 'error', 'general',
      'Target-native Surge General Network settings do not belong to the compiler-selected Output.',
      validated.outputNodeId,
    ))
    return undefined
  }
  const outputs = readRuntimeOutputs(ir)
  let owners: Array<{ id?: unknown; enabled?: unknown; target?: unknown }> = []
  let surgeOwners: Array<{ id?: unknown; enabled?: unknown; target?: unknown }> = []
  try {
    owners = outputs?.filter((output) => output.id === outputNodeId) ?? []
    // Every non-disabled Surge Output participates in the owner decision. A
    // malformed `enabled` value is treated as active/unsafe instead of being
    // silently ignored as a second owner.
    surgeOwners = outputs?.filter((output) => isSurgeOutputCandidate(output)) ?? []
  } catch {
    owners = []
    surgeOwners = []
  }
  if (!outputs || owners.length !== 1 || surgeOwners.length !== 1 || !isEnabledSurgeOutput(owners[0])) {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH', 'error', 'general',
      'Target-native Surge General Network settings do not resolve to one enabled Surge Output.',
      outputNodeId,
    ))
    return undefined
  }
  addSurgeVifWarnings(validated, issues)
  return validated
}

function addSurgeVifWarnings(network: TargetNativeSurgeGeneralNetworkIR, issues: CompileResult['issues']) {
  const routes = [...(network.tunExcludedRoutes ?? []), ...(network.tunIncludedRoutes ?? [])]
  const hasIpv6 = routes.some((route) => {
    const parsed = parseCidr(route, 'strict')
    return parsed.ok && parsed.cidr.family === 'ipv6'
  })
  if (hasIpv6 && network.ipv6Vif === 'auto') issues.push(surgeIssue(
    'SURGE_GENERAL_VIF_IPV6_VIF_CONDITIONAL', 'warning', 'general',
    'IPv6 VIF routes are conditional because ipv6-vif is set to auto.', network.outputNodeId,
  ))
  const broadPrivate = new Set(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'])
  if ((network.tunIncludedRoutes ?? []).some((route) => broadPrivate.has(route))) issues.push(surgeIssue(
    'SURGE_GENERAL_VIF_PRIVATE_RANGE', 'warning', 'general',
    'Included VIF routes contain a broad RFC1918 range. Surge warns that broad private included routes are usually unnecessary and may cause system routing issues. Verify that this VIF capture route is intentional.', network.outputNodeId,
  ))
}

function readRuntimeOutputNodeId(value: unknown): string | undefined {
  try {
    if (!value || typeof value !== 'object') return undefined
    const outputNodeId = (value as { outputNodeId?: unknown }).outputNodeId
    return typeof outputNodeId === 'string' ? outputNodeId : undefined
  } catch {
    return undefined
  }
}

function readRuntimeDnsNodeId(value: unknown): string | undefined {
  try {
    if (!value || typeof value !== 'object') return undefined
    const dnsNodeId = (value as { dnsNodeId?: unknown }).dnsNodeId
    return typeof dnsNodeId === 'string' ? dnsNodeId : undefined
  } catch {
    return undefined
  }
}

function readRuntimeOutputs(ir: unknown): Array<{ id?: unknown; enabled?: unknown; target?: unknown }> | undefined {
  try {
    const outputs = (ir as { outputs?: unknown } | null | undefined)?.outputs
    if (!Array.isArray(outputs)) return undefined
    const snapshot = structuredClone(outputs)
    return Array.isArray(snapshot) ? snapshot as Array<{ id?: unknown; enabled?: unknown; target?: unknown }> : undefined
  } catch {
    return undefined
  }
}

function isEnabledSurgeOutput(value: unknown): value is { id: string; enabled: true; target: 'surge' } {
  try {
    return Boolean(value && typeof value === 'object'
      && typeof (value as { id?: unknown }).id === 'string'
      && Boolean((value as { id: string }).id.trim())
      && (value as { enabled?: unknown }).enabled === true
      && (value as { target?: unknown }).target === 'surge')
  } catch {
    return false
  }
}

function isSurgeOutputCandidate(value: unknown): boolean {
  try {
    if (!value || typeof value !== 'object') return false
    const output = value as { target?: unknown; enabled?: unknown }
    return output.target === 'surge' && output.enabled !== false
  } catch {
    return false
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
