import type { ProxySetRef, ProxyTlsIR, ResolvedProxyEndpointIR } from '../../core/ir'
import { materializeProxySet } from '../../core/proxySet'
import type { MihomoCompileContext, ResolvedProxySet } from './context'
import { MIHOMO_DEFAULTS } from './defaults'
import { mihomoIssue } from './errors'
import type { MihomoProxy } from './model'
import { safePathSegment } from './naming'

export function compileMihomoProviders(context: MihomoCompileContext) {
  for (const source of context.ir.sources) {
    if (source.kind === 'manual-proxy' || source.kind === 'subscription' && source.proxies) continue
    if (source.kind !== 'subscription' && source.kind !== 'provider') continue
    const url = source.kind === 'subscription' ? source.url : source.reference
    if (!url) continue
    const name = context.sourceNames.get(source.id)!
    context.providers.set(name, {
      type: 'http', url, path: `./providers/${safePathSegment(name)}.yaml`, interval: MIHOMO_DEFAULTS.providerIntervalSeconds,
      'health-check': { enable: true, url: MIHOMO_DEFAULTS.healthCheckUrl, interval: MIHOMO_DEFAULTS.healthCheckIntervalSeconds, lazy: true },
    })
  }
}

export function resolveProxySet(ref: ProxySetRef, context: MihomoCompileContext): ResolvedProxySet {
  if (ref.kind === 'source') {
    const source = context.ir.sources.find((item) => item.id === ref.id)
    if ((source?.kind === 'subscription' && !source.proxies) || source?.kind === 'provider') {
      const providerName = context.sourceNames.get(source.id)
      return { providers: providerName && context.providers.has(providerName) ? [providerName] : [], proxyNames: [], include: [], exclude: [] }
    }
  }

  const materialized = materializeProxySet(context.ir, ref, context.materialization)
  if (materialized.status === 'error') {
    for (const issue of materialized.issues.filter((item) => item.severity === 'error')) context.issues.push(mihomoIssue(
      `MIHOMO_${issue.code}`, 'error', ref.kind === 'source' ? 'source' : 'transform', issue.message, issue.entityId ?? ref.id,
    ))
    return { providers: [], proxyNames: [], include: [], exclude: [] }
  }
  const proxyNames = materialized.proxies.map((proxy) => registerMihomoEndpoint(proxy, context))
  return { providers: [], proxyNames: unique(proxyNames), include: [], exclude: [] }
}

export function filtersForProxySet(resolved: ResolvedProxySet) {
  return {
    ...(resolved.include.length > 0 ? { filter: keywordPattern(resolved.include) } : {}),
    ...(resolved.exclude.length > 0 ? { 'exclude-filter': keywordPattern(resolved.exclude) } : {}),
  }
}

export function registerMihomoEndpoint(endpoint: ResolvedProxyEndpointIR, context: MihomoCompileContext) {
  let name = context.proxyNamesById.get(endpoint.id)
  if (!name) {
    name = context.outboundNames.allocate(endpoint.name, endpoint.id)
    context.proxyNamesById.set(endpoint.id, name)
  }
  if (!context.proxies.has(name)) context.proxies.set(name, endpointProxy(endpoint, name))
  return name
}

function endpointProxy(endpoint: ResolvedProxyEndpointIR, name: string): MihomoProxy {
  const common = { name, server: endpoint.server, port: endpoint.port, udp: endpoint.protocol !== 'http', ...mihomoTransport(endpoint) }
  switch (endpoint.protocol) {
    case 'http': return { ...common, type: 'http', ...(endpoint.username ? { username: endpoint.username } : {}), ...(endpoint.password ? { password: endpoint.password } : {}), ...mihomoTls(endpoint.tls, 'servername') }
    case 'socks5': return { ...common, type: 'socks5', ...(endpoint.username ? { username: endpoint.username } : {}), ...(endpoint.password ? { password: endpoint.password } : {}) }
    case 'shadowsocks': return {
      ...common, type: 'ss', cipher: endpoint.method, password: endpoint.password,
      ...(endpoint.plugin ? { plugin: endpoint.plugin.name, ...(endpoint.plugin.options ? { 'plugin-opts': pluginOptions(endpoint.plugin.options) } : {}) } : {}),
    }
    case 'trojan': return { ...common, type: 'trojan', password: endpoint.password, ...mihomoTls(endpoint.tls, 'sni') }
    case 'vmess': return { ...common, type: 'vmess', uuid: endpoint.uuid, alterId: endpoint.alterId ?? 0, cipher: endpoint.security, ...mihomoTls(endpoint.tls, 'servername') }
    case 'vless': return { ...common, type: 'vless', uuid: endpoint.uuid, ...mihomoTls(endpoint.tls, 'servername') }
  }
}

function mihomoTls(tls: ProxyTlsIR | undefined, nameField: 'sni' | 'servername') {
  if (!tls?.enabled) return {}
  return {
    tls: true,
    ...(tls.serverName ? { [nameField]: tls.serverName } : {}),
    ...(tls.allowInsecure ? { 'skip-cert-verify': true } : {}),
    ...(tls.alpn?.length ? { alpn: tls.alpn } : {}),
  }
}

function mihomoTransport(endpoint: ResolvedProxyEndpointIR) {
  if (!('transport' in endpoint) || !endpoint.transport || endpoint.transport.kind === 'tcp') return endpoint.protocol === 'vmess' || endpoint.protocol === 'vless' || endpoint.protocol === 'trojan' ? { network: 'tcp' as const } : {}
  const transport = endpoint.transport
  if (transport.kind === 'ws') return { network: 'ws' as const, 'ws-opts': { ...(transport.path ? { path: transport.path } : {}), ...(transport.host ? { headers: { Host: transport.host } } : {}) } }
  if (transport.kind === 'http') return { network: 'http' as const, 'http-opts': { ...(transport.path ? { path: [transport.path] } : {}), ...(transport.host ? { headers: { Host: [transport.host] } } : {}) } }
  return { network: 'grpc' as const, 'grpc-opts': { ...(transport.serviceName ? { 'grpc-service-name': transport.serviceName } : {}) } }
}

function pluginOptions(value: string | Record<string, string | number | boolean>) {
  if (typeof value !== 'string') return value
  return Object.fromEntries(value.split(';').filter(Boolean).map((entry) => {
    const separator = entry.indexOf('=')
    return separator < 0 ? [entry, true] : [entry.slice(0, separator), entry.slice(separator + 1)]
  }))
}

function keywordPattern(values: string[]) {
  return `(?i)${values.map((value) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}`
}

const unique = (values: string[]) => [...new Set(values)]
