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
        return [{ ...base, kind: 'manual-proxy', proxies: [] }]
      case 'provider':
        return [{ ...base, kind: 'provider', reference: node.data.subscriptionUrl || undefined, enabled: node.data.enabled ?? true }]
      case 'import-config':
        return [{ ...base, kind: 'imported-config' }]
      default:
        return []
    }
  })
}
