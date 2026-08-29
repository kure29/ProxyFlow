import type { CompatibilityIssue } from '../../types/project'
import { deduplicateDiagnostics, type StructuredDiagnostic } from '../compiler/diagnostics'
import type { TargetCompileOptions } from '../compiler/compilerTypes'
import type { ProxyFlowIR, StrategyIR } from '../ir'
import { findRuleSource } from '../ir/service'
import { isUnmodeledProxy } from '../ir/source'
import { proxyCompatibilityForTarget } from './proxyCompatibility'
import {
  isTargetNativeFinalOptionsIR,
  isTargetNativeFinalRouteIR,
  isTargetNativeRouteIR,
  isTargetNativeRouteOptionsIR,
  isTargetNativeRuleSetSourceIR,
  isTargetNativeStrategyIR,
  isTargetNativeSurgeDnsBehaviorIR,
  isTargetNativeSurgeGeneralConnectivityIR,
  isTargetNativeSurgeGeneralNetworkIR,
  isTargetNativeSurgeGeneralProxyBypassIR,
  targetNativeUnsupportedIssues,
} from '../targetNative'
import {
  getTargetCapabilities,
  type CapabilityDeclaration,
  type DnsCapability,
  type PrimaryTarget,
  type StrategyCapability,
} from './targetCapabilities'

export type SupportLevel = 'exact' | 'degraded' | 'unsupported' | 'native-only'

export type CapabilityEntityType =
  | 'source'
  | 'endpoint'
  | 'transform'
  | 'strategy'
  | 'chain'
  | 'route'
  | 'dns'
  | 'output'

export interface IntentCapabilityDiagnostic extends StructuredDiagnostic {
  target: PrimaryTarget
  feature: string
  support: SupportLevel
  entityType?: CapabilityEntityType
  path?: string
}

export interface IntentCapabilityAssessment {
  target: PrimaryTarget
  support: SupportLevel
  diagnostics: IntentCapabilityDiagnostic[]
  exactCount: number
  degradedCount: number
  unsupportedCount: number
  nativeOnlyCount: number
}

export interface IntentCapabilityAssessmentOptions {
  /**
   * Optional adapter evidence for callers that have already run the target
   * compatibility checker. When omitted, the existing checker is loaded and
   * invoked without running the serializer.
   */
  compatibilityIssues?: readonly CompatibilityIssue[]
  /** Target-native data extracted by compileGraph(). */
  targetOptions?: TargetCompileOptions
}

type EvidenceAuthority = 'profile' | 'planner' | 'native' | 'adapter'

interface CapabilityObservation extends IntentCapabilityDiagnostic {
  authority: EvidenceAuthority
}

const supportRank: Record<SupportLevel, number> = {
  // Aggregate precedence is intentionally unsupported > degraded >
  // native-only > exact. Native-only remains visible through its count while
  // a real representability failure still wins the project summary.
  exact: 0,
  'native-only': 1,
  degraded: 2,
  unsupported: 3,
}

const entityRank: Record<CapabilityEntityType, number> = {
  source: 0,
  endpoint: 1,
  transform: 2,
  strategy: 3,
  chain: 4,
  route: 5,
  dns: 6,
  output: 7,
}

/**
 * Assess target representability for an already valid detached IR.
 *
 * This function intentionally does not call validateIR(): semantic validity
 * remains a separate prerequisite, while target compatibility checkers remain
 * the final source of adapter-specific evidence and compilers stay fail-closed.
 */
