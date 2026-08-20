import type { DnsIR } from '../../core/ir'
import type { SingBoxCompileContext } from './context'
import { singBoxIssue } from './errors'
import type { SingBoxConfig, SingBoxDnsServer } from './model'

export function compileSingBoxDns(dns: DnsIR | undefined, context: SingBoxCompileContext): SingBoxConfig['dns'] | undefined {
  if (!dns?.enabled) return undefined
  const resolvers = dns.resolvers ?? []
  if (resolvers.length === 0) {
    const tag = context.names.allocate('local-dns', 'local-dns')
    context.dnsTag = tag
    return { servers: [{ type: 'local', tag }], final: tag }
  }

  const servers: SingBoxDnsServer[] = []
  for (const resolver of resolvers) {
    const tag = context.names.allocate(resolver.id, 'dns')
    const server = resolver.address ? parseResolver(resolver.kind, resolver.address, tag) : undefined
    if (!server) {
      context.issues.push(singBoxIssue(
        'SINGBOX_INVALID_DNS', 'error', 'dns', `DNS resolver “${resolver.id}” 无法映射到 sing-box 1.13 DNS Server。`, resolver.id,
      ))
      continue
    }
    servers.push(server)
  }
  if (servers.length === 0) return undefined
  const final = servers[0].tag
  const needsBootstrap = servers.some((server) => server.type !== 'local' && !isIpAddress(server.server))
  if (needsBootstrap) {
    const bootstrapTag = context.names.allocate('local-dns', 'local-dns')
    for (let index = 0; index < servers.length; index += 1) {
      const server = servers[index]
      if (server.type !== 'local' && !isIpAddress(server.server)) servers[index] = { ...server, domain_resolver: bootstrapTag }
    }
    servers.unshift({ type: 'local', tag: bootstrapTag })
  }
  context.dnsTag = final
  return { servers, final }
}

function parseResolver(kind: 'doh' | 'dot' | 'udp' | 'system', address: string, tag: string): SingBoxDnsServer | undefined {
  if (kind === 'system') return { type: 'local', tag }
  if (kind === 'doh') {
    try {
      const url = new URL(address)
      if (url.protocol !== 'https:' || !url.hostname) return undefined
      return {
        type: 'https', tag, server: url.hostname,
        ...(url.port && url.port !== '443' ? { server_port: Number(url.port) } : {}),
        ...(url.pathname && url.pathname !== '/dns-query' ? { path: url.pathname } : {}),
      }
    } catch {
      return undefined
    }
  }
  try {
    const expected = kind === 'dot' ? 'tls:' : 'udp:'
    const value = address.includes('://') ? address : `${expected}//${address}`
    const url = new URL(value)
    if (url.protocol !== expected || !url.hostname) return undefined
    return {
      type: kind === 'dot' ? 'tls' : 'udp',
      tag,
      server: url.hostname,
      ...(url.port ? { server_port: Number(url.port) } : {}),
    }
  } catch {
    return undefined
  }
}

function isIpAddress(value: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(':')
}
