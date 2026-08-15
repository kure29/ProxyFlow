import type { RouteTargetIR, RuleSourceIR, ServiceIR, TrafficMatcherIR } from '../../core/ir'
import type { SingBoxCompileContext } from './context'
import { SINGBOX_DEFAULTS } from './defaults'
import { singBoxIssue } from './errors'
import type { SingBoxRouteRule, SingBoxRuleSet } from './model'
import { isSafeHttpUrl } from './security'

export function compileSingBoxRouting(context: SingBoxCompileContext) {
  const rules: SingBoxRouteRule[] = []
  const routes = context.ir.routes.map((route, index) => ({ route, index }))
    .sort((left, right) => left.route.priority - right.route.priority || left.index - right.index)

  for (const { route } of routes) {
    const action = targetAction(route.target, route.id, context)
    if (!action) continue
    if (route.matcher.kind === 'service') {
      for (const serviceId of route.matcher.serviceIds) rules.push(...compileService(serviceId, action, route.id, context))
      continue
    }
    if (route.matcher.kind === 'rule-set') {
      const ruleSetId = route.matcher.id
      const source = context.ir.services.flatMap((service) => service.ruleSources).find((item) => item.id === ruleSetId)
      const tag = source ? ensureRemoteRuleSet({ id: source.id, name: source.id }, source, context) : undefined
      if (tag) rules.push({ rule_set: [tag], ...action })
      continue
    }
    const rule = matcherRule(route.matcher, action, route.id, context)
    if (rule) rules.push(rule)
  }

  const final = compileFinal(context)
  return { rules, final }
}

function compileService(
  serviceId: string,
  action: Pick<SingBoxRouteRule, 'action' | 'outbound'>,
  routeId: string,
  context: SingBoxCompileContext,
) {
  const service = context.ir.services.find((item) => item.id === serviceId)
  if (!service) {
    context.issues.push(singBoxIssue('SINGBOX_SERVICE_NOT_FOUND', 'error', 'route', `Service “${serviceId}” 不存在。`, routeId))
    return []
  }
  if (service.inlineMatchers?.length) return service.inlineMatchers.flatMap((matcher): SingBoxRouteRule[] => {
    const rule = matcherRule(matcher, action, routeId, context)
    return rule ? [rule] : []
  })
  const source = service.ruleSources.find((item) => item.format === 'sing-box-source' || item.format === 'sing-box-binary')
  const tag = source ? ensureRemoteRuleSet(service, source, context) : undefined
  if (!tag) {
    context.issues.push(singBoxIssue(
      'SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED', 'error', 'route',
      `Service “${service.name}” 没有 sing-box source/binary 或 inline matcher。`, routeId,
    ))
    return []
  }
  return [{ rule_set: [tag], ...action }]
}

function ensureRemoteRuleSet(service: Pick<ServiceIR, 'id' | 'name'>, source: RuleSourceIR, context: SingBoxCompileContext) {
  const existing = context.ruleSets.get(source.id)
  if (existing) return existing.tag
  if (!isSafeHttpUrl(source.url) || (source.format !== 'sing-box-source' && source.format !== 'sing-box-binary')) {
    context.issues.push(singBoxIssue(
      'SINGBOX_INVALID_RULESET', 'error', 'rule-set', `Rule source “${source.id}” 的 URL 或格式无效。`, service.id,
    ))
    return undefined
  }
  const tag = context.names.allocate(service.name, source.id)
  const ruleSet: SingBoxRuleSet = {
    type: 'remote', tag,
    format: source.format === 'sing-box-source' ? 'source' : 'binary',
    url: source.url!,
    update_interval: SINGBOX_DEFAULTS.ruleSetUpdateInterval,
  }
  context.ruleSets.set(source.id, ruleSet)
  return tag
}

function matcherRule(
  matcher: TrafficMatcherIR,
  action: Pick<SingBoxRouteRule, 'action' | 'outbound'>,
  routeId: string,
  context: SingBoxCompileContext,
): SingBoxRouteRule | undefined {
  switch (matcher.kind) {
    case 'domain': return { domain: [matcher.value], ...action }
    case 'domain-suffix': return { domain_suffix: [matcher.value], ...action }
    case 'domain-keyword': return { domain_keyword: [matcher.value], ...action }
    case 'ip-cidr':
    case 'ip-cidr6': return { ip_cidr: [matcher.value], ...action }
    case 'port': return { port: [matcher.port], ...action }
    case 'service':
    case 'rule-set': return undefined
    case 'asn':
    case 'geo-ip':
    case 'geo-site':
      context.issues.push(singBoxIssue(
        'SINGBOX_MATCHER_UNSUPPORTED', 'error', 'route', `Matcher “${matcher.kind}” 不能无损 lower。`, routeId,
      ))
      return undefined
  }
}

function targetAction(target: RouteTargetIR, ownerId: string, context: SingBoxCompileContext) {
  if (target.kind === 'reject') return { action: 'reject' as const }
  if (target.kind === 'direct') return { action: 'route' as const, outbound: 'direct' }
  const template = context.strategyTemplates.get(target.id)
  if (!template) {
    context.issues.push(singBoxIssue(
      'SINGBOX_TARGET_REFERENCE_NOT_FOUND', 'error', 'route', `Target strategy “${target.id}” 没有生成 outbound。`, ownerId,
    ))
    return undefined
  }
  return { action: 'route' as const, outbound: template.tag }
}

function compileFinal(context: SingBoxCompileContext) {
  const target = context.ir.finalRoute?.target
  if (!target) return 'direct'
  if (target.kind === 'direct') return 'direct'
  if (target.kind === 'reject') {
    context.outbounds.set('block', { type: 'block', tag: 'block' })
    return 'block'
  }
  const template = context.strategyTemplates.get(target.id)
  if (template) return template.tag
  context.issues.push(singBoxIssue(
    'SINGBOX_TARGET_REFERENCE_NOT_FOUND', 'error', 'final', `Final strategy “${target.id}” 没有生成 outbound。`, 'final',
  ))
  return 'direct'
}