export async function assessIntentCapability(
  ir: ProxyFlowIR,
  target: PrimaryTarget,
  options: IntentCapabilityAssessmentOptions = {},
): Promise<IntentCapabilityAssessment> {
  const observations: CapabilityObservation[] = []
  const add = (observation: Omit<CapabilityObservation, 'target' | 'severity'>) => observations.push({
    ...observation,
    target,
    severity: severityForSupport(observation.support),
  })
  const capabilities = getTargetCapabilities(target)

  for (const source of ir.sources) {
    add(exactObservation(`source:${source.kind}`, 'source', source.id, `Source “${source.name}” is available to target assessment.`))
    if (source.kind !== 'manual-proxy' && !(source.kind === 'subscription' && source.proxies)) continue
    for (const proxy of source.proxies ?? []) {
      if (isUnmodeledProxy(proxy)) continue
      const compatibility = proxyCompatibilityForTarget(proxy, target)
      const support = compatibility.status === 'unsupported'
        ? 'unsupported'
        : compatibility.status === 'partial'
          && (compatibility.unsupportedFeatures.length > 0 || proxy.metadata?.compatibility?.status === 'partial')
          ? 'degraded'
          : 'exact'
      add({
        authority: 'profile',
        feature: `protocol:${proxy.protocol}`,
        support,
        code: support === 'exact'
          ? 'CAPABILITY_ENDPOINT_EXACT'
          : compatibility.unsupportedFeatures[0] ?? `CAPABILITY_ENDPOINT_${support === 'degraded' ? 'DEGRADED' : 'UNSUPPORTED'}`,
        message: support === 'exact'
          ? `Proxy endpoint “${proxy.name}” has no known semantic loss for ${capabilities.label}.`
          : `Proxy endpoint “${proxy.name}” is ${support} for ${capabilities.label}${compatibility.unsupportedFeatures.length ? `: ${compatibility.unsupportedFeatures.join(', ')}` : '.'}`,
        entityType: 'endpoint',
        entityId: proxy.id,
      })
    }
  }

  for (const transform of ir.transforms) add(exactObservation(
    `transform:${transform.kind}`,
    'transform',
    transform.id,
    `Transform “${transform.name}” is executed by ProxyFlow before target serialization.`,
  ))

  for (const strategy of ir.strategies) {
    const declaration = capabilities.strategies[strategyCapability(strategy)]
    let support = supportForDeclaration(declaration)
    let code = codeForDeclaration(declaration, 'CAPABILITY_STRATEGY_UNSUPPORTED')
    if (strategy.kind === 'chain') {
      const chainKind = strategy.hops.length > 1 ? 'multi-hop' : 'single-hop'
      const chainDeclaration = capabilities.chains[chainKind]
      if (supportRank[supportForDeclaration(chainDeclaration)] > supportRank[support]) {
        support = supportForDeclaration(chainDeclaration)
        code = codeForDeclaration(chainDeclaration, 'CAPABILITY_CHAIN_UNSUPPORTED')
      }
    }
    add({
      authority: 'profile',
      feature: strategy.kind === 'chain' ? 'chain' : `strategy:${strategy.kind}`,
      support,
      code: support === 'exact' ? 'CAPABILITY_STRATEGY_EXACT' : code,
      message: support === 'exact'
        ? `Strategy “${strategy.name}” is within the declared ${capabilities.label} capability boundary.`
        : `Strategy “${strategy.name}” is unsupported by the declared ${capabilities.label} capability boundary.`,
      entityType: strategy.kind === 'chain' ? 'chain' : 'strategy',
      entityId: strategy.id,
    })
  }

  for (const route of ir.routes) {
    const declaration = capabilities.routingMatchers[route.matcher.kind]
    add(declarationObservation(
      declaration,
      `routing:${route.matcher.kind}`,
      'route',
      route.id,
      `Route “${route.name}” uses ${route.matcher.kind} matching.`,
      'CAPABILITY_ROUTE_UNSUPPORTED',
    ))
    for (const source of ruleSourcesForRoute(ir, route)) {
      if (!source.format) continue
      add(declarationObservation(
        capabilities.ruleSources[source.format],
        `rule-source:${source.format}`,
        'route',
        route.id,
        `Route “${route.name}” consumes rule source “${source.id}” in ${source.format} format.`,
        'CAPABILITY_RULE_SOURCE_UNSUPPORTED',
      ))
    }
  }

  if (ir.dns?.enabled) {
    add(declarationObservation(capabilities.dns.basic, 'dns:basic', 'dns', 'dns', 'Portable DNS intent is enabled.', 'CAPABILITY_DNS_UNSUPPORTED'))
    for (const resolver of ir.dns.resolvers ?? []) {
      add(declarationObservation(
        capabilities.dns[resolver.kind],
        `dns:${resolver.kind}`,
        'dns',
        resolver.id,
        `DNS resolver “${resolver.name ?? resolver.id}” uses ${resolver.kind}.`,
        'CAPABILITY_DNS_UNSUPPORTED',
      ))
      const role = `${resolver.role ?? 'default'}-role` as DnsCapability
      add(declarationObservation(
        capabilities.dns[role],
        `dns-role:${resolver.role ?? 'default'}`,
        'dns',
        resolver.id,
        `DNS resolver “${resolver.name ?? resolver.id}” uses the ${resolver.role ?? 'default'} role.`,
        'CAPABILITY_DNS_ROLE_UNSUPPORTED',
      ))
    }
  }

  for (const output of ir.outputs.filter((candidate) => candidate.target === target && candidate.enabled)) add(exactObservation(
    'output', 'output', output.id, `Output “${output.name}” requests ${capabilities.label}.`,
  ))

  const remoteSources = ir.sources.filter((source) => source.kind === 'subscription' && source.remote)
  if (remoteSources.length > 0) {
    const { planRemoteSourceUsage } = await import('../proxySet/remoteSourcePlanner')
    for (const source of remoteSources) for (const usage of planRemoteSourceUsage(ir, source.id, capabilities.remoteProxySource)) {
      const decision = usage.plan.decision
      const requestFallbackLoss = usage.plan.diagnostics.find((diagnostic) => diagnostic.code === 'REMOTE_REQUEST_FALLBACK_NOT_PORTABLE')
      const support: SupportLevel = decision === 'unsupported'
        ? 'unsupported'
        : decision === 'native-remote' && requestFallbackLoss
          ? 'degraded'
          : 'exact'
      const decisiveDiagnostic = decision === 'unsupported'
        ? [...usage.plan.diagnostics].reverse().find((diagnostic) => diagnostic.severity === 'error')
        : requestFallbackLoss
      add({
        authority: 'planner',
        feature: `remote-source:${decision}`,
        support,
        code: decisiveDiagnostic?.code ?? (decision === 'native-remote' ? 'REMOTE_SOURCE_NATIVE' : 'CAPABILITY_REMOTE_SOURCE_MATERIALIZED'),
        message: decisiveDiagnostic?.message ?? (decision === 'native-remote'
          ? `Strategy “${usage.consumerName}” preserves “${source.name}” as a native remote source.`
          : `Strategy “${usage.consumerName}” receives the materialized result of “${source.name}” without target semantic loss.`),
        entityType: strategyEntityType(ir, usage.consumerId),
        entityId: usage.consumerId,
        path: remoteUsagePath(source.id, usage.consumerId, usage.plan.lineage.operations),
      })
    }
  }

  addNativeInventory(add, target, options.targetOptions)

  const adapterIssues = options.compatibilityIssues
    ?? await loadTargetCompatibilityEvidence(ir, target, options.targetOptions)
  const nativeUnsupported = target === 'surge' ? [] : nativeUnsupportedEvidence(ir, target, options.targetOptions)
  for (const issue of deduplicateDiagnostics([...adapterIssues, ...nativeUnsupported])) {
    if (issue.target !== target || issue.severity === 'info' || issue.feature === 'ir' || issue.code.startsWith('IR_')) continue
    const support: SupportLevel = issue.severity === 'error' ? 'unsupported' : 'degraded'
    add({
      authority: 'adapter',
      feature: issue.feature,
      support,
      code: issue.code,
      message: issue.message,
      entityType: entityTypeForFeature(issue.feature),
      entityId: issue.entityId,
    })
  }

  const diagnostics = consolidateObservations(observations)
  const counts = countSupport(diagnostics)
  return {
    target,
    support: aggregateSupport(diagnostics),
    diagnostics,
    exactCount: counts.exact,
    degradedCount: counts.degraded,
    unsupportedCount: counts.unsupported,
    nativeOnlyCount: counts['native-only'],
  }
}

