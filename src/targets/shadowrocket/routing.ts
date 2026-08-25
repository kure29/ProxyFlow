import type { ProxyFlowIR, RouteTargetIR, TrafficMatcherIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { shadowrocketIssue } from './errors'
import type { ShadowrocketRule } from './model'

export function compileShadowrocketRouting(ir: Pick<ProxyFlowIR, 'routes' | 'finalRoute'>, strategyNames: ReadonlyMap<string, string>, compiledStrategyIds: ReadonlySet<string>, blockedStrategyIds: ReadonlySet<string>, issues: CompatibilityIssue[]) {
  const rules: ShadowrocketRule[] = []
  const routes = ir.routes.map((route, index) => ({ route, index })).sort((a, b) => a.route.priority - b.route.priority || a.index - b.index)
  for (const { route } of routes) {
    const policy = targetName(route.target, route.id, strategyNames, compiledStrategyIds, blockedStrategyIds, issues)
    if (!policy) continue
    if (route.matcher.kind === 'service' || route.matcher.kind === 'rule-set') {
      issues.push(shadowrocketIssue('SHADOWROCKET_RULE_SOURCE_UNPROVEN', 'error', 'route', `Route "${route.name}" uses ${route.matcher.kind}, but Shadowrocket rule-source syntax and refresh semantics are not proven for this Universal mapping.`, route.id))
      continue
    }
    const lowered = lowerMatcher(route.matcher)
    if (!lowered) { issues.push(shadowrocketIssue(route.matcher.kind === 'port' || route.matcher.kind === 'asn' || route.matcher.kind === 'geo-site' ? 'SHADOWROCKET_MATCHER_UNSUPPORTED' : 'SHADOWROCKET_MATCHER_UNPROVEN', 'error', 'route', `Route matcher "${route.matcher.kind}" is outside the audited Shadowrocket subset.`, route.id)); continue }
    rules.push({ ...lowered, policy })
  }
  if (ir.finalRoute) { const policy = targetName(ir.finalRoute.target, 'final', strategyNames, compiledStrategyIds, blockedStrategyIds, issues); if (policy) rules.push({ type: 'FINAL', policy }) }
  return rules
}

function targetName(target: RouteTargetIR, ownerId: string, strategyNames: ReadonlyMap<string, string>, compiledStrategyIds: ReadonlySet<string>, blockedStrategyIds: ReadonlySet<string>, issues: CompatibilityIssue[]) {
  if (target.kind === 'direct') return 'DIRECT'
  if (target.kind === 'reject') return 'REJECT'
  const name = strategyNames.get(target.id)
  if (name && compiledStrategyIds.has(target.id)) return name
  if (blockedStrategyIds.has(target.id)) return undefined
  issues.push(shadowrocketIssue('SHADOWROCKET_TARGET_REFERENCE_NOT_FOUND', 'error', 'route', `Target strategy "${target.id}" did not compile to a Shadowrocket policy group.`, ownerId))
  return undefined
}

function lowerMatcher(matcher: TrafficMatcherIR): Omit<ShadowrocketRule, 'policy'> | undefined {
  switch (matcher.kind) {
    case 'domain': return { type: 'DOMAIN', payload: matcher.value }
    case 'domain-suffix': return { type: 'DOMAIN-SUFFIX', payload: matcher.value }
    case 'domain-keyword': return { type: 'DOMAIN-KEYWORD', payload: matcher.value }
    case 'ip-cidr': return { type: 'IP-CIDR', payload: matcher.value }
    case 'ip-cidr6': return { type: 'IP-CIDR6', payload: matcher.value }
    case 'geo-ip': return { type: 'GEOIP', payload: matcher.countryCode }
    default: return undefined
  }
}

