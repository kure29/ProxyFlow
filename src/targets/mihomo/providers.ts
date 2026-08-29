import type { Hysteria2HopIntervalIR, Hysteria2PortIR, ProxySetRef, ProxyTlsIR, ResolvedProxyEndpointIR } from '../../core/ir'
import { isOpaqueProxyPreservation, type JsonObject } from '../../core/proxy'
import { materializeProxySet, planRemoteProxySource, type RemoteSourceConsumer } from '../../core/proxySet'
import type { MihomoCompileContext, ResolvedProxySet } from './context'
import { MIHOMO_DEFAULTS } from './defaults'
import { mihomoIssue } from './errors'
import type { MihomoProxy } from './model'
import { safePathSegment } from './naming'
import { mihomoRemoteProxySourceAdapter } from './remoteSourceAdapter'

export function compileMihomoProviders(context: MihomoCompileContext) {
  for (const source of context.ir.sources) {
    if (source.kind !== 'provider') continue
    const url = source.reference
    if (!url) continue
    const name = context.sourceNames.get(source.id)!
    context.providers.set(name, {
      type: 'http', url, path: `./providers/${safePathSegment(name)}.yaml`, interval: MIHOMO_DEFAULTS.providerIntervalSeconds,
      'health-check': { enable: true, url: MIHOMO_DEFAULTS.healthCheckUrl, interval: MIHOMO_DEFAULTS.healthCheckIntervalSeconds, lazy: true },
    })
  }
}

