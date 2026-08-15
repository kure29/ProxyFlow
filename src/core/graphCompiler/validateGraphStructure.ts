import type { ProxyFlowProject } from '../../types/project'
import type { SemanticIssue } from '../ir'
import { semanticIssue } from '../ir'

export function validateGraphStructure(project: ProxyFlowProject): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const nodeIds = new Set<string>()
  for (const node of project.graph.nodes) {
    if (nodeIds.has(node.id)) issues.push(semanticIssue(
      'GRAPH_DUPLICATE_NODE_ID', 'error', 'graph', `Duplicate graph node id "${node.id}".`,
      { nodeId: node.id, entity: { type: 'node', id: node.id } },
    ))
    nodeIds.add(node.id)
  }

  for (const edge of project.graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) issues.push(semanticIssue(
      'GRAPH_BROKEN_EDGE', 'error', 'graph', `Edge "${edge.id}" references a missing endpoint.`,
      { entity: { type: 'edge', id: edge.id } },
    ))
    if (edge.source === edge.target) issues.push(semanticIssue(
      'GRAPH_SELF_CONNECTION', 'error', 'graph', `Edge "${edge.id}" connects a node to itself.`,
      { nodeId: edge.source, entity: { type: 'edge', id: edge.id } },
    ))
    if (!edge.data?.semantic) issues.push(semanticIssue(
      'GRAPH_EDGE_SEMANTIC_MISSING', 'warning', 'graph', `Edge "${edge.id}" has no semantic type and will be ignored by compilation.`,
      { entity: { type: 'edge', id: edge.id } },
    ))
  }

  issues.push(...detectDataCycles(project))
  return issues
}

function detectDataCycles(project: ProxyFlowProject): SemanticIssue[] {
  const adjacency = new Map<string, string[]>()
  for (const edge of project.graph.edges) {
    if (edge.data?.semantic !== 'data') continue
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target])
  }
  const state = new Map<string, 'visiting' | 'visited'>()
  const stack: string[] = []

  const visit = (id: string): string[] | undefined => {
    if (state.get(id) === 'visiting') return [...stack.slice(stack.indexOf(id)), id]
    if (state.get(id) === 'visited') return undefined
    state.set(id, 'visiting')
    stack.push(id)
    for (const next of adjacency.get(id) ?? []) {
      const cycle = visit(next)
      if (cycle) return cycle
    }
    stack.pop()
    state.set(id, 'visited')
    return undefined
  }

  for (const node of project.graph.nodes) {
    const cycle = visit(node.id)
    if (cycle) return [semanticIssue(
      'GRAPH_DATA_CYCLE', 'error', 'graph', `Data-flow cycle detected: ${cycle.join(' → ')}.`,
      { nodeId: cycle[0], entity: { type: 'node', id: cycle[0] } },
    )]
  }
  return []
}
