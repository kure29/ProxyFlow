import type { RouteTargetIR, TrafficMatcherIR } from '../../core/ir'
import type { SurgeCompileContext } from './context'
import { surgeIssue } from './errors'
import { serializeSurgeRule } from './serializer'

export function compileSurgeRules(context: SurgeCompileContext) {
  const rules: string[] = []
  const routes = context.ir.routes.map((route, index) => ({ route, index }))
    .sort((left, right) => left.route.priority - right.route.priority || left.index - right.index)
  for (const { route } of routes) {
    const target = targetName(route.target, route.id, context)
    const type = matcherType(route.matcher)
    const payload = matcherPayload(route.matcher)
    if (target && type && payload !== undefined) rules.push(serializeSurgeRule(type, payload, target))
  }
  if (context.ir.finalRoute) {
    const target = targetName(context.ir.finalRoute.target, 'final', context)
    if (target) rules.push(serializeSurgeRule('FINAL', undefined, target))
  }
  return rules
}

function matcherType(matcher: TrafficMatcherIR) {
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

function targetName(target: RouteTargetIR, ownerId: string, context: SurgeCompileContext) {
  if (target.kind === 'direct') return 'DIRECT'
  if (target.kind === 'reject') return 'REJECT'
  const strategy = context.ir.strategies.find((item) => item.id === target.id)
  const name = context.strategyNames.get(target.id)
  if (name && strategy && strategy.kind !== 'fixed' && strategy.kind !== 'chain') return name
  context.issues.push(surgeIssue(
    'SURGE_TARGET_REFERENCE_NOT_FOUND', 'error', 'route',
    `Target strategy “${target.id}” did not compile to a Surge policy group.`, ownerId,
  ))
  return undefined
}
