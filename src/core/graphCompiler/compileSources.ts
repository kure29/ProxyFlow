import type { SourceIR } from '../ir'
import type { GraphCompileContext } from './context'

export function compileSources(context: GraphCompileContext): SourceIR[] {
  return context.project.graph.nodes.flatMap((node): SourceIR[] => {
    if (node.data.disabled) return []
    const base = { id: node.id, name: node.data.title }
    switch (node.data.blockType) {
      case 'subscription':
        return [{ ...base, kind: 'subscription', url: node.data.subscriptionUrl || undefined, enabled: node.data.enabled ?? true }]
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
  const credentials = {
    ...(data.proxyUsername ? { username: data.proxyUsername } : {}),
    ...(data.proxyPassword ? { password: data.proxyPassword } : {}),
  }
  return data.proxyProtocol === 'socks'
    ? { kind: 'socks' as const, id, name, server, port: port!, version: '5' as const, ...credentials }
    : { kind: 'http' as const, id, name, server, port: port!, ...credentials }
}
