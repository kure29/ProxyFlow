import { isUnmodeledProxy, type ProxyFlowIR, type ProxySetRef, type StrategyIR, type TrafficMatcherIR } from '../../core/ir'
import { createMaterializationContext, materializeProxySet } from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import { singBoxIssue } from './errors'
import { isSafeHttpUrl, isValidServer } from './security'

export interface SingBoxCompatibilityResult {
  supported: boolean
  issues: CompatibilityIssue[]
}

export function checkSingBoxCompatibility(ir: ProxyFlowIR): SingBoxCompatibilityResult {
  const issues: CompatibilityIssue[] = []
  const materialization = createMaterializationContext()

  for (const source of ir.sources) {
    if ((source.kind === 'subscription' && !source.proxies) || source.kind === 'provider' || source.kind === 'imported-config') issues.push(singBoxIssue(
      'SINGBOX_SOURCE_REQUIRES_RESOLVED_PROXIES', 'error', 'source',
      `Source “${source.name}” 必须先解析为显式 proxy；sing-box 没有可保持该远程 Provider 语义的 outbound。`, source.id,
    ))
    if (source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies) for (const proxy of source.proxies ?? []) {
      if (isUnmodeledProxy(proxy) || !isValidServer('server' in proxy ? proxy.server : '')
        || !('port' in proxy) || proxy.port < 1 || proxy.port > 65_535) issues.push(singBoxIssue(
        'SINGBOX_INVALID_OUTBOUND', 'error', 'source', `Proxy “${proxy.name}” 缺少有效的地址。`, source.id,
      ))
      else if (proxy.metadata?.compatibility?.status === 'partial') issues.push(singBoxIssue(
        'SINGBOX_PROXY_VARIANT_UNSUPPORTED', 'warning', 'source',
        `Proxy “${proxy.name}” 包含 sing-box 映射尚未可靠支持的特性，已从本次节点集合排除：${proxy.metadata.compatibility.unsupportedFeatures?.join(', ') || proxy.metadata.compatibility.unrecognizedParams?.join(', ') || 'unknown variant'}。`, source.id,
      ))
    }
  }

  for (const transform of ir.transforms) {
    if (transform.kind === 'sort' && transform.by === 'latency') issues.push(singBoxIssue(
      'SINGBOX_TRANSFORM_SORT_UNSUPPORTED', 'error', 'transform',
      `Sort “${transform.name}” 需要运行时延迟数据，纯 Compiler 无法保持语义。`, transform.id,
    ))
    const resolved = materializeProxySet(ir, { kind: 'transform', id: transform.id }, materialization)
    for (const issue of resolved.issues) issues.push(singBoxIssue(`SINGBOX_${issue.code}`, issue.severity, 'transform', issue.message, transform.id))
  }

  for (const strategy of ir.strategies) {
    if (strategy.kind === 'fallback') issues.push(singBoxIssue(
      'SINGBOX_STRATEGY_FALLBACK_UNSUPPORTED', 'error', 'strategy',
      `Fallback strategy “${strategy.name}” 在基线版本中没有等价 outbound。`, strategy.id,
    ))
    if (strategy.kind === 'load-balance') issues.push(singBoxIssue(
      'SINGBOX_STRATEGY_LOAD_BALANCE_UNSUPPORTED', 'error', 'strategy',
      `Load Balance strategy “${strategy.name}” 在基线版本中没有等价 outbound。`, strategy.id,
    ))
    if ((strategy.kind === 'auto-select' || strategy.kind === 'fallback')
      && strategy.healthCheck?.url && !isSafeHttpUrl(strategy.healthCheck.url)) issues.push(singBoxIssue(
      'SINGBOX_INVALID_HEALTH_CHECK_URL', 'error', 'strategy',
      `Strategy “${strategy.name}” 的 URLTest 地址必须使用 http/https。`, strategy.id,
    ))
    if (strategy.kind === 'select') issues.push(singBoxIssue(
      'SINGBOX_SELECTOR_CLASH_API_REQUIRED', 'warning', 'strategy',
      `Selector “${strategy.name}” 的运行时切换需要 Clash API。`, strategy.id,
    ))
    if (strategy.kind === 'chain' && strategy.hops.some((hop) => {
      const target = ir.strategies.find((item) => item.id === hop.id)
      return !target || !strategyUsesResolvedEndpoints(target, ir, new Set([strategy.id]))
    })) issues.push(singBoxIssue(
      'SINGBOX_CHAIN_REQUIRES_RESOLVED_OUTBOUND', 'error', 'chain',
      `Chain “${strategy.name}” 的每一跳必须最终指向显式 proxy outbound。`, strategy.id,
    ))
  }

  for (const route of ir.routes) {
    if (route.matcher.kind === 'service') {
      for (const id of route.matcher.serviceIds) {
        const service = ir.services.find((item) => item.id === id)
        if (!service || (!service.inlineMatchers?.length && !service.ruleSources.some(isSingBoxRuleSource))) issues.push(singBoxIssue(
          'SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED', 'error', 'route',
          `Service “${service?.name ?? id}” 只有非 sing-box 格式规则来源。`, route.id,
        ))
      }
    } else if (route.matcher.kind === 'rule-set') {
      const ruleSetId = route.matcher.id
      const source = ir.services.flatMap((service) => service.ruleSources).find((item) => item.id === ruleSetId)
      if (!source || !isSingBoxRuleSource(source)) issues.push(singBoxIssue(
        'SINGBOX_INVALID_RULESET', 'error', 'route', `Rule set “${ruleSetId}” 不是 sing-box source/binary 格式。`, route.id,
      ))
    } else if (!matcherSupported(route.matcher)) issues.push(singBoxIssue(
      'SINGBOX_MATCHER_UNSUPPORTED', 'error', 'route',
      `Matcher “${route.matcher.kind}” 在现代 sing-box 配置中无法无损表达。`, route.id,
    ))
  }

  for (const source of ir.services.flatMap((service) => service.ruleSources).filter(isSingBoxRuleSource)) {
    if (!isSafeHttpUrl(source.url)) issues.push(singBoxIssue(
      'SINGBOX_INVALID_RULESET', 'error', 'rule-set', `Rule set “${source.id}” 必须使用 http/https URL。`, source.id,
    ))
  }

  for (const resolver of ir.dns?.resolvers ?? []) {
    if (!resolver.address || !['doh', 'dot', 'udp', 'system'].includes(resolver.kind)) issues.push(singBoxIssue(
      'SINGBOX_INVALID_DNS', 'error', 'dns', `DNS resolver “${resolver.id}” 缺少可用地址。`, resolver.id,
    ))
  }

  issues.push(singBoxIssue(
    'SINGBOX_RUNTIME_INBOUND_NOT_CONFIGURED', 'info', 'inbound',
    'V0.5 只生成 routing/outbound 配置；运行时 Inbound Profile 仍由部署环境提供。',
  ))
  return { supported: !issues.some((issue) => issue.severity === 'error'), issues }
}

