import type { ProxyFlowIR, ProxySetRef, StrategyIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { collectActiveShadowrocketStrategyIds } from './context'
import { planShadowrocketDns } from './dns'
import { shadowrocketIssue } from './errors'
import { createShadowrocketProjectionContext, projectShadowrocketFixedEndpoint, projectShadowrocketProxySet, shadowrocketProxySetProjectionIssues, shadowrocketStrategyNoMemberIssue } from './projection'
import { isSafeShadowrocketPolicyName } from './serializer'

export interface ShadowrocketCompatibilityResult { supported: boolean; issues: CompatibilityIssue[] }

export function checkShadowrocketCompatibility(ir: ProxyFlowIR, projection = createShadowrocketProjectionContext()): ShadowrocketCompatibilityResult {
  const issues: CompatibilityIssue[] = []
  const active = collectActiveShadowrocketStrategyIds(ir)
  const policyOwners = new Map<string, string>()
  const inactivePolicyOwners = new Map<string, string>()
  for (const strategy of ir.strategies) {
    const activeStrategy = active.has(strategy.id)
    const strategyProjection = activeStrategy ? projection : createShadowrocketProjectionContext()
    const owners = activeStrategy ? policyOwners : inactivePolicyOwners
    const issueStart = issues.length
    registerPolicyName(owners, strategy.name, strategy.id, 'strategy', issues)
    const refs = strategyRefs(strategy)
    const projections = refs.map((ref) => projectShadowrocketProxySet(ir, ref, strategyProjection))
    for (const projected of projections) {
      issues.push(...shadowrocketProxySetProjectionIssues([projected], strategy))
      for (const endpoint of projected.proxies) registerPolicyName(owners, endpoint.name, endpoint.id, 'proxy', issues)
    }
    if (strategy.kind === 'fixed') {
      const fixed = projectShadowrocketFixedEndpoint(ir, strategy, strategyProjection)
      issues.push(...fixed.issues)
      if (fixed.candidate) registerPolicyName(owners, fixed.candidate.name, fixed.candidate.id, 'proxy', issues)
    }
    if (strategy.kind !== 'fixed' && strategy.kind !== 'chain') {
      const materializedMemberCount = projections.reduce((count, item) => count + item.proxies.length, 0)
      const nestedMemberCount = strategy.kind === 'select' || strategy.kind === 'fallback'
        ? strategy.candidates.filter((candidate) => candidate.kind === 'strategy').length : 0
      if (materializedMemberCount + nestedMemberCount === 0) issues.push(shadowrocketStrategyNoMemberIssue(strategy, projections))
    }
    if (strategy.kind === 'chain') issues.push(shadowrocketIssue('SHADOWROCKET_PROXY_CHAIN_UNPROVEN', active.has(strategy.id) ? 'error' : 'warning', 'chain', `Proxy chain "${strategy.name}" is outside the proven Shadowrocket subset.`, strategy.id))
    if ((strategy.kind === 'auto-select' || strategy.kind === 'fallback') && strategy.healthCheck?.url && !isSafeUrl(strategy.healthCheck.url)) issues.push(shadowrocketIssue('SHADOWROCKET_STRATEGY_TEST_URL_INVALID', 'error', 'strategy', `Strategy "${strategy.name}" has an unsafe test URL.`, strategy.id))
    if (strategy.kind === 'fallback' && strategy.healthCheck?.toleranceMs !== undefined) issues.push(shadowrocketIssue('SHADOWROCKET_FALLBACK_TOLERANCE_UNPROVEN', 'error', 'strategy', `Fallback strategy "${strategy.name}" uses tolerance intent whose Shadowrocket semantics are not proven.`, strategy.id))
    if (strategy.kind === 'load-balance' && !strategy.mode) issues.push(shadowrocketIssue('SHADOWROCKET_LOAD_BALANCE_ALGORITHM_UNPROVEN', 'error', 'strategy', `Load Balance strategy "${strategy.name}" has no explicit algorithm; Shadowrocket defaults cannot be assumed.`, strategy.id))
    if (strategy.kind === 'load-balance' && strategy.mode === 'consistent-hash') issues.push(shadowrocketIssue('SHADOWROCKET_LOAD_BALANCE_ALGORITHM_UNPROVEN', 'error', 'strategy', `Load Balance strategy "${strategy.name}" uses consistent hashing whose key and persistence semantics are not proven for Shadowrocket.`, strategy.id))
    softenInactiveStrategyIssues(issues, issueStart, activeStrategy)
  }
  const activeSourceIds = collectActiveSourceIds(ir, active)
  for (const source of ir.sources) if (source.kind === 'provider' || source.kind === 'imported-config' || source.kind === 'subscription' && !source.proxies) issues.push(shadowrocketIssue('SHADOWROCKET_SOURCE_REQUIRES_RESOLVED_PROXIES', activeSourceIds.has(source.id) ? 'error' : 'warning', 'source', `Source "${source.name}" must be materialized to explicit endpoints before Shadowrocket compilation.`, source.id))
  for (const source of ir.sources) if (source.kind === 'subscription' && source.remote?.exportMode === 'remote') issues.push(shadowrocketIssue('SHADOWROCKET_REMOTE_PROXY_SOURCE_UNPROVEN', activeSourceIds.has(source.id) ? 'error' : 'warning', 'remote-source', `Source "${source.name}" requests native remote proxy export, but Shadowrocket's source contract is not proven.`, source.id))
  for (const route of ir.routes) if (route.matcher.kind === 'service' || route.matcher.kind === 'rule-set' || ['port', 'asn', 'geo-site'].includes(route.matcher.kind)) issues.push(shadowrocketIssue('SHADOWROCKET_MATCHER_UNSUPPORTED', 'error', 'route', `Route matcher "${route.matcher.kind}" is outside the audited Shadowrocket subset.`, route.id))
  issues.push(...planShadowrocketDns(ir.dns).issues)
  return { supported: !issues.some((issue) => issue.severity === 'error'), issues }
}

function softenInactiveStrategyIssues(issues: CompatibilityIssue[], start: number, active: boolean) {
  if (active) return
  for (let index = start; index < issues.length; index += 1) {
    if (issues[index].severity === 'error') issues[index] = { ...issues[index], severity: 'warning' }
  }
}

function collectActiveSourceIds(ir: Pick<ProxyFlowIR, 'sources' | 'transforms' | 'strategies'>, active: ReadonlySet<string>) {
  const sourceIds = new Set<string>()
  const transformIds = new Set<string>()
  const transforms = new Map(ir.transforms.map((transform) => [transform.id, transform]))
  const visit = (ref: ProxySetRef) => {
    if (ref.kind === 'source') { sourceIds.add(ref.id); return }
    if (transformIds.has(ref.id)) return
    transformIds.add(ref.id)
    const transform = transforms.get(ref.id)
    if (!transform) return
    if (transform.kind === 'merge') transform.inputs.forEach(visit)
    else visit(transform.input)
  }
  for (const strategy of ir.strategies) {
    if (!active.has(strategy.id)) continue
    for (const ref of strategyRefs(strategy)) visit(ref)
    if (strategy.kind === 'fixed' && strategy.proxyId) {
      for (const source of ir.sources) if ((source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies)
        && (source.proxies ?? []).some((proxy) => proxy.id === strategy.proxyId)) sourceIds.add(source.id)
    }
  }
  return sourceIds
}

function registerPolicyName(
  names: Map<string, string>,
  name: unknown,
  id: unknown,
  kind: 'strategy' | 'proxy',
  issues: CompatibilityIssue[],
) {
  if (typeof name !== 'string') return
  const key = name.toLowerCase()
  const owner = String(id)
  if (!isSafeShadowrocketPolicyName(name)) {
    issues.push(shadowrocketIssue(
      'SHADOWROCKET_SERIALIZER_UNSAFE_VALUE',
      'error',
      'serialization',
      `Shadowrocket policy name "${name}" contains an unsafe delimiter or control character.`,
      owner,
    ))
  }
  if (key === 'direct' || key === 'reject') {
    issues.push(shadowrocketIssue(
      'SHADOWROCKET_POLICY_NAME_RESERVED',
      'error',
      'naming',
      `Shadowrocket policy name "${name}" is reserved for a built-in route target.`,
      owner,
    ))
  }
  const previous = names.get(key)
  if (previous && previous !== owner) {
    issues.push(shadowrocketIssue(
      'SHADOWROCKET_POLICY_NAME_DUPLICATE',
      'error',
      'naming',
      `Shadowrocket policy name "${name}" is used by more than one emitted ${kind} or strategy (${previous} and ${owner}).`,
      owner,
    ))
    return
  }
  names.set(key, owner)
}

function strategyRefs(strategy: StrategyIR): ProxySetRef[] {
  if (strategy.kind === 'auto-select' || strategy.kind === 'load-balance') return [strategy.source]
  if (strategy.kind === 'select' || strategy.kind === 'fallback') return strategy.candidates.filter((candidate): candidate is ProxySetRef => candidate.kind !== 'strategy')
  return []
}
function isSafeUrl(value: string) { try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !url.hash && !/[\r\n]/.test(value) } catch { return false } }
