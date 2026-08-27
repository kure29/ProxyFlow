import type { RouteTargetIR, TrafficMatcherIR } from '../../core/ir'
import type { SurgeCompileContext } from './context'
import { surgeIssue } from './errors'
import { resolveSurgeServiceRuleSource } from './serviceRules'
import { serializeSurgeFinalRule, serializeSurgeRule } from './serializer'
import { resolveSurgeBuiltinRuleSetName } from './ruleSets'

export function compileSurgeRules(context: SurgeCompileContext) {
  const rules: string[] = []
  const routes = orderedSurgeRoutes(context)
  const routeOptions = new Map(context.targetNativeRouteOptions.map((option) => [option.routeId, option]))
  for (const { route } of routes) {
    const target = targetName(route.target, route.id, context)
    if (!target || !route.matcher) continue
    const options = routeOptions.get(route.id)?.noResolve ? { noResolve: true as const } : undefined
    if (route.matcher.kind === 'service') {
      for (const serviceId of route.matcher.serviceIds) {
        const source = resolveSurgeServiceRuleSource(context.ir, serviceId, route.id, context.issues)
        if (source) rules.push(serializeSurgeRule('RULE-SET', source.url, target, options))
      }
      continue
    }
    if (route.matcher.kind === 'rule-set') {
      const name = resolveSurgeBuiltinRuleSetName(context.ir, route.matcher.id, context.nativeRuleSetSources)
      if (name) rules.push(serializeSurgeRule('RULE-SET', name, target, options))
      continue
    }
    const type = matcherType(route.matcher)
    const payload = matcherPayload(route.matcher)
    if (type && payload !== undefined) rules.push(serializeSurgeRule(type, payload, target, options))
  }
  const finalOptions = context.targetNativeFinalOptions?.dnsFailed ? { dnsFailed: true as const } : undefined
  if (context.ir.finalRoute && context.nativeFinalRoute) {
    context.issues.push(surgeIssue(
      'SURGE_FINAL_ROUTE_AMBIGUOUS', 'error', 'route',
      'Surge received both a Universal and a target-native Final route.', 'final',
    ))
  } else if (context.ir.finalRoute) {
    const target = targetName(context.ir.finalRoute.target, 'final', context)
    if (target) rules.push(serializeSurgeFinalRule(target, finalOptions))
  } else if (context.nativeFinalRoute) {
    const target = targetName(context.nativeFinalRoute.target, context.nativeFinalRoute.id, context)
    if (target) rules.push(serializeSurgeFinalRule(target, finalOptions))
  }
  return rules
}

function orderedSurgeRoutes(context: SurgeCompileContext) {
  const total = context.ir.routes.length + context.nativeRoutes.length
  const nativeOrders = context.nativeRoutes.map((route) => route.routingOrder)
  const hasCompleteCompilerOrder = context.nativeRoutes.length > 0
    && nativeOrders.every((order): order is number => typeof order === 'number'
      && Number.isSafeInteger(order) && order >= 0 && order < total)
    && new Set(nativeOrders).size === nativeOrders.length

  const routes = hasCompleteCompilerOrder
    ? (() => {
        const occupied = new Set(nativeOrders)
        const universalOrders = Array.from({ length: total }, (_, order) => order).filter((order) => !occupied.has(order))
        return [
          ...context.ir.routes.map((route, index) => ({ route, order: universalOrders[index] })),
          ...context.nativeRoutes.map((route) => ({ route, order: route.routingOrder! })),
        ]
      })()
    : [
        ...context.ir.routes.map((route, index) => ({ route, order: index })),
        ...context.nativeRoutes.map((route, index) => ({ route, order: context.ir.routes.length + index })),
      ]

  return routes.sort((left, right) => left.route.priority - right.route.priority || left.order - right.order)
}

type SurgeRouteMatcher = TrafficMatcherIR | { kind: 'source-port'; port: number }

function matcherType(matcher: SurgeRouteMatcher) {
  switch (matcher.kind) {
    case 'domain': return 'DOMAIN'
    case 'domain-suffix': return 'DOMAIN-SUFFIX'
    case 'domain-keyword': return 'DOMAIN-KEYWORD'
    case 'ip-cidr': return 'IP-CIDR'
    case 'ip-cidr6': return 'IP-CIDR6'
    case 'port': return 'DEST-PORT'
    case 'source-port': return 'SRC-PORT'
    case 'asn': return 'IP-ASN'
    case 'geo-ip': return 'GEOIP'
    default: return undefined
  }
}

function matcherPayload(matcher: SurgeRouteMatcher) {
  switch (matcher.kind) {
    case 'domain':
    case 'domain-suffix':
    case 'domain-keyword':
    case 'ip-cidr':
    case 'ip-cidr6':
      return matcher.value
    case 'port':
    case 'source-port':
      return String(matcher.port)
    case 'asn':
      return String(matcher.value)
    case 'geo-ip':
      return matcher.countryCode
    default:
      return undefined
  }
}

function targetName(target: RouteTargetIR, ownerId: string, context: SurgeCompileContext) {
  if (target.kind === 'direct') return 'DIRECT'
  if (target.kind === 'reject') return 'REJECT'
  const name = context.strategyNames.get(target.id)
  if (name && context.compiledStrategyIds.has(target.id)) return name
  context.issues.push(surgeIssue(
    'SURGE_TARGET_REFERENCE_NOT_FOUND', 'error', 'route',
    `Target strategy “${target.id}” did not compile to a Surge policy group.`, ownerId,
  ))
  return undefined
}