function exactObservation(
  feature: string,
  entityType: CapabilityEntityType,
  entityId: string,
  message: string,
): Omit<CapabilityObservation, 'target' | 'severity'> {
  return { authority: 'profile', feature, support: 'exact', code: 'CAPABILITY_EXACT', message, entityType, entityId }
}

function declarationObservation(
  declaration: CapabilityDeclaration,
  feature: string,
  entityType: CapabilityEntityType,
  entityId: string,
  message: string,
  fallbackCode: string,
): Omit<CapabilityObservation, 'target' | 'severity'> {
  const support = supportForDeclaration(declaration)
  return {
    authority: 'profile',
    feature,
    support,
    code: support === 'exact' ? 'CAPABILITY_EXACT' : codeForDeclaration(declaration, fallbackCode),
    message: support === 'exact' ? message : `${message} ${declaration.reason ?? 'The target has no proven equivalent.'}`,
    entityType,
    entityId,
  }
}

/** Conditional/partial declarations require adapter evidence before degrading a concrete intent. */
function supportForDeclaration(declaration: CapabilityDeclaration): SupportLevel {
  return declaration.status === 'unsupported' ? 'unsupported' : 'exact'
}

function codeForDeclaration(declaration: CapabilityDeclaration, fallback: string) {
  return declaration.reason ?? fallback
}

