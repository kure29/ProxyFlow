import type { StrategyIR } from '../ir'
import { semanticIssue } from '../ir'
import { normalizeStrategyNode, type NormalizedStrategyIntent } from '../project/intentNormalization'
import type { GraphCompileContext } from './context'
import { firstProxySetInput, incomingCandidateRefs } from './helpers'

export function compileStrategies(context: GraphCompileContext): StrategyIR[] {
  return context.project.graph.nodes.flatMap((node): StrategyIR[] => {
    if (node.data.disabled) return []
    const shape = normalizeStrategyNode(node)
    if (!shape || shape.disabled) return []

    const references = shape.kind === 'select' || shape.kind === 'fallback'
      ? { candidates: incomingCandidateRefs(node, context) }
      : shape.kind === 'auto-select' || shape.kind === 'load-balance'
        ? { source: firstProxySetInput(node, context, shape.kind === 'auto-select' ? 'AUTO_SELECT_MISSING_SOURCE' : 'LOAD_BALANCE_MISSING_SOURCE') }
        : {}
    const intent = normalizeStrategyNode(node, references)
    if (!intent || intent.disabled) return []
    if (intent.kind === 'chain') {
      validateChainEdgeConsistency(intent.id, intent.name, intent.hops.map((hop) => hop.id), context)
    }
    return intentToIR(intent)
  })
}

function intentToIR(intent: NormalizedStrategyIntent): StrategyIR[] {
  switch (intent.kind) {
    case 'fixed':
      return [{ id: intent.id, name: intent.name, kind: 'fixed', proxyId: intent.proxyId }]
    case 'select':
      return [{ id: intent.id, name: intent.name, kind: 'select', candidates: intent.candidates }]
    case 'auto-select':
      return intent.source ? [{ id: intent.id, name: intent.name, kind: 'auto-select', source: intent.source, healthCheck: intent.healthCheck }] : []
    case 'fallback':
      return [{ id: intent.id, name: intent.name, kind: 'fallback', candidates: intent.candidates, healthCheck: intent.healthCheck }]
    case 'load-balance':
      return intent.source ? [{ id: intent.id, name: intent.name, kind: 'load-balance', source: intent.source, mode: intent.mode }] : []
    case 'chain':
      return [{ id: intent.id, name: intent.name, kind: 'chain', hops: intent.hops }]
  }
}

function validateChainEdgeConsistency(
  nodeId: string,
  name: string,
  hopIds: string[],
  context: GraphCompileContext,
) {
  const visualHopIds = (context.incomingEdges.get(nodeId) ?? [])
    .filter((edge) => edge.data?.semantic === 'strategy')
    .map((edge) => edge.source)
  const hopSet = new Set(hopIds)
  const visualSet = new Set(visualHopIds)
  const differs = hopSet.size !== visualSet.size
    || [...hopSet].some((id) => !visualSet.has(id))
    || [...visualSet].some((id) => !hopSet.has(id))
  if (differs) context.addIssue(semanticIssue(
    'CHAIN_EDGE_MISMATCH',
    'warning',
    'compile',
    `Chain "${name}" hopIds and visual strategy edges are inconsistent; hopIds define semantic order.`,
    { nodeId, entity: { type: 'chain', id: nodeId } },
  ))
}
