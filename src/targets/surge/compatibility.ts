import { isUnmodeledProxy, type ProxyFlowIR, type ProxySetRef, type StrategyIR } from '../../core/ir'
import { createMaterializationContext, materializeProxySet } from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import { surgeIssue } from './errors'
import { checkSurgeProxy } from './proxies'
import { isSafeSurgePolicyName } from './serializer'

export interface SurgeCompatibilityResult {
  supported: boolean
  issues: CompatibilityIssue[]
}

const BUILT_IN_POLICIES = new Set([
  'direct', 'reject', 'reject-drop', 'reject-no-drop', 'reject-tinygif',
  'cellular', 'cellular-only', 'hybrid', 'no-hybrid',
])

export function checkSurgeCompatibility(ir: ProxyFlowIR): SurgeCompatibilityResult {
  const issues: CompatibilityIssue[] = []
  const materialization = createMaterializationContext()
  const endpointIds = new Set<string>()
  const policyOwners = new Map<string, string>()

  for (const source of ir.sources) {
    if (source.kind === 'provider' || source.kind === 'imported-config'
      || source.kind === 'subscription' && !source.proxies) issues.push(surgeIssue(
      'SURGE_SOURCE_REQUIRES_RESOLVED_PROXIES', 'error', 'source',
      `Source “${source.name}” must be materialized to explicit proxy endpoints before Surge compilation.`, source.id,
    ))
    if (source.kind === 'subscription' && source.remote?.exportMode === 'remote') issues.push(surgeIssue(
      'SURGE_REMOTE_PROXY_SOURCE_UNSUPPORTED', 'error', 'remote-source',
      `Source “${source.name}” requires native remote export, which is not implemented in this Surge compiler phase.`, source.id,
    ))
    if (source.kind !== 'manual-proxy' && !(source.kind === 'subscription' && source.proxies)) continue
    for (const proxy of source.proxies ?? []) {
      if (endpointIds.has(proxy.id)) issues.push(surgeIssue(
        'SURGE_PROXY_ID_DUPLICATE', 'error', 'proxy', `Proxy endpoint id “${proxy.id}” occurs more than once and cannot be referenced deterministically.`, source.id,
      ))
      endpointIds.add(proxy.id)
      if (isUnmodeledProxy(proxy)) issues.push(surgeIssue(
        'SURGE_PROXY_PROTOCOL_UNSUPPORTED', 'error', 'proxy',
        `Proxy “${proxy.name}” has no modeled protocol that can be compiled to Surge.`, source.id,
      ))
      else issues.push(...checkSurgeProxy(proxy, source.id))
    }
  }

  for (const transform of ir.transforms) {
    const result = materializeProxySet(ir, { kind: 'transform', id: transform.id }, materialization)
    for (const issue of result.issues) issues.push(surgeIssue(
      `SURGE_${issue.code}`, issue.severity, 'transform', issue.message, issue.entityId ?? transform.id,
    ))
  }

  for (const strategy of ir.strategies) {
    registerPolicyName(strategy.name, `strategy:${strategy.id}`, strategy.id, policyOwners, issues)
    validateStrategy(strategy, issues)
    let materializedMemberCount = 0
    for (const ref of strategyProxySetRefs(strategy)) {
      const result = materializeProxySet(ir, ref, materialization)
      for (const issue of result.issues) issues.push(surgeIssue(
        `SURGE_${issue.code}`, issue.severity, 'strategy', issue.message, issue.entityId ?? strategy.id,
      ))
      materializedMemberCount += result.proxies.length
      for (const proxy of result.proxies) registerPolicyName(proxy.name, `proxy:${proxy.id}`, strategy.id, policyOwners, issues)
    }
    const nestedMemberCount = strategy.kind === 'select' || strategy.kind === 'fallback'
      ? strategy.candidates.filter((candidate) => candidate.kind === 'strategy').length
      : 0
    if (strategy.kind !== 'fixed' && strategy.kind !== 'chain'
      && materializedMemberCount + nestedMemberCount === 0) issues.push(surgeIssue(
      'SURGE_STRATEGY_EMPTY', 'error', 'strategy', `Strategy “${strategy.name}” has no materialized policy members.`, strategy.id,
    ))
  }
  validateStrategyCycles(ir.strategies, issues)

  for (const route of ir.routes) {
    if (!Number.isFinite(route.priority)) issues.push(surgeIssue(
      'SURGE_ROUTE_PRIORITY_INVALID', 'error', 'route', `Route “${route.name}” has a non-finite priority.`, route.id,
    ))
    if (route.matcher.kind === 'service') issues.push(surgeIssue(
      'SURGE_SERVICE_RULE_SOURCE_UNSUPPORTED', 'error', 'service-rule',
      'Surge-compatible first-party rule source is not available yet.', route.id,
    ))
    else if (!['domain', 'domain-suffix', 'domain-keyword', 'ip-cidr', 'ip-cidr6', 'geo-ip'].includes(route.matcher.kind)) issues.push(surgeIssue(
      'SURGE_MATCHER_UNSUPPORTED', 'error', 'route',
      `Matcher “${route.matcher.kind}” is outside the lossless routing subset of this Surge compiler phase.`, route.id,
    ))
  }

  if (ir.dns?.enabled) issues.push(surgeIssue(
    'SURGE_DNS_UNSUPPORTED', 'error', 'dns',
    'Surge DNS is not implemented in this compiler phase; active DNS semantics were not ignored.', 'dns',
  ))

  return { supported: !issues.some((issue) => issue.severity === 'error'), issues }
}

