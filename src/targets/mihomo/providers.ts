import type { Hysteria2HopIntervalIR, Hysteria2PortIR, ProxySetRef, ProxyTlsIR, ResolvedProxyEndpointIR } from '../../core/ir'
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
  context.compiledEndpointIds.add(endpoint.id)
  if (!context.proxies.has(name)) context.proxies.set(name, endpointProxy(endpoint, name))
  return name
}

function endpointProxy(endpoint: ResolvedProxyEndpointIR, name: string): MihomoProxy {
  const common = { name, server: endpoint.server, port: endpoint.port, udp: endpoint.protocol !== 'http', ...mihomoTransport(endpoint) }
  switch (endpoint.protocol) {
    case 'http': return { ...common, type: 'http', ...(endpoint.username ? { username: endpoint.username } : {}), ...(endpoint.password ? { password: endpoint.password } : {}), ...mihomoTls(endpoint.tls, 'sni') }
    case 'socks5': return { ...common, type: 'socks5', ...(endpoint.username ? { username: endpoint.username } : {}), ...(endpoint.password ? { password: endpoint.password } : {}) }
    case 'shadowsocks': return {
      ...common, type: 'ss', cipher: endpoint.method, password: endpoint.password,
      ...(endpoint.plugin ? { plugin: endpoint.plugin.name, ...(endpoint.plugin.options ? { 'plugin-opts': pluginOptions(endpoint.plugin.options) } : {}) } : {}),
    }
    case 'trojan': return { ...common, type: 'trojan', password: endpoint.password, ...mihomoTls(endpoint.tls, 'sni') }
    case 'vmess': return { ...common, type: 'vmess', uuid: endpoint.uuid, alterId: endpoint.alterId ?? 0, cipher: endpoint.security, ...mihomoTls(endpoint.tls, 'servername') }
    case 'vless': return { ...common, type: 'vless', uuid: endpoint.uuid, ...(endpoint.flow ? { flow: endpoint.flow } : {}), ...mihomoTls(endpoint.tls, 'servername') }
    case 'hysteria2': return {
      ...common, type: 'hysteria2', password: endpoint.password, ...mihomoQuicTls(endpoint.tls),
      ...(endpoint.obfs ? { obfs: endpoint.obfs.type, 'obfs-password': endpoint.obfs.password } : {}),
      ...(endpoint.upMbps !== undefined ? { up: endpoint.upMbps } : {}), ...(endpoint.downMbps !== undefined ? { down: endpoint.downMbps } : {}),
      ...(endpoint.serverPorts?.length ? { ports: endpoint.serverPorts.map(mihomoPort).join(',') } : {}),
      ...(endpoint.hopInterval ? { 'hop-interval': mihomoHopInterval(endpoint.hopInterval) } : {}),
    }
    case 'tuic': return {
      ...common, type: 'tuic', uuid: endpoint.uuid, password: endpoint.password, ...mihomoQuicTls(endpoint.tls),
      ...(endpoint.tls.disableSni ? { 'disable-sni': true } : {}),
      ...(endpoint.congestionControl ? { 'congestion-controller': endpoint.congestionControl } : {}),
      ...(endpoint.udpRelayMode ? { 'udp-relay-mode': endpoint.udpRelayMode } : {}),
    }
    case 'anytls': return {
      ...common, type: 'anytls', password: endpoint.password, udp: endpoint.udpEnabled ?? true,
      ...(endpoint.tls.serverName ? { sni: endpoint.tls.serverName } : {}),
      ...(endpoint.tls.allowInsecure ? { 'skip-cert-verify': true } : {}),
      ...(endpoint.tls.alpn?.length ? { alpn: endpoint.tls.alpn } : {}),
      ...(endpoint.tls.fingerprint ? { 'client-fingerprint': endpoint.tls.fingerprint } : {}),
      ...(endpoint.idleSessionCheckIntervalSeconds !== undefined ? { 'idle-session-check-interval': endpoint.idleSessionCheckIntervalSeconds } : {}),
      ...(endpoint.idleSessionTimeoutSeconds !== undefined ? { 'idle-session-timeout': endpoint.idleSessionTimeoutSeconds } : {}),
      ...(endpoint.minIdleSession !== undefined ? { 'min-idle-session': endpoint.minIdleSession } : {}),
    }
  }
}

function mihomoPort(port: Hysteria2PortIR) {
  return port.kind === 'single' ? String(port.port) : `${port.start}-${port.end}`
}

function mihomoHopInterval(interval: Hysteria2HopIntervalIR) {
  return interval.kind === 'fixed' ? interval.seconds : `${interval.minSeconds}-${interval.maxSeconds}`
}

function mihomoTls(tls: ProxyTlsIR | undefined, nameField: 'sni' | 'servername') {
  if (!tls?.enabled) return {}
  return {
    tls: true,
    ...(tls.serverName ? { [nameField]: tls.serverName } : {}),
    ...(tls.allowInsecure ? { 'skip-cert-verify': true } : {}),
    ...(tls.alpn?.length ? { alpn: tls.alpn } : {}),
    ...(tls.fingerprint ? { 'client-fingerprint': tls.fingerprint } : {}),
    ...(tls.reality ? { 'reality-opts': { 'public-key': tls.reality.publicKey, ...(tls.reality.shortId ? { 'short-id': tls.reality.shortId } : {}) } } : {}),
  }
}

function mihomoQuicTls(tls: ProxyTlsIR) {
  return {
    ...(tls.serverName ? { sni: tls.serverName } : {}),
    ...(tls.allowInsecure ? { 'skip-cert-verify': true } : {}),
    ...(tls.alpn?.length ? { alpn: tls.alpn } : {}),
  }
}

function mihomoTransport(endpoint: ResolvedProxyEndpointIR) {
  if (!('transport' in endpoint) || !endpoint.transport || endpoint.transport.kind === 'tcp') return endpoint.protocol === 'vmess' || endpoint.protocol === 'vless' || endpoint.protocol === 'trojan' ? { network: 'tcp' as const } : {}
  const transport = endpoint.transport
  if (transport.kind === 'ws') return { network: 'ws' as const, 'ws-opts': {
    ...(transport.path ? { path: transport.path } : {}), ...(transport.host ? { headers: { Host: transport.host } } : {}),
    ...(transport.maxEarlyData !== undefined ? { 'max-early-data': transport.maxEarlyData } : {}),
    ...(transport.earlyDataHeaderName ? { 'early-data-header-name': transport.earlyDataHeaderName } : {}),
  } }
  if (transport.kind === 'http') return transport.variant === 'h2'
    ? { network: 'h2' as const, 'h2-opts': { ...(transport.path ? { path: transport.path } : {}), ...(transport.host ? { host: [transport.host] } : {}) } }
    : { network: 'http' as const, 'http-opts': { ...(transport.path ? { path: [transport.path] } : {}), ...(transport.host ? { headers: { Host: [transport.host] } } : {}) } }
  if (transport.kind === 'grpc') return { network: 'grpc' as const, 'grpc-opts': { ...(transport.serviceName ? { 'grpc-service-name': transport.serviceName } : {}) } }
  if (transport.kind === 'httpupgrade') return { network: 'ws' as const, 'ws-opts': { ...(transport.path ? { path: transport.path } : {}), ...(transport.host ? { headers: { Host: transport.host } } : {}), 'v2ray-http-upgrade': true } }
  return { network: 'xhttp' as const, 'xhttp-opts': { ...(transport.path ? { path: transport.path } : {}), ...(transport.host ? { host: transport.host } : {}), ...(transport.mode ? { mode: transport.mode } : {}) } }
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
