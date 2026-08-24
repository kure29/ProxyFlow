import type { ProxyFlowIR, ProxySetRef, StrategyIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { planLoonDns } from './dns'
import { loonIssue } from './errors'
import { collectActiveLoonStrategyIds } from './context'
import {
  createLoonProjectionContext,
  projectLoonFixedEndpoint,
  projectLoonProxySet,
  loonProxySetProjectionIssues,
  loonStrategyNoMemberIssue,
} from './projection'
import { isSafeLoonPolicyName } from './serializer'

export interface LoonCompatibilityResult {
  supported: boolean
  issues: CompatibilityIssue[]
}

const BUILT_IN_POLICIES = new Set([
  'direct', 'reject', 'reject-img', 'reject-dict', 'reject-arry', 'reject-drop',
])

export function checkLoonCompatibility(
  ir: ProxyFlowIR,
  projection = createLoonProjectionContext(),
): LoonCompatibilityResult {
  const issues: CompatibilityIssue[] = []
  const policyOwners = new Map<string, string>()
  const inactivePolicyOwners = new Map<string, string>()
  const activeStrategyIds = collectActiveLoonStrategyIds(ir)
  const activeSourceIds = collectActiveSourceIds(ir, activeStrategyIds)

  for (const source of ir.sources) {
    const active = activeSourceIds.has(source.id)
    if (source.kind === 'provider' || source.kind === 'imported-config'
      || source.kind === 'subscription' && !source.proxies) issues.push(loonIssue(
      'LOON_SOURCE_REQUIRES_RESOLVED_PROXIES', active ? 'error' : 'warning', 'source',
      `Source "${source.name}" must be materialized to explicit proxy endpoints before Loon compilation.`, source.id,
    ))
    if (source.kind === 'subscription' && source.remote?.exportMode === 'remote') issues.push(loonIssue(
      'LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN', active ? 'error' : 'warning', 'remote-source',
      `Source "${source.name}" requests native Remote export, but no first-party Loon remote proxy format and refresh contract has been proven.`, source.id,
    ))
    else if (source.kind === 'subscription' && source.remote?.exportMode === 'auto' && source.proxies) issues.push(loonIssue(
      'LOON_REMOTE_PROXY_SOURCE_MATERIALIZED', 'info', 'remote-source',
      `Source "${source.name}" is emitted from its validated materialized snapshot because native Loon remote proxy syntax is unproven.`, source.id,
    ))
  }

  for (const strategy of ir.strategies) {
    const issueStart = issues.length
    const active = activeStrategyIds.has(strategy.id)
    // Keep inactive inventory out of active collision detection. Its target
    // diagnostics are still useful, but it must not poison an emitted policy
    // through a duplicate name or endpoint definition.
    const strategyProjection = active ? projection : createLoonProjectionContext()
    const owners = active ? policyOwners : inactivePolicyOwners
    registerPolicyName(strategy.name, `strategy:${strategy.id}`, strategy.id, owners, issues)
    validateStrategy(strategy, issues)
    const projections = strategyProxySetRefs(strategy).map((ref) => projectLoonProxySet(ir, ref, strategyProjection))
    for (const projectionResult of projections) for (const proxy of projectionResult.proxies) registerPolicyName(proxy.name, `proxy:${proxy.id}`, strategy.id, owners, issues)
    issues.push(...loonProxySetProjectionIssues(projections, strategy))
    const materializedMemberCount = projections.reduce((count, item) => count + item.proxies.length, 0)
    const nestedMemberCount = strategy.kind === 'select' || strategy.kind === 'fallback'
      ? strategy.candidates.filter((candidate) => candidate.kind === 'strategy').length : 0
    if (strategy.kind === 'fixed') {
      const fixed = projectLoonFixedEndpoint(ir, strategy, strategyProjection)
      issues.push(...fixed.issues)
      if (fixed.endpoint) registerPolicyName(fixed.endpoint.name, `proxy:${fixed.endpoint.id}`, strategy.id, owners, issues)
    }
    if (strategy.kind !== 'fixed' && strategy.kind !== 'chain' && materializedMemberCount + nestedMemberCount === 0) {
      const empty = loonStrategyNoMemberIssue(strategy, projections)
      if (empty) issues.push(empty)
    }
    softenInactiveStrategyIssues(issues, issueStart, active)
  }
  validateStrategyCycles(ir.strategies, issues, activeStrategyIds)

  for (const route of ir.routes) {
    if (!Number.isFinite(route.priority)) issues.push(loonIssue('LOON_ROUTE_PRIORITY_INVALID', 'error', 'route', `Route "${route.name}" has a non-finite priority.`, route.id))
    if (route.matcher.kind === 'service') issues.push(loonIssue(
      'LOON_SERVICE_RULE_SOURCE_UNPROVEN', 'error', 'service-rule',
      `Route "${route.name}" references service rules, but ProxyFlow has no audited Loon rule-provider artifact or update contract.`, route.id,
    ))
    else if (route.matcher.kind === 'rule-set') issues.push(loonIssue(
      'LOON_RULE_SOURCE_FORMAT_UNPROVEN', 'error', 'rule-source',
      `Route "${route.name}" references a remote rule set whose Loon format and failure semantics are not proven.`, route.id,
    ))
    else if (!['domain', 'domain-suffix', 'domain-keyword', 'ip-cidr', 'ip-cidr6', 'geo-ip'].includes(route.matcher.kind)) issues.push(loonIssue(
      route.matcher.kind === 'port' ? 'LOON_PORT_MATCHER_UNSUPPORTED' : route.matcher.kind === 'asn' ? 'LOON_ROUTE_NO_RESOLVE_UNMODELED' : 'LOON_MATCHER_UNSUPPORTED', 'error', 'route',
      route.matcher.kind === 'asn'
        ? `Route "${route.name}" uses IP-ASN semantics without a Universal no-resolve intent; Loon's exact rule cannot be proven.`
        : `Matcher "${route.matcher.kind}" is outside the lossless routing subset of this Loon foundation.`, route.id,
    ))
  }
  issues.push(...planLoonDns(ir.dns).issues)
  return { supported: !issues.some((issue) => issue.severity === 'error'), issues }
}

function strategyProxySetRefs(strategy: StrategyIR): ProxySetRef[] {
  if (strategy.kind === 'auto-select' || strategy.kind === 'load-balance') return [strategy.source]
  if (strategy.kind === 'select' || strategy.kind === 'fallback') return strategy.candidates.filter((candidate): candidate is ProxySetRef => candidate.kind !== 'strategy')
  return []
}

function validateStrategy(strategy: StrategyIR, issues: CompatibilityIssue[]) {
  if (strategy.kind === 'auto-select' || strategy.kind === 'fallback') {
    const url = strategy.healthCheck?.url
    if (url !== undefined && !isSafeHttpUrl(url)) issues.push(loonIssue('LOON_STRATEGY_TEST_URL_INVALID', 'error', 'strategy', `Strategy "${strategy.name}" has an unsafe absolute HTTP(S) test URL.`, strategy.id))
    const interval = strategy.healthCheck?.intervalSeconds
    if (interval !== undefined && (!Number.isInteger(interval) || interval <= 0)) issues.push(loonIssue('LOON_STRATEGY_INTERVAL_INVALID', 'error', 'strategy', `Strategy "${strategy.name}" has an invalid interval.`, strategy.id))
    const tolerance = strategy.healthCheck?.toleranceMs
    if (tolerance !== undefined && (!Number.isInteger(tolerance) || tolerance < 0)) issues.push(loonIssue('LOON_STRATEGY_TOLERANCE_INVALID', 'error', 'strategy', `Strategy "${strategy.name}" has an invalid tolerance.`, strategy.id))
    if (strategy.kind === 'fallback' && tolerance !== undefined) issues.push(loonIssue('LOON_FALLBACK_TOLERANCE_UNSUPPORTED', 'error', 'strategy', `Fallback strategy "${strategy.name}" has tolerance intent, but Loon fallback exposes max-timeout rather than tolerance.`, strategy.id))
  }
  if (strategy.kind === 'load-balance' && strategy.mode === 'consistent-hash') issues.push(loonIssue(
    'LOON_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED', 'error', 'strategy',
    `Load Balance strategy "${strategy.name}" uses consistent hashing, which is not proven equivalent to Loon PCC.`, strategy.id,
  ))
  if (strategy.kind === 'load-balance' && strategy.mode === undefined) issues.push(loonIssue(
    'LOON_LOAD_BALANCE_ALGORITHM_UNPROVEN', 'error', 'strategy', `Load Balance strategy "${strategy.name}" has no explicit algorithm; a Loon default cannot be guessed.`, strategy.id,
  ))
}

function validateStrategyCycles(strategies: StrategyIR[], issues: CompatibilityIssue[], activeStrategyIds: ReadonlySet<string>) {
  const references = new Map(strategies.map((strategy) => [strategy.id,
    strategy.kind === 'select' || strategy.kind === 'fallback'
      ? strategy.candidates.filter((candidate) => candidate.kind === 'strategy').map((candidate) => candidate.id)
      : strategy.kind === 'chain' ? strategy.hops.map((hop) => hop.id) : [],
  ]))
  const visiting = new Set<string>(), visited = new Set<string>(), reported = new Set<string>()
  const visit = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      const cycle = [...path.slice(path.indexOf(id)), id]
      const key = [...new Set(cycle)].sort().join('\u0000')
      if (!reported.has(key)) {
        reported.add(key)
        issues.push(loonIssue(
          'LOON_STRATEGY_CYCLE', activeStrategyIds.has(id) ? 'error' : 'warning', 'strategy',
          `Loon policy group cycle detected: ${cycle.join(' → ')}.`, id,
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

function registerPolicyName(name: string, owner: string, entityId: string, owners: Map<string, string>, issues: CompatibilityIssue[]) {
  if (!isSafeLoonPolicyName(name)) issues.push(loonIssue('LOON_SERIALIZER_UNSAFE_VALUE', 'error', 'serialization', `Policy name "${name}" cannot be represented safely in Loon's profile grammar.`, entityId))
  const normalized = name.toLocaleLowerCase()
  if (BUILT_IN_POLICIES.has(normalized)) issues.push(loonIssue('LOON_POLICY_NAME_RESERVED', 'error', 'naming', `Policy name "${name}" conflicts with a Loon built-in policy.`, entityId))
  const existing = owners.get(normalized)
  if (existing && existing !== owner) issues.push(loonIssue('LOON_POLICY_NAME_DUPLICATE', 'error', 'naming', `Policy name "${name}" is used by more than one proxy or strategy.`, entityId))
  else owners.set(normalized, owner)
}

function isSafeHttpUrl(value: string) {
  if (!value || /[\r\n\u0000]/.test(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch { return false }
}

export function loonStrategyProxySetRefs(strategy: StrategyIR) {
  return strategyProxySetRefs(strategy)
}

function collectActiveSourceIds(ir: ProxyFlowIR, activeStrategyIds: ReadonlySet<string>) {
  const activeSources = new Set<string>()
  const activeTransforms = new Set<string>()
  const transforms = new Map(ir.transforms.map((transform) => [transform.id, transform]))
  const visit = (ref: ProxySetRef) => {
    if (ref.kind === 'source') {
      activeSources.add(ref.id)
      return
    }
    if (activeTransforms.has(ref.id)) return
    activeTransforms.add(ref.id)
    const transform = transforms.get(ref.id)
    if (!transform) return
    if (transform.kind === 'merge') for (const input of transform.inputs) visit(input)
    else visit(transform.input)
  }
  for (const strategy of ir.strategies) {
    if (!activeStrategyIds.has(strategy.id)) continue
    for (const ref of strategyProxySetRefs(strategy)) visit(ref)
    if (strategy.kind === 'fixed' && strategy.proxyId) {
      for (const source of ir.sources) if ((source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies)
        && (source.proxies ?? []).some((proxy) => proxy.id === strategy.proxyId)) activeSources.add(source.id)
    }
  }
  return activeSources
}

function softenInactiveStrategyIssues(issues: CompatibilityIssue[], start: number, active: boolean) {
  if (active) return
  for (let index = start; index < issues.length; index += 1) {
    const issue = issues[index]
    if (issue.severity !== 'error') continue
    issues[index] = { ...issue, severity: 'warning' }
  }
}
