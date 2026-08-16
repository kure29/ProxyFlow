import { isUnmodeledProxy, type ProxyFlowIR } from '../../core/ir'
import type { CompatibilityIssue } from '../../types/project'
import { mihomoIssue } from './errors'
import { isSafeRemoteUrl } from './security'

export interface TargetCompatibilityResult {
  supported: boolean
  issues: CompatibilityIssue[]
}

export function checkMihomoCompatibility(ir: ProxyFlowIR): TargetCompatibilityResult {
  const issues: CompatibilityIssue[] = []

  for (const source of ir.sources) {
    if (source.kind === 'subscription' && !isSafeRemoteUrl(source.url)) issues.push(mihomoIssue(
      'MIHOMO_INVALID_PROVIDER_URL', 'error', 'source', `Subscription “${source.name}” 必须使用 http/https URL。`, source.id,
    ))
    if (source.kind === 'provider' && !isSafeRemoteUrl(source.reference)) issues.push(mihomoIssue(
      'MIHOMO_INVALID_PROVIDER_URL', 'error', 'source', `Provider “${source.name}” 必须使用 http/https URL。`, source.id,
    ))
    if (source.kind === 'manual-proxy' && source.proxies.some(isUnmodeledProxy)) issues.push(mihomoIssue(
      'MIHOMO_UNSUPPORTED_SOURCE', 'error', 'source', `Manual source “${source.name}” 缺少可解析的 HTTP/SOCKS endpoint。`, source.id,
    ))
    if (source.kind === 'imported-config') issues.push(mihomoIssue(
      'MIHOMO_UNSUPPORTED_SOURCE', 'error', 'source', 'Mihomo MVP 尚不能可靠生成 imported-config source。', source.id,
    ))
  }

  for (const transform of ir.transforms) {
    if (transform.kind === 'rename') issues.push(mihomoIssue(
      transform.pattern && transform.replacement !== undefined ? 'MIHOMO_RENAME_LOWERED' : 'MIHOMO_RENAME_NOOP',
      transform.pattern && transform.replacement !== undefined ? 'info' : 'warning',
      'transform',
      transform.pattern && transform.replacement !== undefined
        ? `Rename “${transform.name}” 已映射为 Provider override.proxy-name。`
        : `Rename “${transform.name}” 缺少 pattern/replacement，不会修改节点名。`,
      transform.id,
    ))
    if (['sort', 'deduplicate', 'limit'].includes(transform.kind)) issues.push(mihomoIssue(
      'MIHOMO_UNSUPPORTED_TRANSFORM', 'error', 'transform',
      `${transform.kind} “${transform.name}” 无法在未解析远程订阅的情况下可靠表达。`, transform.id,
    ))
  }

  for (const strategy of ir.strategies) {
    if (strategy.kind === 'fixed' && !ir.sources.some((source) => source.kind === 'manual-proxy'
      && source.proxies.some((proxy) => proxy.id === strategy.proxyId && !isUnmodeledProxy(proxy)))) issues.push(mihomoIssue(
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
