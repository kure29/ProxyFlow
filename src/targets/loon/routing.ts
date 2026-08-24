import type { ProxyFlowIR, RouteTargetIR, TrafficMatcherIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { loonIssue } from './errors'
import type { LoonMatcherRule, LoonMatcherRuleType, LoonRemoteRule, LoonRule } from './model'
import { resolveLoonServiceRuleSource } from './serviceRules'

export interface LoonRoutingContext {
  ir: Pick<ProxyFlowIR, 'services' | 'routes' | 'finalRoute'>
  issues: CompatibilityIssue[]
  strategyNames: ReadonlyMap<string, string>
  compiledStrategyIds: ReadonlySet<string>
  blockedStrategyIds?: ReadonlySet<string>
}

export interface LoonRoutingPlan {
  rules: LoonRule[]
  remoteRules: LoonRemoteRule[]
  issues: CompatibilityIssue[]
}

export function planLoonRouting(
  ir: Pick<ProxyFlowIR, 'services' | 'routes' | 'finalRoute'>,
  strategyNames: ReadonlyMap<string, string>,
  compiledStrategyIds: ReadonlySet<string>,
  blockedStrategyIds: ReadonlySet<string> = new Set(),
): LoonRoutingPlan {
  const issues: CompatibilityIssue[] = []
  const rules: LoonRule[] = []
  const remoteRules: LoonRemoteRule[] = []
  const remoteRuleByUrl = new Map<string, LoonRemoteRule>()
  const conflictedUrls = new Set<string>()
  const routes = ir.routes.map((route, index) => ({ route, index }))
    .sort((left, right) => left.route.priority - right.route.priority || left.index - right.index)

  for (const { route } of routes) {
    if (route.matcher.kind === 'service') {
      const policy = resolveTarget(route.target, route.id, strategyNames, compiledStrategyIds, blockedStrategyIds, issues)
      if (!policy) continue
      for (const serviceId of route.matcher.serviceIds) {
        const source = resolveLoonServiceRuleSource(ir, serviceId, route.id, issues)
        if (!source) continue
        const existing = remoteRuleByUrl.get(source.url)
        if (existing) {
          if (existing.policy !== policy && !conflictedUrls.has(source.url)) {
            conflictedUrls.add(source.url)
            issues.push(loonIssue(
              'LOON_SERVICE_RULE_POLICY_CONFLICT', 'error', 'service-rule',
              `First-party Loon service rule source "${source.url}" is assigned to more than one policy.`, route.id,
            ))
          }
          continue
        }
        const remoteRule: LoonRemoteRule = { url: source.url, policy, enabled: true }
        remoteRuleByUrl.set(source.url, remoteRule)
        remoteRules.push(remoteRule)
      }
      continue
    }
    const matcher = lowerMatcher(route.matcher, route.id, issues)
    if (!matcher) continue
    const policy = resolveTarget(route.target, route.id, strategyNames, compiledStrategyIds, blockedStrategyIds, issues)
    if (!policy) continue
    rules.push({ ...matcher, policy })
  }

  if (ir.finalRoute) {
    const policy = resolveTarget(ir.finalRoute.target, 'final', strategyNames, compiledStrategyIds, blockedStrategyIds, issues)
    if (policy) rules.push({ type: 'FINAL', policy })
  }

  return { rules, remoteRules, issues }
}

export function compileLoonRouting(context: LoonRoutingContext) {
  const plan = planLoonRouting(
    context.ir,
    context.strategyNames,
    context.compiledStrategyIds,
    context.blockedStrategyIds,
  )
  context.issues.push(...plan.issues)
  return plan
}

function lowerMatcher(
  matcher: TrafficMatcherIR,
  routeId: string,
  issues: CompatibilityIssue[],
): Omit<LoonMatcherRule, 'policy'> | undefined {
  const type = matcherType(matcher)
  const payload = matcherPayload(matcher)
  if (!type || payload === undefined) {
    issues.push(loonIssue(
      matcher.kind === 'asn' ? 'LOON_ROUTE_NO_RESOLVE_UNMODELED' : 'LOON_MATCHER_UNSUPPORTED', 'error', 'route',
      matcher.kind === 'asn'
        ? `Route matcher "asn" cannot be lowered because Universal IR does not carry the no-resolve intent required by Loon's IP-ASN rule semantics.`
        : `Route matcher "${matcher.kind}" has no proven lossless Loon rule mapping.`, routeId,
    ))
    return undefined
  }
  // Universal IR currently has no resolve/no-resolve intent, so this adapter
  // deliberately leaves the optional Loon flag absent.
  return { type, payload }
}

function matcherType(matcher: TrafficMatcherIR): LoonMatcherRuleType | undefined {
  switch (matcher.kind) {
    case 'domain': return 'DOMAIN'
    case 'domain-suffix': return 'DOMAIN-SUFFIX'
    case 'domain-keyword': return 'DOMAIN-KEYWORD'
    case 'ip-cidr': return 'IP-CIDR'
    case 'ip-cidr6': return 'IP-CIDR6'
    case 'geo-ip': return 'GEOIP'
    default: return undefined
  }
}

function matcherPayload(matcher: TrafficMatcherIR) {
  switch (matcher.kind) {
    case 'domain':
    case 'domain-suffix':
    case 'domain-keyword':
    case 'ip-cidr':
    case 'ip-cidr6':
      return matcher.value
    case 'geo-ip':
      return matcher.countryCode
    default:
      return undefined
  }
}

function resolveTarget(
  target: RouteTargetIR,
  ownerId: string,
  strategyNames: ReadonlyMap<string, string>,
  compiledStrategyIds: ReadonlySet<string>,
  blockedStrategyIds: ReadonlySet<string>,
  issues: CompatibilityIssue[],
) {
  if (target.kind === 'direct') return 'DIRECT'
  if (target.kind === 'reject') return 'REJECT'
  const name = strategyNames.get(target.id)
  if (name && compiledStrategyIds.has(target.id)) return name
  if (blockedStrategyIds.has(target.id)) return undefined
  issues.push(loonIssue(
    'LOON_TARGET_REFERENCE_NOT_FOUND', 'error', 'route',
    `Target strategy "${target.id}" did not compile to a Loon policy group.`, ownerId,
  ))
  return undefined
}
