import { findRuleSource, isUnmodeledProxy, type ProxyFlowIR, type ProxySetRef, type StrategyIR } from '../../core/ir'
import { getTargetCapabilities, proxyCompatibilityForTarget, type RuleSourceFormat, type StrategyCapability } from '../../core/capabilities'
import { isPortableShadowsocksMethod } from '../../core/proxy'
import { createMaterializationContext, materializeProxySet, planRemoteProxySource } from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import { singBoxIssue } from './errors'
import { isSafeHttpUrl, isValidServer } from './security'

export interface SingBoxCompatibilityResult {
  supported: boolean
  issues: CompatibilityIssue[]
}

const singBoxCapabilities = getTargetCapabilities('sing-box')

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
      if (isUnmodeledProxy(proxy)) continue
      const targetCompatibility = proxyCompatibilityForTarget(proxy, 'sing-box')
      if (targetCompatibility.status === 'partial') issues.push(singBoxIssue(
        'SINGBOX_PROXY_VARIANT_UNSUPPORTED', 'warning', 'source',
        `Proxy “${proxy.name}” 包含 sing-box 映射尚未可靠支持的特性：${targetCompatibility.unsupportedFeatures.join(', ') || proxy.metadata?.compatibility?.unrecognizedParams?.join(', ') || 'unknown variant'}。`, source.id,
      ))
      if (proxy.protocol === 'shadowsocks' && !isPortableShadowsocksMethod(proxy.method)) issues.push(singBoxIssue(
        'SINGBOX_SHADOWSOCKS_METHOD_UNSUPPORTED', 'error', 'source',
        `Proxy “${proxy.name}” 的 Shadowsocks cipher “${proxy.method}” 不在当前 sing-box 无损支持列表中。`, source.id,
      ))
      if ((proxy.protocol === 'vless' || proxy.protocol === 'vmess' || proxy.protocol === 'trojan') && proxy.transport?.kind === 'xhttp') issues.push(singBoxIssue(
        'SINGBOX_TRANSPORT_XHTTP_UNSUPPORTED', 'error', 'source',
        `Proxy “${proxy.name}” 使用 sing-box 1.13.14 不支持的 XHTTP transport。`, source.id,
      ))
      else if ((proxy.protocol === 'vless' || proxy.protocol === 'vmess' || proxy.protocol === 'trojan') && proxy.transport?.kind === 'http'
        && proxy.transport.variant === 'h2' && !proxy.tls?.enabled) issues.push(singBoxIssue(
        'SINGBOX_TRANSPORT_H2_REQUIRES_TLS', 'error', 'source',
        `Proxy “${proxy.name}” 的 H2 intent 缺少 TLS；sing-box 会退化为 HTTP/1.1，因此拒绝生成。`, source.id,
      ))
      else if ((proxy.protocol === 'vless' || proxy.protocol === 'vmess' || proxy.protocol === 'trojan') && proxy.transport?.kind === 'http'
        && proxy.transport.variant === 'http' && proxy.tls?.enabled) issues.push(singBoxIssue(
        'SINGBOX_TRANSPORT_HTTP_TLS_VARIANT_UNSUPPORTED', 'error', 'source',
        `Proxy “${proxy.name}” 要求 HTTP/1.1 transport + TLS；sing-box 1.13.14 会切换为 HTTP/2，因此拒绝语义降级。`, source.id,
      ))
      else if ((proxy.protocol === 'hysteria2' || proxy.protocol === 'tuic') && proxy.tls.fingerprint) issues.push(singBoxIssue(
        'SINGBOX_QUIC_TLS_FINGERPRINT_UNSUPPORTED', 'error', 'source',
        `Proxy “${proxy.name}” 的 QUIC TLS fingerprint intent 无法在 sing-box 1.13.14 中可靠 lowering。`, source.id,
      ))
      else if (proxy.protocol === 'hysteria2' && proxy.hopInterval?.kind === 'range') issues.push(singBoxIssue(
        'SINGBOX_HYSTERIA2_RANDOM_HOP_INTERVAL_UNSUPPORTED', 'error', 'source',
        `Proxy “${proxy.name}” 使用随机 hop interval；sing-box 1.13.14 仅支持固定 hop_interval，因此拒绝生成。`, source.id,
      ))
      else if (proxy.protocol === 'anytls' && proxy.udpEnabled === false) issues.push(singBoxIssue(
        'SINGBOX_ANYTLS_UDP_DISABLE_UNSUPPORTED', 'error', 'source',
        `Proxy “${proxy.name}” 显式禁用 UDP；sing-box 1.13.14 AnyTLS outbound 没有等价字段，因此拒绝生成。`, source.id,
      ))
    }
  }

  for (const transform of ir.transforms) {
    if (transform.kind === 'sort' && transform.by === 'latency') issues.push(singBoxIssue(
      'SINGBOX_TRANSFORM_SORT_UNSUPPORTED', 'error', 'transform',
      `Sort “${transform.name}” 需要运行时延迟数据，纯 Compiler 无法保持语义。`, transform.id,
    ))
    const resolved = materializeProxySet(ir, { kind: 'transform', id: transform.id }, materialization)
    for (const issue of resolved.issues) issues.push(singBoxIssue(`SINGBOX_${issue.code}`, issue.severity, 'transform', issue.message, issue.entityId ?? transform.id))
  }

  for (const strategy of ir.strategies) {
    for (const ref of strategyProxySetRefs(strategy, ir)) {
      const consumer = strategy.kind === 'chain' ? 'chain-hop' as const : strategy.kind
      const plan = planRemoteProxySource(ir, ref, singBoxCapabilities.remoteProxySource, consumer)
      for (const diagnostic of plan.diagnostics) issues.push(singBoxIssue(
        diagnostic.code,
        diagnostic.severity,
        'remote-source',
        diagnostic.message,
        diagnostic.sourceId ?? ref.id,
      ))
    }
    const capabilityKind: StrategyCapability | undefined = strategy.kind === 'fallback'
      ? 'failover'
      : strategy.kind === 'load-balance'
        ? 'load-balance'
        : undefined
    const capability = capabilityKind ? singBoxCapabilities.strategies[capabilityKind] : undefined
    if (capability?.status === 'unsupported') issues.push(singBoxIssue(
      capability.reason ?? 'SINGBOX_STRATEGY_UNSUPPORTED', 'error', 'strategy',
      strategy.kind === 'fallback'
        ? `Fallback strategy “${strategy.name}” 在基线版本中没有等价 outbound。`
        : `Load Balance strategy “${strategy.name}” 在基线版本中没有等价 outbound。`,
      strategy.id,
    ))
    if ((strategy.kind === 'auto-select' || strategy.kind === 'fallback')
      && strategy.healthCheck?.url && !isSafeHttpUrl(strategy.healthCheck.url)) issues.push(singBoxIssue(
      'SINGBOX_INVALID_HEALTH_CHECK_URL', 'error', 'strategy',
      `Strategy “${strategy.name}” 的 URLTest 地址必须使用 http/https。`, strategy.id,
    ))
    if (strategy.kind === 'select') issues.push(singBoxIssue(
      singBoxCapabilities.strategies.manual.reason ?? 'SINGBOX_SELECTOR_CLASH_API_REQUIRED', 'warning', 'strategy',
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
      const reference = findRuleSource(ir.services, ruleSetId)
      const source = reference?.source
      if (!source || (!source.inlineMatchers?.length && !isSingBoxRuleSource(source))) issues.push(singBoxIssue(
        'SINGBOX_INVALID_RULESET', 'error', 'route', `Rule set “${ruleSetId}” 不是 sing-box source/binary 格式。`, route.id,
      ))
      else for (const matcher of source.inlineMatchers ?? []) if (singBoxCapabilities.routingMatchers[matcher.kind].status === 'unsupported') issues.push(singBoxIssue(
        singBoxCapabilities.routingMatchers[matcher.kind].reason ?? 'SINGBOX_MATCHER_UNSUPPORTED', 'error', 'route',
        `Rule set “${ruleSetId}” contains matcher “${matcher.kind}” that cannot be lowered without loss.`, route.id,
      ))
    } else if (singBoxCapabilities.routingMatchers[route.matcher.kind].status === 'unsupported') issues.push(singBoxIssue(
      singBoxCapabilities.routingMatchers[route.matcher.kind].reason ?? 'SINGBOX_MATCHER_UNSUPPORTED', 'error', 'route',
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
    if (resolver.role && resolver.role !== 'default') issues.push(singBoxIssue(
      'SINGBOX_DNS_ROLE_UNSUPPORTED', 'error', 'dns', `DNS resolver “${resolver.id}” 的 ${resolver.role} 角色无法由当前 sing-box DNS 路由无损表达。`, resolver.id,
    ))
  }

  issues.push(singBoxIssue(
    'SINGBOX_RUNTIME_INBOUND_NOT_CONFIGURED', 'info', 'inbound',
    'ProxyFlow 只生成 routing/outbound 配置；运行时 Inbound Profile 仍由部署环境提供。',
  ))
  return { supported: !issues.some((issue) => issue.severity === 'error'), issues }
}

function strategyProxySetRefs(strategy: StrategyIR, ir: ProxyFlowIR): ProxySetRef[] {
  if (strategy.kind === 'auto-select' || strategy.kind === 'load-balance') return [strategy.source]
  if (strategy.kind === 'select' || strategy.kind === 'fallback') return strategy.candidates.filter((candidate): candidate is ProxySetRef => candidate.kind !== 'strategy')
  if (strategy.kind === 'fixed') {
    const source = ir.sources.find((item) => (item.kind === 'manual-proxy' || item.kind === 'subscription' && item.proxies)
      && (item.proxies ?? []).some((proxy) => proxy.id === strategy.proxyId))
    return source ? [{ kind: 'source', id: source.id }] : []
  }
  return []
}

export function isSingBoxRuleSource(source: { format?: string }) {
  if (!source.format || !(source.format in singBoxCapabilities.ruleSources)) return false
  return singBoxCapabilities.ruleSources[source.format as RuleSourceFormat].status === 'supported'
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
