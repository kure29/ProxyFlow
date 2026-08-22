import { isUnmodeledProxy, type ProxyFlowIR } from '../../core/ir'
import { createMaterializationContext, materializeProxySet } from '../../core/proxySet'
import type { CompatibilityIssue } from '../../types/project'
import { mihomoIssue } from './errors'
import { isSafeRemoteUrl } from './security'

export interface TargetCompatibilityResult {
  supported: boolean
  issues: CompatibilityIssue[]
}

export function checkMihomoCompatibility(ir: ProxyFlowIR): TargetCompatibilityResult {
  const issues: CompatibilityIssue[] = []
  const materialization = createMaterializationContext()

  for (const source of ir.sources) {
    if (source.kind === 'subscription' && source.remote && (!isSafeRemoteUrl(source.remote.url) || !isSafeRemoteUrl(source.url))) issues.push(mihomoIssue(
      'MIHOMO_INVALID_PROVIDER_URL', 'error', 'source', `Subscription “${source.name}” 必须使用 http/https URL。`, source.id,
    ))
    if (source.kind === 'provider' && !isSafeRemoteUrl(source.reference)) issues.push(mihomoIssue(
      'MIHOMO_INVALID_PROVIDER_URL', 'error', 'source', `Provider “${source.name}” 必须使用 http/https URL。`, source.id,
    ))
    if (source.kind === 'manual-proxy' && source.proxies.some(isUnmodeledProxy)) issues.push(mihomoIssue(
      'MIHOMO_UNSUPPORTED_SOURCE', 'error', 'source', `Manual source “${source.name}” 缺少可解析的标准代理 endpoint。`, source.id,
    ))
    if (source.kind === 'imported-config') issues.push(mihomoIssue(
      'MIHOMO_UNSUPPORTED_SOURCE', 'error', 'source', 'Mihomo MVP 尚不能可靠生成 imported-config source。', source.id,
    ))
    if (source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies) for (const proxy of source.proxies ?? []) {
      if (!isUnmodeledProxy(proxy) && proxy.metadata?.compatibility?.status === 'partial') issues.push(mihomoIssue(
        'MIHOMO_PROXY_VARIANT_UNSUPPORTED', 'warning', 'source',
        `Proxy “${proxy.name}” 包含 Mihomo 映射尚未可靠支持的特性，已从本次节点集合排除：${proxy.metadata.compatibility.unsupportedFeatures?.join(', ') || proxy.metadata.compatibility.unrecognizedParams?.join(', ') || 'unknown variant'}。`, source.id,
      ))
      else if (!isUnmodeledProxy(proxy) && 'tls' in proxy && proxy.tls?.disableSni && proxy.protocol !== 'tuic') issues.push(mihomoIssue(
        'MIHOMO_TLS_DISABLE_SNI_UNSUPPORTED', 'error', 'source',
        `Proxy “${proxy.name}” 的 disable-SNI intent 无法由该 Mihomo proxy schema 无损表达。`, source.id,
      ))
      else if (!isUnmodeledProxy(proxy) && (proxy.protocol === 'hysteria2' || proxy.protocol === 'tuic') && proxy.tls.fingerprint) issues.push(mihomoIssue(
        'MIHOMO_QUIC_TLS_FINGERPRINT_UNSUPPORTED', 'error', 'source',
        `Proxy “${proxy.name}” 的 QUIC TLS fingerprint intent 无法由 Mihomo Hysteria2/TUIC schema 无损表达。`, source.id,
      ))
      else if (!isUnmodeledProxy(proxy) && proxy.protocol === 'http' && proxy.tls?.fingerprint) issues.push(mihomoIssue(
        'MIHOMO_HTTP_TLS_CLIENT_FINGERPRINT_UNSUPPORTED', 'error', 'source',
        `Proxy “${proxy.name}” 的 TLS client fingerprint 不能映射为 Mihomo HTTP proxy 的 certificate fingerprint。`, source.id,
      ))
    }
  }

  for (const transform of ir.transforms) {
    const resolved = materializeProxySet(ir, { kind: 'transform', id: transform.id }, materialization)
    for (const issue of resolved.issues) issues.push(mihomoIssue(`MIHOMO_${issue.code}`, issue.severity, 'transform', issue.message, issue.entityId ?? transform.id))
  }

  for (const strategy of ir.strategies) {
    if (strategy.kind === 'fixed' && !ir.sources.some((source) => (source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies)
      && (source.proxies ?? []).some((proxy) => proxy.id === strategy.proxyId && !isUnmodeledProxy(proxy)))) issues.push(mihomoIssue(
      'MIHOMO_FIXED_PROXY_UNRESOLVED', 'error', 'strategy',
      `Fixed strategy “${strategy.name}” 没有可解析的 HTTP/SOCKS endpoint。`, strategy.id,
    ))
    if ((strategy.kind === 'auto-select' || strategy.kind === 'fallback')
      && strategy.healthCheck?.url && !isSafeRemoteUrl(strategy.healthCheck.url)) issues.push(mihomoIssue(
      'MIHOMO_INVALID_HEALTH_CHECK_URL', 'error', 'strategy',
      `Strategy “${strategy.name}” 的健康检查必须使用 http/https URL。`, strategy.id,
    ))
  }

  for (const resolver of ir.dns?.resolvers ?? []) {
    if (resolver.address && !isSafeDnsAddress(resolver.address)) issues.push(mihomoIssue(
      'MIHOMO_INVALID_DNS_URL', 'error', 'dns', `DNS resolver “${resolver.id}” 使用了不安全或不支持的地址。`, resolver.id,
    ))
  }

  return { supported: !issues.some((issue) => issue.severity === 'error'), issues }
}

function isSafeDnsAddress(value: string) {
  return isSafeRemoteUrl(value) || value.startsWith('tls://') || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(value)
}