function strategyCapability(strategy: StrategyIR): StrategyCapability {
  switch (strategy.kind) {
    case 'fixed': return 'fixed'
    case 'select': return 'manual'
    case 'auto-select': return 'auto'
    case 'fallback': return 'failover'
    case 'load-balance': return 'load-balance'
    case 'chain': return 'chain'
  }
}

function ruleSourcesForRoute(ir: ProxyFlowIR, route: ProxyFlowIR['routes'][number]) {
  if (route.matcher.kind === 'rule-set') {
    const match = findRuleSource(ir.services, route.matcher.id)
    return match ? [match.source] : []
  }
  if (route.matcher.kind !== 'service') return []
  return route.matcher.serviceIds.flatMap((serviceId) => ir.services.find((service) => service.id === serviceId)?.ruleSources ?? [])
}

function strategyEntityType(ir: ProxyFlowIR, strategyId: string): 'strategy' | 'chain' {
  return ir.strategies.find((strategy) => strategy.id === strategyId)?.kind === 'chain' ? 'chain' : 'strategy'
}

function remoteUsagePath(sourceId: string, consumerId: string, operations: readonly { id: string }[]) {
  return [`source:${sourceId}`, ...operations.map((operation) => `transform:${operation.id}`), `consumer:${consumerId}`].join('>')
}

