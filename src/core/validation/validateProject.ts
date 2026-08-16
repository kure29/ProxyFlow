import type { GraphEdge, GraphNode, ValidationIssue } from '../../types/project'

export function validateGraph(nodes: GraphNode[], edges: GraphEdge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const incoming = (id: string) => edges.some((edge) => edge.target === id)
  const outgoing = (id: string) => edges.some((edge) => edge.source === id)

  for (const node of nodes) {
    if (node.data.disabled) continue
    const add = (code: string, message: string, severity: 'warning' | 'error' = 'warning') => {
      issues.push({ id: `${node.id}-${issues.length}`, code, nodeId: node.id, severity, message })
    }
    if (['subscription', 'manual-proxy', 'provider'].includes(node.data.blockType) && !outgoing(node.id)) add('UI_SOURCE_DISCONNECTED', 'This source is not connected to the processing flow.')
    if (['auto-select', 'manual-select', 'fallback', 'load-balance'].includes(node.data.blockType) && !incoming(node.id)) add('UI_STRATEGY_SOURCE_MISSING', 'This strategy has no proxy source.')
    if (node.data.blockType === 'proxy-chain' && (node.data.hopIds?.length ?? 0) === 0) add('UI_CHAIN_EMPTY', 'A proxy chain needs at least one hop.', 'error')
    if (['routing-group', 'service-rule', 'custom-rule'].includes(node.data.blockType) && !node.data.targetId) add('UI_ROUTE_TARGET_MISSING', 'This routing rule has no target strategy.')
    if (node.data.blockType === 'final' && !outgoing(node.id)) add('UI_FINAL_TARGET_MISSING', 'Final must connect to an outbound target.', 'error')
    if (node.data.blockType === 'output' && !node.data.client) add('UI_OUTPUT_CLIENT_MISSING', 'Select a target client.', 'error')
  }
  return issues
}