export function isSingBoxRuleSource(source: { format?: string }) {
  return source.format === 'sing-box-source' || source.format === 'sing-box-binary'
}

function matcherSupported(matcher: TrafficMatcherIR) {
  return ['domain', 'domain-suffix', 'domain-keyword', 'ip-cidr', 'ip-cidr6', 'port'].includes(matcher.kind)
}

function strategyUsesResolvedEndpoints(strategy: StrategyIR, ir: ProxyFlowIR, stack: Set<string>): boolean {
  if (stack.has(strategy.id)) return false
  const next = new Set(stack).add(strategy.id)
  if (strategy.kind === 'fixed') return ir.sources.some((source) => (source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies)
    && (source.proxies ?? []).some((proxy) => proxy.id === strategy.proxyId && !isUnmodeledProxy(proxy)))
  if (strategy.kind === 'auto-select' || strategy.kind === 'load-balance') return proxySetResolved(strategy.source, ir, new Set())
  if (strategy.kind === 'select' || strategy.kind === 'fallback') return strategy.candidates.length > 0 && strategy.candidates.every((candidate) => candidate.kind === 'strategy'
    ? Boolean(ir.strategies.find((item) => item.id === candidate.id)
      && strategyUsesResolvedEndpoints(ir.strategies.find((item) => item.id === candidate.id)!, ir, next))
    : proxySetResolved(candidate, ir, new Set()))
  return strategy.hops.length > 0 && strategy.hops.every((hop) => {
    const nested = ir.strategies.find((item) => item.id === hop.id)
    return nested ? strategyUsesResolvedEndpoints(nested, ir, next) : false
  })
}

function proxySetResolved(ref: ProxySetRef, ir: ProxyFlowIR, stack: Set<string>): boolean {
  if (ref.kind === 'source') {
    const source = ir.sources.find((item) => item.id === ref.id)
    return Boolean(source && (source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies)
      && (source.proxies ?? []).length > 0 && (source.proxies ?? []).every((proxy) => !isUnmodeledProxy(proxy)))
  }
  if (stack.has(ref.id)) return false
  const transform = ir.transforms.find((item) => item.id === ref.id)
  if (!transform) return false
  const next = new Set(stack).add(ref.id)
  return transform.kind === 'merge'
    ? transform.inputs.length > 0 && transform.inputs.every((input) => proxySetResolved(input, ir, next))
    : proxySetResolved(transform.input, ir, next)
}