function addNativeInventory(
  add: (observation: Omit<CapabilityObservation, 'target' | 'severity'>) => void,
  target: PrimaryTarget,
  options?: TargetCompileOptions,
) {
  if (target !== 'surge' || !options) return
  const nativeStrategies = options.targetNativeStrategies ?? options.nativeStrategies ?? []
  const nativeRuleSets = options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? []
  const routeOptions = options.targetNativeRouteOptions ?? options.nativeRouteOptions ?? []
  const nativeOnly = (feature: string, entityType: CapabilityEntityType, entityId: string | undefined, message: string, valid = true) => add({
    authority: valid ? 'native' : 'adapter',
    feature,
    support: valid ? 'native-only' : 'unsupported',
    code: valid ? 'CAPABILITY_NATIVE_ONLY' : 'CAPABILITY_NATIVE_INVALID',
    message: valid ? message : `${message} The target-native runtime record is invalid.`,
    entityType,
    entityId,
  })
  for (const strategy of nativeStrategies) {
    const record = recordFields(strategy)
    nativeOnly(
      `target-native-strategy:${typeof record.kind === 'string' ? record.kind : 'unknown'}`,
      'strategy',
      stringField(record.id),
        typeof record.name === 'string'
          ? `Strategy “${record.name}” is intentionally owned by the Surge native extension boundary.`
          : 'A strategy is intentionally owned by the Surge native extension boundary.',
      isTargetNativeStrategyIR(strategy),
    )
  }
  for (const route of options.nativeRoutes ?? []) {
    const record = recordFields(route)
    nativeOnly('target-native-route', 'route', stringField(record.id), typeof record.name === 'string' ? `Route “${record.name}” is intentionally Surge-native.` : 'A route is intentionally Surge-native.', isTargetNativeRouteIR(route))
  }
  if (options.nativeFinalRoute) {
    const record = recordFields(options.nativeFinalRoute)
    nativeOnly('target-native-final-route', 'route', stringField(record.id), typeof record.name === 'string' ? `Final route “${record.name}” is intentionally Surge-native.` : 'A Final route is intentionally Surge-native.', isTargetNativeFinalRouteIR(options.nativeFinalRoute))
  }
  for (const source of nativeRuleSets) {
    const record = recordFields(source)
    nativeOnly('target-native-rule-set', 'source', stringField(record.sourceId), typeof record.name === 'string' ? `Rule source “${record.name}” is intentionally Surge-native.` : 'A rule source is intentionally Surge-native.', isTargetNativeRuleSetSourceIR(source))
  }
  if (options.targetNativeFinalOptions) nativeOnly('target-native-final-options', 'route', stringField(recordFields(options.targetNativeFinalOptions).finalNodeId), 'Final options are intentionally Surge-native.', isTargetNativeFinalOptionsIR(options.targetNativeFinalOptions))
  for (const route of routeOptions) nativeOnly('target-native-route-options', 'route', stringField(recordFields(route).routeId), 'Route options are intentionally Surge-native.', isTargetNativeRouteOptionsIR(route))
  if (options.targetNativeSurgeGeneralNetwork) nativeOnly('target-native-general-network', 'output', stringField(recordFields(options.targetNativeSurgeGeneralNetwork).outputNodeId), 'General Network settings are intentionally Surge-native.', isTargetNativeSurgeGeneralNetworkIR(options.targetNativeSurgeGeneralNetwork))
  if (options.targetNativeSurgeGeneralConnectivity) nativeOnly('target-native-general-connectivity', 'output', stringField(recordFields(options.targetNativeSurgeGeneralConnectivity).outputNodeId), 'General Connectivity settings are intentionally Surge-native.', isTargetNativeSurgeGeneralConnectivityIR(options.targetNativeSurgeGeneralConnectivity))
  if (options.targetNativeSurgeGeneralProxyBypass) nativeOnly('target-native-proxy-bypass', 'output', stringField(recordFields(options.targetNativeSurgeGeneralProxyBypass).outputNodeId), 'Proxy Bypass settings are intentionally Surge-native.', isTargetNativeSurgeGeneralProxyBypassIR(options.targetNativeSurgeGeneralProxyBypass))
  if (options.targetNativeSurgeDnsBehavior) nativeOnly('target-native-dns-behavior', 'dns', stringField(recordFields(options.targetNativeSurgeDnsBehavior).dnsNodeId), 'DNS behavior is intentionally Surge-native.', isTargetNativeSurgeDnsBehaviorIR(options.targetNativeSurgeDnsBehavior))
}

