import type { Hysteria2PortIR, ProxySetRef, ProxyTlsIR, ProxyTransportIR, ResolvedProxyEndpointIR } from '../../core/ir'
import { materializeProxySet } from '../../core/proxySet'
import type { ResolvedProxyItem, SingBoxCompileContext } from './context'
import { singBoxIssue } from './errors'
import type { SingBoxOutbound, SingBoxTls, SingBoxV2RayTransport } from './model'

export function compileSingBoxProxyOutbounds(_context: SingBoxCompileContext) {
  // Outbounds are registered on demand from the ProxySet actually consumed by a strategy.
  // Fixed strategies register their referenced endpoint explicitly.
}

export function resolveSingBoxProxySet(ref: ProxySetRef, context: SingBoxCompileContext): ResolvedProxyItem[] {
  const cacheKey = `${ref.kind}:${ref.id}`
  const cached = context.proxySetCache.get(cacheKey)
  if (cached) return cached
  const materialized = materializeProxySet(context.ir, ref, context.materialization)
  if (materialized.status === 'error') {
    for (const issue of materialized.issues.filter((item) => item.severity === 'error')) context.issues.push(singBoxIssue(
      `SINGBOX_${issue.code}`, 'error', ref.kind === 'source' ? 'source' : 'transform', issue.message, issue.entityId ?? ref.id,
    ))
    return []
  }
  const resolved = materialized.proxies.map((endpoint) => ({ key: endpoint.id, endpoint, tag: registerSingBoxEndpoint(endpoint, context) }))
  context.proxySetCache.set(cacheKey, resolved)
  return resolved
}

export function registerSingBoxEndpoint(endpoint: ResolvedProxyEndpointIR, context: SingBoxCompileContext) {
  let tag = context.endpointTags.get(endpoint.id)
  if (!tag) {
    tag = context.names.allocate(endpoint.name, endpoint.id)
    context.endpointTags.set(endpoint.id, tag)
  }
  if (!context.outbounds.has(tag)) context.outbounds.set(tag, endpointOutbound(endpoint, tag, context.dnsTag))
  return tag
}

function endpointOutbound(endpoint: ResolvedProxyEndpointIR, tag: string, dnsTag?: string): SingBoxOutbound {
  const common = {
    tag, server: endpoint.server, server_port: endpoint.port,
    ...(dnsTag && !isIpAddress(endpoint.server) ? { domain_resolver: dnsTag } : {}),
  }
  switch (endpoint.protocol) {
    case 'socks5': return { type: 'socks', version: '5', ...common, ...(endpoint.username ? { username: endpoint.username } : {}), ...(endpoint.password ? { password: endpoint.password } : {}) }
    case 'http': return {
      type: 'http', ...common, ...(endpoint.username ? { username: endpoint.username } : {}), ...(endpoint.password ? { password: endpoint.password } : {}),
      ...(singBoxTls(endpoint.tls) ? { tls: singBoxTls(endpoint.tls) } : {}),
    }
    case 'shadowsocks': return {
      type: 'shadowsocks', ...common, method: endpoint.method, password: endpoint.password,
      ...(endpoint.plugin ? { plugin: endpoint.plugin.name, ...(endpoint.plugin.options ? { plugin_opts: pluginOptionsString(endpoint.plugin.options) } : {}) } : {}),
    }
    case 'trojan': return { type: 'trojan', ...common, password: endpoint.password, tls: singBoxTls(endpoint.tls)!, ...(singBoxTransport(endpoint.transport) ? { transport: singBoxTransport(endpoint.transport) } : {}) }
    case 'vmess': return {
      type: 'vmess', ...common, uuid: endpoint.uuid, security: endpoint.security, ...(endpoint.alterId !== undefined ? { alter_id: endpoint.alterId } : {}),
      ...(singBoxTls(endpoint.tls) ? { tls: singBoxTls(endpoint.tls) } : {}), ...(singBoxTransport(endpoint.transport) ? { transport: singBoxTransport(endpoint.transport) } : {}),
    }
    case 'vless': return {
      type: 'vless', ...common, uuid: endpoint.uuid,
      ...(endpoint.flow ? { flow: endpoint.flow } : {}),
      ...(singBoxTls(endpoint.tls) ? { tls: singBoxTls(endpoint.tls) } : {}), ...(singBoxTransport(endpoint.transport) ? { transport: singBoxTransport(endpoint.transport) } : {}),
    }
    case 'hysteria2': return {
      type: 'hysteria2', ...common, password: endpoint.password, tls: singBoxTls(endpoint.tls)!,
      ...(endpoint.serverPorts?.length ? { server_ports: endpoint.serverPorts.map(singBoxPort) } : {}),
      ...(endpoint.hopInterval?.kind === 'fixed' ? { hop_interval: `${endpoint.hopInterval.seconds}s` } : {}),
      ...(endpoint.upMbps !== undefined ? { up_mbps: endpoint.upMbps } : {}), ...(endpoint.downMbps !== undefined ? { down_mbps: endpoint.downMbps } : {}),
      ...(endpoint.obfs ? { obfs: endpoint.obfs } : {}),
    }
    case 'tuic': return {
      type: 'tuic', ...common, uuid: endpoint.uuid, password: endpoint.password, tls: singBoxTls(endpoint.tls)!,
      ...(endpoint.congestionControl ? { congestion_control: endpoint.congestionControl } : {}),
      ...(endpoint.udpRelayMode ? { udp_relay_mode: endpoint.udpRelayMode } : {}),
    }
    case 'anytls': return {
      type: 'anytls', ...common, password: endpoint.password, tls: singBoxTls(endpoint.tls)!,
      ...(endpoint.idleSessionCheckIntervalSeconds !== undefined ? { idle_session_check_interval: `${endpoint.idleSessionCheckIntervalSeconds}s` } : {}),
      ...(endpoint.idleSessionTimeoutSeconds !== undefined ? { idle_session_timeout: `${endpoint.idleSessionTimeoutSeconds}s` } : {}),
      ...(endpoint.minIdleSession !== undefined ? { min_idle_session: endpoint.minIdleSession } : {}),
    }
  }
}

