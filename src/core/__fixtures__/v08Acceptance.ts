import { outputDefinitions } from '../../data/demoProject'
import { serviceCatalog } from '../../data/serviceCatalog'
import type { BlockCategory, BlockNodeData, BlockType, EdgeSemantic, GraphEdge, GraphNode, ProxyFlowProject, ServiceDefinition } from '../../types/project'

const node = (id: string, blockType: BlockType, category: BlockCategory, data: Partial<BlockNodeData> = {}): GraphNode => ({
  id,
  type: 'block',
  position: { x: 0, y: 0 },
  data: { blockType, category, title: data.title ?? id, subtitle: data.subtitle ?? '', icon: data.icon ?? 'blocks', ...data },
})

const edge = (id: string, source: string, target: string, semantic: EdgeSemantic): GraphEdge => ({
  id, source, target, type: 'smoothstep', data: { semantic },
})

const acceptanceServices: ServiceDefinition[] = [
  {
    id: 'openai', name: 'OpenAI', category: 'ai', ruleSources: [],
    inlineMatchers: [{ kind: 'domain', value: 'api.openai.com' }],
  },
]

const project = (id: string, nodes: GraphNode[], edges: GraphEdge[]): ProxyFlowProject => ({
  version: 2,
  id,
  name: 'V0.8 Acceptance',
  graph: { nodes, edges },
  services: [...acceptanceServices, ...serviceCatalog.filter((service) => service.id !== 'openai')],
  outputs: outputDefinitions,
  updatedAt: '2026-08-17T00:00:00.000Z',
})

const manualProxy = (id: string, title: string, server: string, port: number) => node(id, 'manual-proxy', 'source', {
  title,
  proxyProtocol: 'socks5',
  proxyServer: server,
  proxyPort: port,
})

const output = node('output', 'output', 'output', { title: 'Mihomo and sing-box', client: 'mihomo' })
const finalRoute = node('final', 'final', 'routing', {
  title: 'Default Route', targetId: 'auto', targetLabel: 'Auto', targetKind: 'strategy', protected: true,
})
const failoverFinal = node('final', 'final', 'routing', {
  title: 'Default Route', targetId: 'fallback', targetLabel: 'Failover', targetKind: 'strategy', protected: true,
})

export const v08BasicRoutingFixture = project('v08-basic-routing', [
  manualProxy('hk-source', 'Hong Kong source', 'hk.example.com', 1080),
  manualProxy('us-source', 'US source', 'us.example.com', 1080),
  node('auto', 'auto-select', 'strategy', { title: 'US Auto', testUrl: 'https://example.com/ping', interval: 180, tolerance: 60 }),
  node('manual', 'manual-select', 'strategy', { title: 'US Manual' }),
  node('openai', 'service-rule', 'routing', { title: 'OpenAI route', services: ['OpenAI'], targetId: 'auto', targetLabel: 'US Auto', targetKind: 'strategy', routePriority: 10 }),
  node('local', 'custom-rule', 'routing', { title: 'Local domains', routeMatcherKind: 'domain-suffix', routeMatcherValue: 'lan', targetId: 'output', targetLabel: 'DIRECT', targetKind: 'direct', routePriority: 20 }),
  node('ads', 'custom-rule', 'routing', { title: 'Ad blocking', routeMatcherKind: 'domain-keyword', routeMatcherValue: 'ads', targetId: 'output', targetLabel: 'REJECT', targetKind: 'reject', routePriority: 30 }),
  finalRoute,
  output,
], [
  edge('e-hk-auto', 'hk-source', 'auto', 'data'),
  edge('e-us-auto', 'us-source', 'auto', 'data'),
  edge('e-hk-manual', 'hk-source', 'manual', 'data'),
  edge('e-us-manual', 'us-source', 'manual', 'data'),
  edge('e-openai-auto', 'openai', 'auto', 'route'),
  edge('e-local-output', 'local', 'output', 'route'),
  edge('e-ads-output', 'ads', 'output', 'route'),
  edge('e-final-auto', 'final', 'auto', 'route'),
  edge('e-auto-output', 'auto', 'output', 'output'),
])

export const v08FailoverFixture = project('v08-failover', [
  manualProxy('source', 'Fixture source', 'fixture.example.com', 1080),
  node('fallback', 'fallback', 'strategy', { title: 'Failover', testUrl: 'https://example.com/ping', interval: 120 }),
  failoverFinal,
  output,
], [
  edge('e-source-fallback', 'source', 'fallback', 'data'),
  edge('e-final-fallback', 'final', 'fallback', 'route'),
  edge('e-fallback-output', 'fallback', 'output', 'output'),
])