function recordFields(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

async function loadTargetCompatibilityEvidence(
  ir: ProxyFlowIR,
  target: PrimaryTarget,
  options: TargetCompileOptions = {},
): Promise<CompatibilityIssue[]> {
  switch (target) {
    case 'mihomo': {
      const { checkMihomoCompatibility } = await import('../../targets/mihomo/compatibility')
      return checkMihomoCompatibility(ir).issues
    }
    case 'sing-box': {
      const { checkSingBoxCompatibility } = await import('../../targets/singbox/compatibility')
      return checkSingBoxCompatibility(ir).issues
    }
    case 'surge': {
      const { checkSurgeCompatibility } = await import('../../targets/surge/compatibility')
      return checkSurgeCompatibility(
        ir,
        undefined,
        options.targetNativeStrategies ?? options.nativeStrategies ?? [],
        options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? [],
        options.nativeRoutes ?? [],
        options.nativeFinalRoute,
        options.targetNativeFinalOptions,
        options.targetNativeRouteOptions ?? options.nativeRouteOptions ?? [],
        options.effectiveFinalNodeId,
      ).issues
    }
    case 'loon': {
      const { checkLoonCompatibility } = await import('../../targets/loon/compatibility')
      return checkLoonCompatibility(ir).issues
    }
    case 'shadowrocket': {
      const { checkShadowrocketCompatibility } = await import('../../targets/shadowrocket/compatibility')
      return checkShadowrocketCompatibility(ir).issues
    }
  }
}

function nativeUnsupportedEvidence(
  ir: ProxyFlowIR,
  target: PrimaryTarget,
  options: TargetCompileOptions = {},
) {
  return targetNativeUnsupportedIssues(
    target,
    options.targetNativeStrategies ?? options.nativeStrategies ?? [],
    options.nativeRoutes ?? [],
    options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? [],
    options.targetNativeFinalOptions,
    options.targetNativeRouteOptions ?? options.nativeRouteOptions ?? [],
    options.nativeFinalRoute,
    options.targetNativeSurgeGeneralNetwork,
    options.outputNodeId,
    ir.outputs,
    options.targetNativeSurgeGeneralConnectivity,
    options.targetNativeSurgeDnsBehavior,
    options.effectiveDnsNodeId,
    options.targetNativeSurgeGeneralProxyBypass,
  )
}

function entityTypeForFeature(feature: string): CapabilityEntityType | undefined {
  if (feature.includes('dns')) return 'dns'
  if (feature.includes('source-port') || feature.includes('route') || feature.includes('final')
    || feature.includes('rule-set') || feature.includes('rule-source') || feature.includes('service-rule')) return 'route'
  if (feature.includes('general') || feature.includes('proxy-bypass') || feature.includes('output')
    || feature.includes('profile') || feature.includes('inbound')) return 'output'
  if (feature.includes('chain')) return 'chain'
  if (feature.includes('strategy')) return 'strategy'
  if (feature.includes('transform')) return 'transform'
  if (feature.includes('endpoint') || feature.includes('proxy')) return 'endpoint'
  if (feature.includes('source') || feature.includes('provider')) return 'source'
  return undefined
}

function consolidateObservations(observations: CapabilityObservation[]): IntentCapabilityDiagnostic[] {
  const strongestByBucket = new Map<string, number>()
  for (const observation of observations) {
    const bucket = observationBucket(observation)
    strongestByBucket.set(bucket, Math.max(strongestByBucket.get(bucket) ?? -1, supportRank[observation.support]))
  }
  const strongest = observations.filter((observation) => supportRank[observation.support] === strongestByBucket.get(observationBucket(observation)))
  const adapterBuckets = new Set(strongest.filter((observation) => observation.authority === 'adapter').map(observationBucket))
  const preferred = strongest.filter((observation) => !adapterBuckets.has(observationBucket(observation)) || observation.authority === 'adapter')
  const seen = new Set<string>()
  return preferred
    .sort(compareObservations)
    .filter((observation) => {
      const key = [observation.target, observation.support, observation.code, observation.feature, observation.entityType, observation.entityId, observation.path, observation.message].join('\u0000')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(({ authority: _authority, ...diagnostic }) => diagnostic)
}

function observationBucket(observation: CapabilityObservation) {
  if (observation.entityType || observation.entityId) return [observation.entityType ?? '', observation.entityId ?? '', observation.path ?? ''].join('\u0000')
  return [observation.feature, observation.path ?? ''].join('\u0000')
}

function compareObservations(left: CapabilityObservation, right: CapabilityObservation) {
  return (entityRank[left.entityType ?? 'output'] - entityRank[right.entityType ?? 'output'])
    || (left.entityId ?? '').localeCompare(right.entityId ?? '')
    || (left.path ?? '').localeCompare(right.path ?? '')
    || supportRank[right.support] - supportRank[left.support]
    || left.code.localeCompare(right.code)
    || left.feature.localeCompare(right.feature)
    || left.message.localeCompare(right.message)
}

function severityForSupport(support: SupportLevel): StructuredDiagnostic['severity'] {
  if (support === 'unsupported') return 'error'
  if (support === 'degraded') return 'warning'
  return 'info'
}

function aggregateSupport(diagnostics: readonly IntentCapabilityDiagnostic[]): SupportLevel {
  return diagnostics.reduce<SupportLevel>((current, diagnostic) => supportRank[diagnostic.support] > supportRank[current] ? diagnostic.support : current, 'exact')
}

function countSupport(diagnostics: readonly IntentCapabilityDiagnostic[]) {
  const counts: Record<SupportLevel, number> = { exact: 0, degraded: 0, unsupported: 0, 'native-only': 0 }
  for (const diagnostic of diagnostics) counts[diagnostic.support] += 1
  return counts
}
