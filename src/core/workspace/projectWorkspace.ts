import { getTargetCapabilities, type CapabilityStatus, type TransportCapability } from '../capabilities'
import { compileGraph } from '../graphCompiler'
import { isUnmodeledProxy } from '../ir'
import type { ResolvedProxyEndpointIR, SupportedProxyProtocol } from '../proxy'
import { resolveProjectPrimaryTarget, type PrimaryTargetResolution } from '../project/primaryTarget'
import { rankRoutingRules } from '../routing/routeProductModel'
import type { SubscriptionSnapshot } from '../subscription'
import type { BlockNodeData, EdgeSemantic, GraphNode, ProxyFlowProject } from '../../types/project'

export type WorkspaceSectionId = 'sources' | 'proxies' | 'processing' | 'strategies' | 'routing' | 'dns' | 'inspect' | 'export'

export interface WorkspaceConnection {
  edgeId: string
  nodeId: string
  semantic: EdgeSemantic
}

export interface WorkspaceNodeItem {
  node: GraphNode
  incoming: WorkspaceConnection[]
  outgoing: WorkspaceConnection[]
}

export interface WorkspaceProxySummary {
  id: string
  name: string
  protocol: SupportedProxyProtocol | 'unmodeled'
  region: string
  sourceId: string
  sourceName: string
  compatibility: CapabilityStatus | 'unknown'
}

export interface WorkspaceRoutingItem extends WorkspaceNodeItem {
  priority: number
  order: number
}

export interface WorkspaceProjection {
  primaryTarget: PrimaryTargetResolution
  sources: WorkspaceNodeItem[]
  proxies: WorkspaceProxySummary[]
  processing: WorkspaceNodeItem[]
  strategies: WorkspaceNodeItem[]
  chains: WorkspaceNodeItem[]
  routing: WorkspaceRoutingItem[]
  finalRoutes: WorkspaceNodeItem[]
  dns: WorkspaceNodeItem[]
  outputs: WorkspaceNodeItem[]
  compileIssues: ReturnType<typeof compileGraph>['issues']
}

export interface WorkspaceProjectionOptions {
  subscriptionSnapshots?: Record<string, SubscriptionSnapshot>
}

export function createWorkspaceProjection(
  project: ProxyFlowProject,
  options: WorkspaceProjectionOptions = {},
): WorkspaceProjection {
  const incoming = new Map<string, WorkspaceConnection[]>()
  const outgoing = new Map<string, WorkspaceConnection[]>()
  for (const edge of project.graph.edges) {
    if (!edge.data?.semantic) continue
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), {
      edgeId: edge.id, nodeId: edge.source, semantic: edge.data.semantic,
    }])
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), {
      edgeId: edge.id, nodeId: edge.target, semantic: edge.data.semantic,
    }])
  }

  const itemById = new Map(project.graph.nodes.map((node) => [node.id, {
    node,
    incoming: incoming.get(node.id) ?? [],
    outgoing: outgoing.get(node.id) ?? [],
  } satisfies WorkspaceNodeItem]))
  const items = project.graph.nodes.map((node) => itemById.get(node.id)!)
  const compiled = compileGraph(project, {
    subscriptionSnapshots: options.subscriptionSnapshots,
    retainDraftOnErrorForDiagnostics: true,
  })
  const primaryTarget = resolveProjectPrimaryTarget(project)

  return {
    primaryTarget,
    sources: items.filter(({ node }) => node.data.category === 'source'),
    proxies: summarizeProxies(compiled.ir?.sources ?? [], primaryTarget),
    processing: items.filter(({ node }) => node.data.category === 'processing'),
    strategies: items.filter(({ node }) => node.data.category === 'strategy'),
    chains: items.filter(({ node }) => node.data.category === 'chain'),
    routing: rankRoutingRules(project.graph.nodes).map(({ node, priority }, order) => ({
      ...itemById.get(node.id)!, priority, order,
    })),
    finalRoutes: items.filter(({ node }) => node.data.blockType === 'final'),
    dns: items.filter(({ node }) => node.data.category === 'dns'),
    outputs: items.filter(({ node }) => node.data.category === 'output'),
    compileIssues: compiled.issues,
  }
}

export function updateWorkspaceNodeData(
  nodes: GraphNode[],
  nodeId: string,
  patch: Partial<BlockNodeData>,
): GraphNode[] {
  if (!nodes.some((node) => node.id === nodeId)) return nodes
  return nodes.map((node) => node.id === nodeId
    ? { ...node, data: { ...node.data, ...patch } }
    : node)
}

function summarizeProxies(
  sources: NonNullable<ReturnType<typeof compileGraph>['ir']>['sources'],
  primaryTarget: PrimaryTargetResolution,
): WorkspaceProxySummary[] {
  return sources.flatMap((source) => {
    if (source.kind !== 'manual-proxy' && source.kind !== 'subscription') return []
    return (source.proxies ?? []).map((proxy) => {
      if (isUnmodeledProxy(proxy)) return {
        id: proxy.id,
        name: proxy.name,
        protocol: 'unmodeled' as const,
        region: 'UNKNOWN',
        sourceId: source.id,
        sourceName: source.name,
        compatibility: 'unsupported' as const,
      }
      return {
        id: proxy.id,
        name: proxy.name,
        protocol: proxy.protocol,
        region: proxy.metadata?.region?.code ?? 'UNKNOWN',
        sourceId: source.id,
        sourceName: source.name,
        compatibility: proxyCapabilityStatus(proxy, primaryTarget),
      }
    })
  })
}

function proxyCapabilityStatus(
  proxy: ResolvedProxyEndpointIR,
  primaryTarget: PrimaryTargetResolution,
): CapabilityStatus | 'unknown' {
  if (!primaryTarget.target) return 'unknown'
  const capabilities = getTargetCapabilities(primaryTarget.target)
  const declarations = [capabilities.protocols[proxy.protocol]]
  if ('transport' in proxy && proxy.transport) {
    const transport: TransportCapability = proxy.transport.kind === 'http'
      ? proxy.transport.variant
      : proxy.transport.kind
    declarations.push(capabilities.transports[transport])
  }
  if (declarations.some(({ status }) => status === 'unsupported')) return 'unsupported'
  if (proxy.metadata?.compatibility?.status === 'partial' || declarations.some(({ status }) => status === 'partial')) return 'partial'
  if (declarations.some(({ status }) => status === 'target-native')) return 'target-native'
  return 'supported'
}
