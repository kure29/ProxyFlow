import type { SourceIR } from '../ir'
import { normalizeSourceNode, type NormalizedSourceIntent } from '../project/intentNormalization'
import type { GraphCompileContext } from './context'

export function compileSources(context: GraphCompileContext): SourceIR[] {
  return context.project.graph.nodes.flatMap((node): SourceIR[] => {
    if (node.data.disabled) return []
    const intent = normalizeSourceNode(node, context.subscriptionSnapshots[node.id])
    if (!intent || intent.disabled) return []
    return [compileSource(intent)]
  })
}

function compileSource(intent: NormalizedSourceIntent): SourceIR {
  switch (intent.kind) {
    case 'subscription':
      return {
        id: intent.id,
        name: intent.name,
        kind: 'subscription',
        url: intent.url,
        enabled: intent.enabled,
        ...(intent.proxies ? { proxies: intent.proxies } : {}),
        ...(intent.url && intent.inputKind === 'url' ? { remote: {
          kind: 'remote-subscription',
          id: intent.id,
          name: intent.name,
          url: intent.url,
          requestProfile: intent.requestProfile,
          exportMode: intent.exportMode,
          ...(intent.snapshot ? { snapshot: intent.snapshot } : {}),
        } } : {}),
        materialization: { status: intent.materializationStatus },
      }
    case 'manual-proxy':
      return { id: intent.id, name: intent.name, kind: 'manual-proxy', proxies: [intent.endpoint] }
    case 'provider':
      return { id: intent.id, name: intent.name, kind: 'provider', reference: intent.reference, enabled: intent.enabled }
    case 'imported-config':
      return { id: intent.id, name: intent.name, kind: 'imported-config' }
  }
}