function strategyProxySetRefs(strategy: StrategyIR): ProxySetRef[] {
  if (strategy.kind === 'auto-select' || strategy.kind === 'load-balance') return [strategy.source]
  if (strategy.kind === 'select' || strategy.kind === 'fallback') {
    return strategy.candidates.filter((candidate): candidate is ProxySetRef => candidate.kind !== 'strategy')
  }
  return []
}

function validateStrategy(strategy: StrategyIR, issues: CompatibilityIssue[]) {
  if (strategy.kind === 'chain') {
    issues.push(surgeIssue(
      'SURGE_PROXY_CHAIN_UNSUPPORTED', 'error', 'chain',
      `Proxy Chain “${strategy.name}” is not implemented in this Surge compiler phase.`, strategy.id,
    ))
    return
  }
  if (strategy.kind === 'fixed') {
    issues.push(surgeIssue(
      'SURGE_FIXED_STRATEGY_UNSUPPORTED', 'error', 'strategy',
      `Fixed strategy “${strategy.name}” is outside this Surge compiler phase.`, strategy.id,
    ))
    return
  }
  if ((strategy.kind === 'auto-select' || strategy.kind === 'fallback') && strategy.healthCheck?.url) issues.push(surgeIssue(
    'SURGE_STRATEGY_TEST_URL_UNSUPPORTED', 'error', 'strategy',
    `Strategy “${strategy.name}” has a group-scoped test URL, but current Surge ignores the legacy group url field and IR cannot lower it losslessly.`, strategy.id,
  ))
  if (strategy.kind === 'auto-select' || strategy.kind === 'fallback') {
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
  if (strategy.kind === 'load-balance') issues.push(surgeIssue(
    'SURGE_LOAD_BALANCE_MODE_UNSUPPORTED', 'error', 'strategy',
    `Load Balance strategy “${strategy.name}” uses ${strategy.mode ?? 'unspecified'} mode, but current Surge exposes random selection or target-hostname persistence and Universal IR does not retain an equivalent mode contract.`, strategy.id,
  ))
}

function validateStrategyCycles(strategies: StrategyIR[], issues: CompatibilityIssue[]) {
  const references = new Map(strategies.map((strategy) => [strategy.id, strategy.kind === 'select' || strategy.kind === 'fallback'
    ? strategy.candidates.filter((candidate) => candidate.kind === 'strategy').map((candidate) => candidate.id)
    : []]))
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
