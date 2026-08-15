import type { GraphEdge, GraphNode, ProxyFlowProject } from '../../types/project'
import type { SemanticIssue } from '../ir'

export interface GraphCompileContext {
  project: ProxyFlowProject
  nodesById: Map<string, GraphNode>
  incomingEdges: Map<string, GraphEdge[]>
  outgoingEdges: Map<string, GraphEdge[]>
  serviceIdsByLookup: Map<string, string>
  issues: SemanticIssue[]
  addIssue: (issue: SemanticIssue) => void
}

export function createGraphCompileContext(project: ProxyFlowProject): GraphCompileContext {
  const nodesById = new Map(project.graph.nodes.map((node) => [node.id, node]))
  const incomingEdges = new Map<string, GraphEdge[]>()
  const outgoingEdges = new Map<string, GraphEdge[]>()

  for (const edge of project.graph.edges) {
    incomingEdges.set(edge.target, [...(incomingEdges.get(edge.target) ?? []), edge])
    outgoingEdges.set(edge.source, [...(outgoingEdges.get(edge.source) ?? []), edge])
  }

  const serviceIdsByLookup = new Map<string, string>()
  for (const service of project.services) {
    serviceIdsByLookup.set(service.id.toLowerCase(), service.id)
    serviceIdsByLookup.set(service.name.toLowerCase(), service.id)
  }

  const issues: SemanticIssue[] = []
  return {
    project,
    nodesById,
    incomingEdges,
    outgoingEdges,
    serviceIdsByLookup,
    issues,
    addIssue: (issue) => issues.push(issue),
  }
}
