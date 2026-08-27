import type { ProxyFlowIR, ProxySetRef, StrategyIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { planSurgeDns } from './dns'
import { surgeIssue } from './errors'
import {
  createSurgeProjectionContext,
  projectSurgeFixedEndpoint,
  projectSurgeProxySet,
  surgeProxySetProjectionIssues,
  surgeStrategyNoMemberIssue,
  type SurgeProjectionContext,
} from './projection'
import { resolveSurgeServiceRuleSource } from './serviceRules'
import { isSafeSurgePolicyName } from './serializer'
import { validateSurgeNativeStrategies } from './nativeStrategies'
import type { TargetNativeFinalOptionsIR, TargetNativeRouteIR, TargetNativeRouteOptionsIR, TargetNativeStrategyIR } from '../../core/targetNative'
import { isTargetNativeFinalOptionsIR, isTargetNativeRouteOptionsIR } from '../../core/targetNative'
import { isTargetNativeSourcePortIR, isTargetNativeSourcePortMatcher } from '../../core/targetNative'
import type { TargetNativeRuleSetSourceIR } from '../../core/targetNative'
import { SURGE_NO_RESOLVE_MATCHERS } from '../../core/routing/routeOptionsProductModel'
import { resolveSurgeBuiltinRuleSetName } from './ruleSets'

export interface SurgeCompatibilityResult {
  supported: boolean
  issues: CompatibilityIssue[]
}

const BUILT_IN_POLICIES = new Set([
  'direct', 'reject', 'reject-drop', 'reject-no-drop', 'reject-tinygif',
  'cellular', 'cellular-only', 'hybrid', 'no-hybrid',
])

export function checkSurgeCompatibility(
  ir: ProxyFlowIR,
  projection = createSurgeProjectionContext(),
  nativeStrategies: readonly TargetNativeStrategyIR[] = [],
  nativeRuleSetSources: readonly TargetNativeRuleSetSourceIR[] = [],
  nativeRoutes: readonly TargetNativeRouteIR[] = [],
  nativeFinalRoute?: TargetNativeRouteIR,
  targetNativeFinalOptions?: TargetNativeFinalOptionsIR,
  targetNativeRouteOptions: readonly TargetNativeRouteOptionsIR[] = [],
): SurgeCompatibilityResult {
  const issues: CompatibilityIssue[] = []
  const policyOwners = new Map<string, string>()

  validateSurgeFinalOptions(ir, nativeFinalRoute, targetNativeFinalOptions, issues)
  validateSurgeRouteOptions(ir, nativeRoutes, targetNativeRouteOptions, issues)

  for (const source of ir.sources) {
    if (source.kind === 'provider' || source.kind === 'imported-config'
      || source.kind === 'subscription' && !source.proxies) issues.push(surgeIssue(
      'SURGE_SOURCE_REQUIRES_RESOLVED_PROXIES', 'error', 'source',
      `Source “${source.name}” must be materialized to explicit proxy endpoints before Surge compilation.`, source.id,
    ))
    if (source.kind === 'subscription' && source.remote?.exportMode === 'remote') issues.push(surgeIssue(
      'SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN', 'error', 'remote-source',
      `Source “${source.name}” requires native Remote export, but ProxyFlow has no verified metadata proving that its URL serves a Surge policy list or a Surge profile [Proxy] section.`, source.id,
    ))
    else if (source.kind === 'subscription' && source.remote?.exportMode === 'auto' && source.proxies) issues.push(surgeIssue(
      'SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED', 'info', 'remote-source',
      `Source “${source.name}” is materialized from its validated snapshot because its remote format is not proven Surge-compatible.`, source.id,
    ))
  }

  for (const strategy of ir.strategies) {
    registerPolicyName(strategy.name, `strategy:${strategy.id}`, strategy.id, policyOwners, issues)
    validateStrategy(strategy, issues)
    let materializedMemberCount = 0
    const projections = []
    for (const ref of strategyProxySetRefs(strategy)) {
      const result = projectSurgeProxySet(ir, ref, projection)
      projections.push(result)
      materializedMemberCount += result.proxies.length
      for (const proxy of result.proxies) registerPolicyName(proxy.name, `proxy:${proxy.id}`, strategy.id, policyOwners, issues)
    }
    issues.push(...surgeProxySetProjectionIssues(projections, strategy))
    const nestedMemberCount = strategy.kind === 'select' || strategy.kind === 'fallback'
      ? strategy.candidates.filter((candidate) => candidate.kind === 'strategy').length
      : 0
    if (strategy.kind === 'fixed') {
      const fixed = projectSurgeFixedEndpoint(ir, strategy, projection)
      issues.push(...fixed.issues)
      if (fixed.endpoint) registerPolicyName(fixed.endpoint.name, `proxy:${fixed.endpoint.id}`, strategy.id, policyOwners, issues)
    }
    if (strategy.kind !== 'fixed' && strategy.kind !== 'chain'
      && materializedMemberCount + nestedMemberCount === 0) {
      const emptyIssue = surgeStrategyNoMemberIssue(strategy, projections)
      if (emptyIssue) issues.push(emptyIssue)
    }
  }
  for (const strategy of nativeStrategies) {
    if (!strategy || typeof strategy.id !== 'string' || typeof strategy.name !== 'string') continue
    registerPolicyName(strategy.name, `native-strategy:${strategy.id}`, strategy.id, policyOwners, issues)
  }
  validateSurgeNativeStrategies(ir, nativeStrategies, issues)
  validateChainStrategies(ir, projection, issues)
  validateHealthCheckScope(ir.strategies, issues)
  validateStrategyCycles(ir.strategies, issues)

  const targetNativeRuleSetSourceIds = new Set(
    nativeRuleSetSources
      .filter((source) => Boolean(source) && typeof source === 'object' && typeof source.sourceId === 'string')
      .map((source) => source.sourceId),
  )
  for (const route of [...ir.routes, ...nativeRoutes]) {
    if (!route.matcher) continue
    if (!Number.isFinite(route.priority)) issues.push(surgeIssue(
      'SURGE_ROUTE_PRIORITY_INVALID', 'error', 'route', `Route “${route.name}” has a non-finite priority.`, route.id,
    ))
    if (route.matcher.kind === 'service') {
      for (const serviceId of route.matcher.serviceIds) {
        const service = ir.services.find((item) => item.id === serviceId)
        if (service?.ruleSources.some((source) => targetNativeRuleSetSourceIds.has(source.id))) issues.push(surgeIssue(
          'SURGE_RULE_SET_SOURCE_UNSUPPORTED', 'error', 'service-rule',
          `Service “${service.name}” contains a target-native Rule Set source and cannot be consumed as a Universal service route.`, route.id,
        ))
        else resolveSurgeServiceRuleSource(ir, serviceId, route.id, issues)
      }
    }
    else if (route.matcher.kind === 'rule-set') {
      if (!resolveSurgeBuiltinRuleSetName(ir, route.matcher.id, nativeRuleSetSources)) issues.push(surgeIssue(
        'SURGE_RULE_SET_SOURCE_UNSUPPORTED', 'error', 'route',
        `Rule Set source “${route.matcher.id}” is not a proven Surge built-in LAN/SYSTEM source.`, route.id,
      ))
    }
    else if (route.matcher.kind === 'source-port') {
      const provenance = 'targetNativeSourcePort' in route ? route.targetNativeSourcePort : undefined
      if (!isTargetNativeSourcePortMatcher(route.matcher)
        || !isTargetNativeSourcePortIR(provenance)
        || provenance.routeId !== route.id
        || provenance.port !== route.matcher.port) issues.push(surgeIssue(
          'SURGE_TARGET_NATIVE_SOURCE_PORT_INVALID', 'error', 'route',
          `Surge source-port route “${route.name}” has invalid runtime data or owner provenance.`, route.id,
        ))
    }
    else if (!['domain', 'domain-suffix', 'domain-keyword', 'ip-cidr', 'ip-cidr6', 'port', 'asn', 'geo-ip'].includes(route.matcher.kind)) issues.push(surgeIssue(
      'SURGE_MATCHER_UNSUPPORTED', 'error', 'route',
      `Matcher “${route.matcher.kind}” is outside the lossless routing subset of this Surge compiler phase.`, route.id,
    ))
  }

  issues.push(...planSurgeDns(ir.dns).issues)

  return { supported: !issues.some((issue) => issue.severity === 'error'), issues }
}

function validateSurgeRouteOptions(
  ir: ProxyFlowIR,
  nativeRoutes: readonly TargetNativeRouteIR[],
  options: readonly TargetNativeRouteOptionsIR[],
  issues: CompatibilityIssue[],
) {
  const routes = [...ir.routes, ...nativeRoutes]
  const routeCounts = new Map<string, number>()
  for (const route of routes) routeCounts.set(route.id, (routeCounts.get(route.id) ?? 0) + 1)
  const seenOwners = new Set<string>()
  for (const option of options) {
    if (!isTargetNativeRouteOptionsIR(option)) {
      const rawOption = option as unknown as { routeId?: unknown }
      issues.push(surgeIssue(
        'SURGE_TARGET_NATIVE_ROUTE_OPTIONS_INVALID', 'error', 'route',
        'Target-native route options have invalid runtime data.', typeof rawOption.routeId === 'string' ? rawOption.routeId : 'route-options',
      ))
      continue
    }
    if (seenOwners.has(option.routeId)) {
      issues.push(surgeIssue(
        'SURGE_TARGET_NATIVE_ROUTE_OPTIONS_DUPLICATE', 'error', 'route',
        `Target-native route options are attached more than once to route “${option.routeId}”.`, option.routeId,
      ))
      continue
    }
    seenOwners.add(option.routeId)
    const count = routeCounts.get(option.routeId) ?? 0
    if (count === 0) {
      issues.push(surgeIssue(
        'SURGE_TARGET_NATIVE_ROUTE_OPTIONS_ORPHAN', 'error', 'route',
        `Target-native route options reference missing route “${option.routeId}”.`, option.routeId,
      ))
      continue
    }
    if (count !== 1) {
      issues.push(surgeIssue(
        'SURGE_TARGET_NATIVE_ROUTE_OPTIONS_OWNER_MISMATCH', 'error', 'route',
        `Target-native route options resolve to ${count} route owners for “${option.routeId}”.`, option.routeId,
      ))
      continue
    }
    const route = routes.find((candidate) => candidate.id === option.routeId)
    if (!route?.matcher || !(SURGE_NO_RESOLVE_MATCHERS as readonly string[]).includes(route.matcher.kind)) {
      issues.push(surgeIssue(
        'SURGE_NO_RESOLVE_MATCHER_UNSUPPORTED', 'error', 'route',
        `Surge no-resolve is only supported for IP-CIDR, IP-CIDR6, GEOIP, IP-ASN, and RULE-SET routes; route “${route?.name ?? option.routeId}” uses ${route?.matcher?.kind ?? 'no matcher'}.`, option.routeId,
      ))
    }
  }
}

function validateSurgeFinalOptions(
  ir: ProxyFlowIR,
  nativeFinalRoute: TargetNativeRouteIR | undefined,
  options: TargetNativeFinalOptionsIR | undefined,
  issues: CompatibilityIssue[],
) {
  if (options === undefined) return
  if (!isTargetNativeFinalOptionsIR(options)) {
    issues.push(surgeIssue(
      'SURGE_TARGET_NATIVE_FINAL_OPTIONS_INVALID', 'error', 'final',
      'Target-native Final options have invalid runtime data.', 'final',
    ))
    return
  }
  if (!ir.finalRoute && !nativeFinalRoute) issues.push(surgeIssue(
    'SURGE_TARGET_NATIVE_FINAL_OPTIONS_WITHOUT_FINAL', 'error', 'final',
    'Target-native Final options require an effective Final route.', options.finalNodeId,
  ))
  if (nativeFinalRoute && options.finalNodeId !== nativeFinalRoute.id) issues.push(surgeIssue(
    'SURGE_TARGET_NATIVE_FINAL_OPTIONS_OWNER_MISMATCH', 'error', 'final',
    'Target-native Final options do not belong to the effective target-native Final route.', options.finalNodeId,
  ))
  if (ir.finalRoute?.target.kind === 'direct') issues.push(surgeIssue(
    'SURGE_FINAL_DNS_FAILED_DIRECT_UNSUPPORTED', 'error', 'final',
    'Surge dns-failed is only meaningful for a non-DIRECT Final policy.', options.finalNodeId,
  ))
}

function strategyProxySetRefs(strategy: StrategyIR): ProxySetRef[] {
  if (strategy.kind === 'auto-select' || strategy.kind === 'load-balance') return [strategy.source]
  if (strategy.kind === 'select' || strategy.kind === 'fallback') {
    return strategy.candidates.filter((candidate): candidate is ProxySetRef => candidate.kind !== 'strategy')
  }
  return []
}

function validateStrategy(strategy: StrategyIR, issues: CompatibilityIssue[]) {
  if (strategy.kind === 'auto-select' || strategy.kind === 'fallback') {
    const url = strategy.healthCheck?.url
    if (url !== undefined && !isSafeHttpUrl(url)) issues.push(surgeIssue(
      'SURGE_STRATEGY_TEST_URL_INVALID', 'error', 'strategy',
      `Strategy “${strategy.name}” has a test URL that is not a safe absolute HTTP(S) URL.`, strategy.id,
    ))
    const interval = strategy.healthCheck?.intervalSeconds
    if (interval !== undefined && (!Number.isInteger(interval) || interval <= 0)) issues.push(surgeIssue(
      'SURGE_STRATEGY_INTERVAL_INVALID', 'error', 'strategy', `Strategy “${strategy.name}” has an invalid interval.`, strategy.id,
    ))
    const tolerance = strategy.healthCheck?.toleranceMs
    if (tolerance !== undefined && (!Number.isInteger(tolerance) || tolerance < 0)) issues.push(surgeIssue(
      'SURGE_STRATEGY_TOLERANCE_INVALID', 'error', 'strategy', `Strategy “${strategy.name}” has an invalid tolerance.`, strategy.id,
    ))
    if (strategy.kind === 'fallback' && tolerance !== undefined) issues.push(surgeIssue(
      'SURGE_FALLBACK_TOLERANCE_UNSUPPORTED', 'error', 'strategy',
      `Fallback strategy “${strategy.name}” has tolerance intent, but Surge fallback has no tolerance field.`, strategy.id,
    ))
  }
  if (strategy.kind === 'load-balance') {
    if (strategy.mode === 'consistent-hash') issues.push(surgeIssue(
      'SURGE_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED', 'error', 'strategy',
      `Load Balance strategy “${strategy.name}” requires Mihomo-style consistent hashing, whose domain key uses top-level-domain matching; Surge persistent mode hashes the full target hostname, so the mapping is not exact.`, strategy.id,
    ))
    else issues.push(surgeIssue(
      'SURGE_LOAD_BALANCE_ROUND_ROBIN_UNSUPPORTED', 'error', 'strategy',
      `Load Balance strategy “${strategy.name}” requires ordered round-robin selection, while Surge load-balance without persistent mode selects uniformly at random.`, strategy.id,
    ))
  }
}

function validateStrategyCycles(strategies: StrategyIR[], issues: CompatibilityIssue[]) {
  const references = new Map(strategies.map((strategy) => [strategy.id,
    strategy.kind === 'select' || strategy.kind === 'fallback'
      ? strategy.candidates.filter((candidate) => candidate.kind === 'strategy').map((candidate) => candidate.id)
      : strategy.kind === 'chain' ? strategy.hops.map((hop) => hop.id) : [],
  ]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const reported = new Set<string>()
  const visit = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      const start = path.indexOf(id)
      const cycle = [...path.slice(start), id]
      const key = [...new Set(cycle)].sort().join('\u0000')
      if (!reported.has(key)) {
        reported.add(key)
        issues.push(surgeIssue(
          'SURGE_STRATEGY_CYCLE', 'error', 'strategy',
          `Surge policy group cycle detected: ${cycle.join(' → ')}.`, id,
        ))
      }
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of references.get(id) ?? []) visit(next, [...path, id])
    visiting.delete(id)
    visited.add(id)
  }
  for (const strategy of strategies) visit(strategy.id, [])
}

function validateHealthCheckScope(strategies: StrategyIR[], issues: CompatibilityIssue[]) {
  const testing = strategies.filter((strategy) => strategy.kind === 'auto-select' || strategy.kind === 'fallback')
  const explicit = testing.filter((strategy) => strategy.healthCheck?.url !== undefined)
  if (explicit.length === 0) return

  const firstUrl = explicit[0].healthCheck!.url!
  const conflicting = explicit.find((strategy) => strategy.healthCheck!.url !== firstUrl)
  if (conflicting) issues.push(surgeIssue(
    'SURGE_STRATEGY_TEST_URL_CONFLICT', 'error', 'strategy',
    `Strategy “${conflicting.name}” uses a different test URL; Surge only exposes one global proxy-test-url for this lossless subset.`, conflicting.id,
  ))

  for (const strategy of testing.filter((candidate) => candidate.healthCheck?.url === undefined)) issues.push(surgeIssue(
    'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED', 'error', 'strategy',
    `Strategy “${strategy.name}” has no explicit test URL, so applying another group's URL globally would change its testing semantics.`, strategy.id,
  ))

  const otherTestingSurface = strategies.find((strategy) => strategy.kind === 'select' || strategy.kind === 'fixed')
  if (otherTestingSurface) issues.push(surgeIssue(
    'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED', 'error', 'strategy',
    `Strategy “${otherTestingSurface.name}” exposes policies outside URL Test/Fallback; a global proxy-test-url could change that testing surface.`, otherTestingSurface.id,
  ))
}

function validateChainStrategies(
  ir: ProxyFlowIR,
  projection: SurgeProjectionContext,
  issues: CompatibilityIssue[],
) {
  const strategies = new Map(ir.strategies.map((strategy) => [strategy.id, strategy]))
  for (const chain of ir.strategies) {
    if (chain.kind !== 'chain') continue
    for (let index = 0; index < chain.hops.length; index += 1) {
      const hop = strategies.get(chain.hops[index].id)
      if (!hop) continue
      if (hop.kind === 'chain') {
        issues.push(surgeIssue(
          'SURGE_PROXY_CHAIN_NESTED_CHAIN_UNSUPPORTED', 'error', 'chain',
          `Proxy Chain “${chain.name}” uses another chain as hop ${index + 1}; recursive derived-policy lowering is outside the proven subset.`, chain.id,
        ))
        continue
      }
      if (index === 0) continue
      if (!hasDirectPolicyMembers(hop)) {
        issues.push(surgeIssue(
          'SURGE_PROXY_CHAIN_NESTED_MEMBER_UNSUPPORTED', 'error', 'chain',
          `Proxy Chain “${chain.name}” has nested strategy members in hop ${index + 1}; Surge group-level underlying-proxy does not apply to nested groups.`, chain.id,
        ))
        continue
      }
      if (resolvedStrategyProxies(ir, hop, projection).some((proxy) => proxy.protocol === 'hysteria2' && proxy.serverPorts?.length)) issues.push(surgeIssue(
        'SURGE_PROXY_CHAIN_PORT_HOPPING_UNSUPPORTED', 'error', 'chain',
        `Proxy Chain “${chain.name}” applies an underlying policy to Hysteria 2 port hopping in hop ${index + 1}, a combination Surge explicitly forbids.`, chain.id,
      ))
    }
  }
}

function hasDirectPolicyMembers(strategy: StrategyIR) {
  if (strategy.kind === 'fixed' || strategy.kind === 'auto-select') return true
  if (strategy.kind === 'select' || strategy.kind === 'fallback') return strategy.candidates.every((candidate) => candidate.kind !== 'strategy')
  return false
}

function resolvedStrategyProxies(
  ir: ProxyFlowIR,
  strategy: StrategyIR,
  projection: SurgeProjectionContext,
) {
  if (strategy.kind === 'fixed') {
    const fixed = projectSurgeFixedEndpoint(ir, strategy, projection)
    return fixed.endpoint ? [fixed.endpoint] : []
  }
  return strategyProxySetRefs(strategy).flatMap((ref) => {
    const result = projectSurgeProxySet(ir, ref, projection)
    return result.status === 'ready' ? result.proxies : []
  })
}

function isSafeHttpUrl(value: string) {
  if (!value || /[\r\n\u0000]/.test(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

function registerPolicyName(
  name: string,
  owner: string,
  entityId: string,
  policyOwners: Map<string, string>,
  issues: CompatibilityIssue[],
) {
  if (!isSafeSurgePolicyName(name)) issues.push(surgeIssue(
    'SURGE_POLICY_NAME_UNSAFE', 'error', 'naming',
    `Policy name “${name}” cannot be preserved safely in the current Surge profile grammar.`, entityId,
  ))
  const normalized = name.toLowerCase()
  if (BUILT_IN_POLICIES.has(normalized)) issues.push(surgeIssue(
    'SURGE_POLICY_NAME_RESERVED', 'error', 'naming', `Policy name “${name}” conflicts with a Surge built-in policy.`, entityId,
  ))
  const existing = policyOwners.get(normalized)
  if (existing && existing !== owner) issues.push(surgeIssue(
    'SURGE_POLICY_NAME_DUPLICATE', 'error', 'naming',
    `Policy name “${name}” is used by more than one proxy or strategy and cannot be preserved unambiguously.`, entityId,
  ))
  else policyOwners.set(normalized, owner)
}