export function resolveProxySet(ref: ProxySetRef, context: MihomoCompileContext, consumer: RemoteSourceConsumer): ResolvedProxySet {
  if (ref.kind === 'source') {
    const source = context.ir.sources.find((item) => item.id === ref.id)
    if (source?.kind === 'provider') {
      const providerName = context.sourceNames.get(source.id)
      return { providers: providerName && context.providers.has(providerName) ? [providerName] : [], proxyNames: [], include: [], exclude: [] }
    }
  }

  const remotePlan = planAndReportRemoteProxySet(ref, context, consumer)
  if (remotePlan.decision === 'unsupported') return { providers: [], proxyNames: [], include: [], exclude: [] }
  if (remotePlan.decision === 'native-remote' && remotePlan.source) {
    const lowered = mihomoRemoteProxySourceAdapter.lower(remotePlan.source)
    if (!context.providers.has(lowered.key)) context.providers.set(lowered.key, lowered.provider)
    return { providers: [lowered.key], proxyNames: [], include: [], exclude: [] }
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

export function planAndReportRemoteProxySet(ref: ProxySetRef, context: MihomoCompileContext, consumer: RemoteSourceConsumer) {
  const remotePlan = planRemoteProxySource(
    context.ir,
    ref,
    mihomoRemoteProxySourceAdapter.capabilities,
    consumer,
  )
  for (const diagnostic of remotePlan.diagnostics) context.issues.push(mihomoIssue(
    diagnostic.code,
    diagnostic.severity,
    'remote-source',
    diagnostic.message,
    diagnostic.sourceId ?? ref.id,
  ))
  return remotePlan
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
    case 'http': return mergeOpaqueMihomo(endpoint, { ...common, type: 'http', ...(endpoint.username ? { username: endpoint.username } : {}), ...(endpoint.password ? { password: endpoint.password } : {}), ...mihomoTls(endpoint.tls, 'sni') })
    case 'socks5': return mergeOpaqueMihomo(endpoint, { ...common, type: 'socks5', ...(endpoint.username ? { username: endpoint.username } : {}), ...(endpoint.password ? { password: endpoint.password } : {}) })
    case 'shadowsocks': return mergeOpaqueMihomo(endpoint, {
      ...common, type: 'ss', cipher: endpoint.method, password: endpoint.password,
      ...(endpoint.plugin ? { plugin: endpoint.plugin.name, ...(endpoint.plugin.options ? { 'plugin-opts': pluginOptions(endpoint.plugin.options) } : {}) } : {}),
    })
    case 'trojan': return mergeOpaqueMihomo(endpoint, { ...common, type: 'trojan', password: endpoint.password, ...mihomoTls(endpoint.tls, 'sni') })
    case 'vmess': return mergeOpaqueMihomo(endpoint, { ...common, type: 'vmess', uuid: endpoint.uuid, alterId: endpoint.alterId ?? 0, cipher: endpoint.security, ...mihomoTls(endpoint.tls, 'servername') })
    case 'vless': return mergeOpaqueMihomo(endpoint, { ...common, type: 'vless', uuid: endpoint.uuid, ...(endpoint.flow ? { flow: endpoint.flow } : {}), ...mihomoTls(endpoint.tls, 'servername') })
    case 'hysteria2': return mergeOpaqueMihomo(endpoint, {
      ...common, type: 'hysteria2', password: endpoint.password, ...mihomoQuicTls(endpoint.tls),
      ...(endpoint.obfs ? { obfs: endpoint.obfs.type, 'obfs-password': endpoint.obfs.password } : {}),
      ...(endpoint.upMbps !== undefined ? { up: endpoint.upMbps } : {}), ...(endpoint.downMbps !== undefined ? { down: endpoint.downMbps } : {}),
      ...(endpoint.serverPorts?.length ? { ports: endpoint.serverPorts.map(mihomoPort).join(',') } : {}),
      ...(endpoint.hopInterval ? { 'hop-interval': mihomoHopInterval(endpoint.hopInterval) } : {}),
    })
    case 'tuic': return mergeOpaqueMihomo(endpoint, {
      ...common, type: 'tuic', uuid: endpoint.uuid, password: endpoint.password, ...mihomoQuicTls(endpoint.tls),
      ...(endpoint.tls.disableSni ? { 'disable-sni': true } : {}),
      ...(endpoint.congestionControl ? { 'congestion-controller': endpoint.congestionControl } : {}),
      ...(endpoint.udpRelayMode ? { 'udp-relay-mode': endpoint.udpRelayMode } : {}),
    })
    case 'anytls': return mergeOpaqueMihomo(endpoint, {
      ...common, type: 'anytls', password: endpoint.password, udp: endpoint.udpEnabled ?? true,
      ...(endpoint.tls.serverName ? { sni: endpoint.tls.serverName } : {}),
      ...(endpoint.tls.allowInsecure ? { 'skip-cert-verify': true } : {}),
      ...(endpoint.tls.alpn?.length ? { alpn: endpoint.tls.alpn } : {}),
      ...(endpoint.tls.fingerprint ? { 'client-fingerprint': endpoint.tls.fingerprint } : {}),
      ...(endpoint.idleSessionCheckIntervalSeconds !== undefined ? { 'idle-session-check-interval': endpoint.idleSessionCheckIntervalSeconds } : {}),
      ...(endpoint.idleSessionTimeoutSeconds !== undefined ? { 'idle-session-timeout': endpoint.idleSessionTimeoutSeconds } : {}),
      ...(endpoint.minIdleSession !== undefined ? { 'min-idle-session': endpoint.minIdleSession } : {}),
    })
  }
}

/** Re-emit opaque fields only when Mihomo owns their imported provenance. */
function mergeOpaqueMihomo(endpoint: ResolvedProxyEndpointIR, generated: MihomoProxy): MihomoProxy {
  if (!isOpaqueProxyPreservation(endpoint.opaque)) return generated
  return deepMergeJson(endpoint.opaque.fields, generated as unknown as Record<string, unknown>) as unknown as MihomoProxy
}

function deepMergeJson(base: JsonObject | Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = Object.create(null)
  for (const [key, value] of Object.entries(base)) merged[key] = cloneMergeValue(value)
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key]
    merged[key] = isRecord(current) && isRecord(value)
      ? deepMergeJson(current, value)
      : cloneMergeValue(value)
  }
  return merged
}

function cloneMergeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneMergeValue)
  if (isRecord(value)) return deepMergeJson(value, {})
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
