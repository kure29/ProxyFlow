import type { StrategyIR } from '../ir'
import { semanticIssue } from '../ir'
import type { GraphCompileContext } from './context'
import { firstProxySetInput, healthCheckForNode, incomingCandidateRefs } from './helpers'

export function compileStrategies(context: GraphCompileContext): StrategyIR[] {
  return context.project.graph.nodes.flatMap((node): StrategyIR[] => {
    if (node.data.disabled) return []
    const base = { id: node.id, name: node.data.title }
    switch (node.data.blockType) {
      case 'fixed-proxy':
        return [{ ...base, kind: 'fixed', proxyId: node.data.proxyId }]
      case 'manual-select':
        return [{ ...base, kind: 'select', candidates: incomingCandidateRefs(node, context) }]
      case 'auto-select': {
        const source = firstProxySetInput(node, context, 'AUTO_SELECT_MISSING_SOURCE')
        return source ? [{ ...base, kind: 'auto-select', source, healthCheck: healthCheckForNode(node) }] : []
      }
      case 'fallback':
        return [{ ...base, kind: 'fallback', candidates: incomingCandidateRefs(node, context), healthCheck: healthCheckForNode(node) }]
      case 'load-balance': {
        const source = firstProxySetInput(node, context, 'LOAD_BALANCE_MISSING_SOURCE')
        return source ? [{ ...base, kind: 'load-balance', source, mode: node.data.loadBalanceMode }] : []
      }
      case 'proxy-chain': {
        const hopIds = node.data.hopIds ?? []
        validateChainEdgeConsistency(node.id, node.data.title, hopIds, context)
        return [{ ...base, kind: 'chain', hops: hopIds.map((id) => ({ kind: 'strategy', id })) }]
      }
      default:
        return []
    }
  })
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
