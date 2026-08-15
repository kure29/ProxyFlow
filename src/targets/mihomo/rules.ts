import type { RouteTargetIR, RuleSourceIR, ServiceIR, TrafficMatcherIR } from '../../core/ir'
import type { MihomoCompileContext } from './context'
import { MIHOMO_DEFAULTS } from './defaults'
import { mihomoIssue } from './errors'
import type { MihomoRuleProvider } from './model'
import { safePathSegment } from './naming'
import { isSafeRemoteUrl } from './security'

export function compileMihomoRules(context: MihomoCompileContext) {
  const rules: string[] = []
  const routes = context.ir.routes.map((route, index) => ({ route, index }))
    .sort((left, right) => left.route.priority - right.route.priority || left.index - right.index)

  for (const { route } of routes) {
    const target = targetName(route.target, route.id, context)
    if (!target) continue
    if (route.matcher.kind === 'service') {
      for (const serviceId of route.matcher.serviceIds) rules.push(...compileServiceRules(serviceId, target, route.id, context))
    } else if (route.matcher.kind === 'rule-set') {
      rules.push(...compileServiceRules(route.matcher.id, target, route.id, context))
    } else {
      const rule = matcherRule(route.matcher, target, route.id, context)
      if (rule) rules.push(rule)
    }
  }

  if (context.ir.finalRoute) {
    const finalTarget = targetName(context.ir.finalRoute.target, 'final', context)
    if (finalTarget) rules.push(`MATCH,${finalTarget}`)
  }
  return rules
}

function compileServiceRules(serviceId: string, target: string, routeId: string, context: MihomoCompileContext) {
  const service = context.ir.services.find((item) => item.id === serviceId)
  if (!service) {
    context.issues.push(mihomoIssue('MIHOMO_SERVICE_NOT_FOUND', 'error', 'route', `Service “${serviceId}” 不存在于 IR catalog。`, routeId))
    return []
  }
  const source = service.ruleSources.find((item) => item.provider === 'ios-rule-script' || item.provider === 'remote')
  if (source) {
    const resolved = resolveRuleSource(service, source, context)
    return resolved ? [`RULE-SET,${resolved},${target}`] : []
  }
  if (service.ruleSources.some((item) => item.provider === 'builtin')) return builtinServiceRules(service, target, routeId, context)
  context.issues.push(mihomoIssue(
    'MIHOMO_RULE_SOURCE_UNAVAILABLE', 'error', 'route', `Service “${service.name}” 没有 Mihomo 可用的 remote/builtin rule source。`, routeId,
  ))
  return []
}

function resolveRuleSource(service: ServiceIR, source: RuleSourceIR, context: MihomoCompileContext) {
  const url = source.url
  if (!url || !isSafeRemoteUrl(url)) {
    context.issues.push(mihomoIssue(
      'MIHOMO_INVALID_RULE_SOURCE_URL', 'error', 'rule-provider', `Service “${service.name}” 的规则地址必须使用 http/https。`, service.id,
    ))
    return undefined
  }
  if (source.format === 'multi-client' || source.format === 'universal'
    || (source.format === 'mrs' && (source.behavior ?? 'classical') === 'classical')) {
    context.issues.push(mihomoIssue(
      'MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED', 'error', 'rule-provider',
      `Service “${service.name}” 的 ${source.format} / ${source.behavior ?? 'classical'} 组合不能作为 Mihomo Rule Provider。`, service.id,
    ))
    return undefined
  }
  const existing = [...context.ruleProviders.entries()].find(([, provider]) => provider.url === url)?.[0]
  if (existing) return existing
  const name = context.ruleProviderNames.allocate(service.name, service.id)
  const format = source.format === 'text' || source.format === 'mrs' ? source.format : 'yaml'
  const provider: MihomoRuleProvider = {
    type: 'http',
    behavior: source.behavior ?? 'classical',
    format,
    url,
    path: `./rules/${safePathSegment(name)}.${format === 'mrs' ? 'mrs' : format}`,
    interval: MIHOMO_DEFAULTS.ruleProviderIntervalSeconds,
  }
  context.ruleProviders.set(name, provider)
  return name
}

function builtinServiceRules(service: ServiceIR, target: string, routeId: string, context: MihomoCompileContext) {
  const rules = (service.defaultMatchers ?? []).flatMap((matcher): string[] => {
    if (matcher === 'GEOSITE') return [`GEOSITE,cn,${target}`]
    if (matcher === 'GEOIP') return [`GEOIP,CN,${target}`]
    return []
  })
  if (rules.length === 0) context.issues.push(mihomoIssue(
    'MIHOMO_RULE_SOURCE_UNAVAILABLE', 'error', 'route', `Built-in service “${service.name}” 没有可映射 matcher。`, routeId,
  ))
  return rules
}

function matcherRule(matcher: TrafficMatcherIR, target: string, routeId: string, context: MihomoCompileContext) {
  const payload = 'value' in matcher ? matcher.value : undefined
  if (typeof payload === 'string' && /[,\r\n]/.test(payload)) {
    context.issues.push(mihomoIssue(
      'MIHOMO_INVALID_RULE_PAYLOAD', 'error', 'route', 'Matcher payload 不能包含逗号或换行符。', routeId,
    ))
    return undefined
  }
  switch (matcher.kind) {
    case 'domain': return `DOMAIN,${matcher.value},${target}`
    case 'domain-suffix': return `DOMAIN-SUFFIX,${matcher.value},${target}`
    case 'domain-keyword': return `DOMAIN-KEYWORD,${matcher.value},${target}`
    case 'ip-cidr': return `IP-CIDR,${matcher.value},${target}`
    case 'ip-cidr6': return `IP-CIDR6,${matcher.value},${target}`
    case 'asn': return `IP-ASN,${matcher.value},${target}`
    case 'geo-ip': return `GEOIP,${matcher.countryCode},${target}`
    case 'geo-site': return `GEOSITE,${matcher.category},${target}`
    case 'rule-set': return undefined
    case 'service': return undefined
  }
}

function targetName(target: RouteTargetIR, ownerId: string, context: MihomoCompileContext) {
  if (target.kind === 'direct') return 'DIRECT'
  if (target.kind === 'reject') return 'REJECT'
  const name = context.strategyNames.get(target.id)
  if (name && context.groupTemplates.has(target.id)) return name
  context.issues.push(mihomoIssue(
    'MIHOMO_TARGET_REFERENCE_NOT_FOUND', 'error', 'route', `Target strategy “${target.id}” 未生成可引用的 Mihomo group。`, ownerId,
  ))
  return undefined
}
