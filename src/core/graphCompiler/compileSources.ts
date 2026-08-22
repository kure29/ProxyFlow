import type { ProxyTransportIR, SourceIR } from '../ir'
import { detectRegion } from '../proxy'
import { normalizePersistedSubscriptionExportMode, normalizeSubscriptionRequestProfile } from '../subscription'
import type { GraphCompileContext } from './context'

export function compileSources(context: GraphCompileContext): SourceIR[] {
  return context.project.graph.nodes.flatMap((node): SourceIR[] => {
    if (node.data.disabled) return []
    const base = { id: node.id, name: node.data.title }
    switch (node.data.blockType) {
      case 'subscription':
        return [compileSubscription(node.id, node.data.title, node.data, context)]
      case 'manual-proxy':
        return [{
          ...base,
          kind: 'manual-proxy',
          proxies: [compileManualProxy(node.id, node.data.title, node.data)],
        }]
      case 'provider':
        return [{ ...base, kind: 'provider', reference: node.data.subscriptionUrl || undefined, enabled: node.data.enabled ?? true }]
      case 'import-config':
        return [{ ...base, kind: 'imported-config' }]
      default:
        return []
    }
  })
}

function compileManualProxy(
  id: string,
  name: string,
  data: GraphCompileContext['project']['graph']['nodes'][number]['data'],
) {
  const server = data.proxyServer?.trim()
  const port = data.proxyPort
  if (!data.proxyProtocol || !server || !Number.isInteger(port) || port! < 1 || port! > 65_535) {
    return { kind: 'unmodeled' as const, protocol: 'unmodeled' as const, id, name }
  }
  const metadata = { sourceId: id, sourceName: name, region: detectRegion(name) }
  const credentials = { ...(data.proxyUsername ? { username: data.proxyUsername } : {}), ...(data.proxyPassword ? { password: data.proxyPassword } : {}) }
  const tls = data.proxyTls ? { enabled: true, ...(data.proxyServerName ? { serverName: data.proxyServerName } : {}), ...(data.proxyAllowInsecure ? { allowInsecure: true } : {}) } : undefined
  const transport = compileTransport(data)
  switch (data.proxyProtocol) {
    case 'socks':
    case 'socks5': return { kind: 'socks' as const, protocol: 'socks5' as const, id, name, server, port: port!, version: '5' as const, metadata, ...credentials }
    case 'http': return { kind: 'http' as const, protocol: 'http' as const, id, name, server, port: port!, metadata, ...credentials, ...(tls ? { tls } : {}) }
    case 'shadowsocks': return data.proxyMethod && data.proxyPassword
      ? { kind: 'shadowsocks' as const, protocol: 'shadowsocks' as const, id, name, server, port: port!, method: data.proxyMethod, password: data.proxyPassword, metadata }
      : { kind: 'unmodeled' as const, protocol: 'unmodeled' as const, id, name }
    case 'trojan': return data.proxyPassword
      ? { kind: 'trojan' as const, protocol: 'trojan' as const, id, name, server, port: port!, password: data.proxyPassword, tls: tls ?? { enabled: true, serverName: data.proxyServerName ?? server }, metadata, ...(transport ? { transport } : {}) }
      : { kind: 'unmodeled' as const, protocol: 'unmodeled' as const, id, name }
    case 'vmess': return data.proxyUuid
      ? { kind: 'vmess' as const, protocol: 'vmess' as const, id, name, server, port: port!, uuid: data.proxyUuid, security: data.proxySecurity ?? 'auto', ...(data.proxyAlterId !== undefined ? { alterId: data.proxyAlterId } : {}), metadata, ...(tls ? { tls } : {}), ...(transport ? { transport } : {}) }
      : { kind: 'unmodeled' as const, protocol: 'unmodeled' as const, id, name }
    case 'vless': return data.proxyUuid
      ? { kind: 'vless' as const, protocol: 'vless' as const, id, name, server, port: port!, uuid: data.proxyUuid, metadata, ...(tls ? { tls } : {}), ...(transport ? { transport } : {}) }
      : { kind: 'unmodeled' as const, protocol: 'unmodeled' as const, id, name }
    case 'anytls': return data.proxyPassword
      ? {
          kind: 'anytls' as const, protocol: 'anytls' as const, id, name, server, port: port!, password: data.proxyPassword, metadata,
          tls: {
            enabled: true, serverName: data.proxyServerName ?? server,
            ...(data.proxyAllowInsecure ? { allowInsecure: true } : {}),
            ...(data.proxyClientFingerprint?.trim() ? { fingerprint: data.proxyClientFingerprint.trim().toLocaleLowerCase() } : {}),
          },
          ...(data.proxyIdleSessionCheckInterval !== undefined ? { idleSessionCheckIntervalSeconds: data.proxyIdleSessionCheckInterval } : {}),
          ...(data.proxyIdleSessionTimeout !== undefined ? { idleSessionTimeoutSeconds: data.proxyIdleSessionTimeout } : {}),
          ...(data.proxyMinIdleSession !== undefined ? { minIdleSession: data.proxyMinIdleSession } : {}),
        }
      : { kind: 'unmodeled' as const, protocol: 'unmodeled' as const, id, name }
    default: return { kind: 'unmodeled' as const, protocol: 'unmodeled' as const, id, name }
  }
}

function compileSubscription(
  id: string,
  name: string,
  data: GraphCompileContext['project']['graph']['nodes'][number]['data'],
  context: GraphCompileContext,
): Extract<SourceIR, { kind: 'subscription' }> {
  const snapshot = context.subscriptionSnapshots[id]
  const result = snapshot?.result
  const inputKind = data.subscriptionInputKind ?? 'url'
  const url = data.subscriptionUrl?.trim()
  return {
    id, name, kind: 'subscription', url: url || undefined, enabled: data.enabled ?? true,
    ...(result ? { proxies: result.proxies } : {}),
    ...(inputKind === 'url' && url ? { remote: {
      kind: 'remote-subscription' as const,
      id,
      name,
      url,
      requestProfile: normalizeSubscriptionRequestProfile(data.subscriptionRequestProfile),
      exportMode: normalizePersistedSubscriptionExportMode(data.subscriptionExportMode),
      ...(snapshot ? { snapshot: {
        id: snapshot.snapshotId,
        contentHash: snapshot.contentHash,
        fetchedAt: snapshot.fetchedAt,
      } } : {}),
    } } : {}),
    materialization: {
      status: snapshot ? 'ready' : 'unavailable',
    },
  }
}

function compileTransport(data: GraphCompileContext['project']['graph']['nodes'][number]['data']): ProxyTransportIR | undefined {
  switch (data.proxyTransport) {
    case 'ws': return { kind: 'ws', ...(data.proxyTransportPath ? { path: data.proxyTransportPath } : {}), ...(data.proxyTransportHost ? { host: data.proxyTransportHost } : {}) }
    case 'http': return { kind: 'http', variant: 'http', ...(data.proxyTransportPath ? { path: data.proxyTransportPath } : {}), ...(data.proxyTransportHost ? { host: data.proxyTransportHost } : {}) }
    case 'grpc': return { kind: 'grpc', ...(data.proxyGrpcServiceName ? { serviceName: data.proxyGrpcServiceName } : {}) }
    case 'tcp': return { kind: 'tcp' }
    default: return undefined
  }
}
