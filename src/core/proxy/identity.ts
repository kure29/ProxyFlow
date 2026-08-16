import type { ResolvedProxyEndpointIR } from './model'

type ProxyIdentity = ResolvedProxyEndpointIR extends infer Endpoint
  ? Endpoint extends ResolvedProxyEndpointIR ? Omit<Endpoint, 'id' | 'name' | 'metadata'> : never
  : never

export function stableOpaqueHash(value: string): string {
  return `${fnv1a(value, 0x811c9dc5)}${fnv1a(value, 0x9e3779b9)}`
}

export function proxyIdentityMaterial(endpoint: ProxyIdentity): string {
  const common = [endpoint.protocol, endpoint.server.toLocaleLowerCase(), endpoint.port]
  switch (endpoint.protocol) {
    case 'http':
      return JSON.stringify([...common, endpoint.username ?? '', endpoint.password ?? '', endpoint.tls ?? null])
    case 'socks5':
      return JSON.stringify([...common, endpoint.username ?? '', endpoint.password ?? ''])
    case 'shadowsocks':
      return JSON.stringify([...common, endpoint.method, endpoint.password, endpoint.plugin ?? null])
    case 'trojan':
      return JSON.stringify([...common, endpoint.password, endpoint.tls, endpoint.transport ?? null])
    case 'vmess':
      return JSON.stringify([...common, endpoint.uuid, endpoint.security, endpoint.alterId ?? 0, endpoint.tls ?? null, endpoint.transport ?? null])
    case 'vless':
      return JSON.stringify([...common, endpoint.uuid, endpoint.tls ?? null, endpoint.transport ?? null])
  }
}

export function makeProxyId(sourceId: string, endpoint: ProxyIdentity): string {
  return `proxy-${stableOpaqueHash(`${sourceId}\u0000${proxyIdentityMaterial(endpoint)}`)}`
}

export function proxyFingerprint(endpoint: ResolvedProxyEndpointIR): string {
  const { id: _id, name: _name, metadata: _metadata, ...identity } = endpoint
  return stableOpaqueHash(proxyIdentityMaterial(identity))
}

function fnv1a(value: string, seed: number) {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
