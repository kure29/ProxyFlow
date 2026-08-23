import type { GraphEdge, GraphNode, ProxyFlowProject } from '../../types/project'
import type { SemanticIssue } from '../ir'
import type { SubscriptionSnapshot } from '../subscription'
import type { PrimaryTarget } from '../capabilities'

export interface GraphCompileOptions {
  subscriptionSnapshots?: Record<string, SubscriptionSnapshot>
  /** Overrides Project metadata for target-specific authoring validation only. */
  validationTarget?: PrimaryTarget | null
  /** Inspector/runtime diagnostics only. Target compilers must never consume an invalid retained draft. */
  retainDraftOnErrorForDiagnostics?: boolean
}

export interface GraphCompileContext {
  project: ProxyFlowProject
  nodesById: Map<string, GraphNode>
  incomingEdges: Map<string, GraphEdge[]>
  outgoingEdges: Map<string, GraphEdge[]>
  serviceIdsByLookup: Map<string, string>
  issues: SemanticIssue[]
  addIssue: (issue: SemanticIssue) => void
  subscriptionSnapshots: Record<string, SubscriptionSnapshot>
}

export function createGraphCompileContext(project: ProxyFlowProject, options: GraphCompileOptions = {}): GraphCompileContext {
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
    subscriptionSnapshots: options.subscriptionSnapshots ?? {},
  }
}