function singBoxTls(tls?: ProxyTlsIR): SingBoxTls | undefined {
  return tls?.enabled ? {
    enabled: true, ...(tls.serverName ? { server_name: tls.serverName } : {}), ...(tls.disableSni ? { disable_sni: true } : {}), ...(tls.allowInsecure ? { insecure: true } : {}), ...(tls.alpn?.length ? { alpn: tls.alpn } : {}),
    ...(tls.fingerprint ? { utls: { enabled: true, fingerprint: tls.fingerprint } } : {}),
    ...(tls.reality ? { reality: { enabled: true, public_key: tls.reality.publicKey, ...(tls.reality.shortId ? { short_id: tls.reality.shortId } : {}) } } : {}),
  } : undefined
}

function singBoxPort(port: Hysteria2PortIR) {
  return port.kind === 'single' ? String(port.port) : `${port.start}:${port.end}`
}

function singBoxTransport(transport?: ProxyTransportIR): SingBoxV2RayTransport | undefined {
  if (!transport || transport.kind === 'tcp') return undefined
  if (transport.kind === 'ws') return { type: 'ws', ...(transport.path ? { path: transport.path } : {}), ...(transport.host ? { headers: { Host: transport.host } } : {}), ...(transport.maxEarlyData !== undefined ? { max_early_data: transport.maxEarlyData } : {}), ...(transport.earlyDataHeaderName ? { early_data_header_name: transport.earlyDataHeaderName } : {}) }
  if (transport.kind === 'http') return { type: 'http', ...(transport.path ? { path: transport.path } : {}), ...(transport.host ? { host: [transport.host] } : {}) }
  if (transport.kind === 'grpc') return { type: 'grpc', ...(transport.serviceName ? { service_name: transport.serviceName } : {}) }
  if (transport.kind === 'httpupgrade') return { type: 'httpupgrade', ...(transport.path ? { path: transport.path } : {}), ...(transport.host ? { host: transport.host } : {}) }
  return undefined
}

function pluginOptionsString(value: string | Record<string, string | number | boolean>) {
  return typeof value === 'string' ? value : Object.entries(value).map(([key, item]) => item === true ? key : `${key}=${String(item)}`).join(';')
}

function isIpAddress(value: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(':')
}
