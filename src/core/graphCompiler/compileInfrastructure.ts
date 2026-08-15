import type { DnsIR, OutputIR } from '../ir'
import { semanticIssue } from '../ir'
import type { GraphCompileContext } from './context'

export function compileDns(context: GraphCompileContext): DnsIR | undefined {
  const dnsNodes = context.project.graph.nodes.filter((node) => !node.data.disabled && node.data.blockType === 'dns')
  if (dnsNodes.length === 0) return undefined
  if (dnsNodes.length > 1) context.addIssue(semanticIssue(
    'DNS_MULTIPLE', 'warning', 'compile', 'Multiple DNS nodes exist; deterministic node order selects the first one.',
    { nodeId: dnsNodes[0].id, entity: { type: 'dns', id: dnsNodes[0].id } },
  ))
  const node = dnsNodes[0]
  if (!node.data.resolver) {
    context.addIssue(semanticIssue(
      'DNS_RESOLVER_MISSING', 'warning', 'compile', `DNS node "${node.data.title}" has no explicit resolver.`,
      { nodeId: node.id, entity: { type: 'dns', id: node.id } },
    ))
    return { enabled: true, mode: 'automatic' }
  }
  return {
    enabled: true,
    mode: 'custom',
    resolvers: [{ id: `${node.id}-primary`, kind: resolverKind(node.data.resolver), address: node.data.resolver }],
  }
}

export function compileOutputs(context: GraphCompileContext): OutputIR[] {
  return context.project.graph.nodes.flatMap((node): OutputIR[] => {
    if (node.data.disabled || node.data.blockType !== 'output') return []
    if (!node.data.client) {
      context.addIssue(semanticIssue(
        'OUTPUT_TARGET_MISSING', 'error', 'compile', `Output "${node.data.title}" has no target client.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      return []
    }
    return [{ id: node.id, name: node.data.title, target: node.data.client, enabled: true }]
  })
}

function resolverKind(address: string): 'doh' | 'dot' | 'udp' | 'system' {
  if (address.startsWith('https://')) return 'doh'
  if (address.startsWith('tls://')) return 'dot'
  if (/^\d{1,3}(\.\d{1,3}){3}/.test(address)) return 'udp'
  return 'system'
}
