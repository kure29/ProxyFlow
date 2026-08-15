import type { BlockCategory, BlockNodeData, BlockType, EdgeSemantic, GraphEdge, GraphNode, ProxyFlowProject } from '../../types/project'
import { outputDefinitions } from '../../data/demoProject'
import { serviceCatalog } from '../../data/serviceCatalog'

const node = (
  id: string,
  blockType: BlockType,
  category: BlockCategory,
  data: Partial<BlockNodeData> = {},
): GraphNode => ({
  id,
  type: 'block',
  position: { x: 0, y: 0 },
  data: {
    blockType,
    category,
    title: data.title ?? id,
    subtitle: data.subtitle ?? '',
    icon: data.icon ?? 'blocks',
    ...data,
  },
})

const edge = (id: string, source: string, target: string, semantic: EdgeSemantic): GraphEdge => ({
  id,
  source,
  target,
  type: 'smoothstep',
  data: { semantic },
})

const project = (id: string, nodes: GraphNode[], edges: GraphEdge[]): ProxyFlowProject => ({
  version: 1,
  id,
  name: id,
  graph: { nodes, edges },
  services: serviceCatalog,
  outputs: outputDefinitions,
  updatedAt: '2026-08-15T00:00:00.000Z',
})

const subscription = (id: string) => node(id, 'subscription', 'source', { subscriptionUrl: `https://example.com/${id}`, enabled: true })
const output = () => node('output', 'output', 'output', { client: 'mihomo' })
const final = (targetId: string) => node('final', 'final', 'routing', { targetId, targetLabel: targetId })
const validTail = (targetId: string) => ({
  nodes: [final(targetId), output()],
  edges: [edge(`e-final-${targetId}`, 'final', targetId, 'route'), edge(`e-${targetId}-output`, targetId, 'output', 'output')],
})

export const subscriptionFilterAutoFixture = (() => {
  const tail = validTail('auto')
  return project('subscription-filter-auto', [
    subscription('subscription'),
    node('filter', 'filter', 'processing', { include: ['HK'], exclude: ['倍率'] }),
    node('auto', 'auto-select', 'strategy', { testUrl: 'https://example.com/ping', interval: 300, tolerance: 50 }),
    ...tail.nodes,
  ], [
    edge('e-sub-filter', 'subscription', 'filter', 'data'),
    edge('e-filter-auto', 'filter', 'auto', 'data'),
    ...tail.edges,
  ])
})()

export const processingChainFixture = (() => {
  const tail = validTail('auto')
  return project('processing-chain', [
    subscription('subscription'),
    node('filter', 'filter', 'processing', { include: ['HK'] }),
    node('rename', 'rename', 'processing', { renamePattern: 'Hong Kong', renameReplacement: 'HK' }),
    node('sort', 'sort', 'processing', { sortBy: 'latency', sortDirection: 'ascending' }),
    node('auto', 'auto-select', 'strategy'),
    ...tail.nodes,
  ], [
    edge('e-sub-filter', 'subscription', 'filter', 'data'),
    edge('e-filter-rename', 'filter', 'rename', 'data'),
    edge('e-rename-sort', 'rename', 'sort', 'data'),
    edge('e-sort-auto', 'sort', 'auto', 'data'),
    ...tail.edges,
  ])
})()

export const twoSourcesMergeFixture = (() => {
  const tail = validTail('auto')
  return project('two-sources-merge', [
    subscription('source-a'),
    subscription('source-b'),
    node('merge', 'merge', 'processing'),
    node('auto', 'auto-select', 'strategy'),
    ...tail.nodes,
  ], [
    edge('e-a-merge', 'source-a', 'merge', 'data'),
    edge('e-b-merge', 'source-b', 'merge', 'data'),
    edge('e-merge-auto', 'merge', 'auto', 'data'),
    ...tail.edges,
  ])
})()

export const sourceVariantsFixture = (() => {
  const tail = validTail('auto')
  return project('source-variants', [
    node('manual', 'manual-proxy', 'source'),
    node('provider', 'provider', 'source', { subscriptionUrl: 'provider://example', enabled: true }),
    node('imported', 'import-config', 'source'),
    node('merge', 'merge', 'processing'),
    node('auto', 'auto-select', 'strategy'),
    ...tail.nodes,
  ], [
    edge('e-manual-merge', 'manual', 'merge', 'data'),
    edge('e-provider-merge', 'provider', 'merge', 'data'),
    edge('e-imported-merge', 'imported', 'merge', 'data'),
    edge('e-merge-auto', 'merge', 'auto', 'data'),
    ...tail.edges,
  ])
})()

export const openAiRouteFixture = (() => {
  const tail = validTail('us-auto')
  return project('openai-to-us-auto', [
    subscription('subscription'),
    node('us-auto', 'auto-select', 'strategy'),
    node('openai-route', 'service-rule', 'routing', { services: ['OpenAI'], targetId: 'us-auto', targetLabel: 'US Auto' }),
    ...tail.nodes,
  ], [
    edge('e-sub-auto', 'subscription', 'us-auto', 'data'),
    edge('e-openai-auto', 'openai-route', 'us-auto', 'route'),
    ...tail.edges,
  ])
})()

export const chinaDirectFixture = (() => {
  const tail = validTail('auto')
  return project('china-direct', [
    subscription('subscription'),
    node('auto', 'auto-select', 'strategy'),
    node('china-route', 'service-rule', 'routing', { services: ['China Mainland'], targetId: 'output', targetLabel: 'DIRECT' }),
    ...tail.nodes,
  ], [
    edge('e-sub-auto', 'subscription', 'auto', 'data'),
    edge('e-china-output', 'china-route', 'output', 'route'),
    ...tail.edges,
  ])
})()

export const hkUsChainFixture = chainFixture('hk-us-chain', ['hk-auto', 'us-auto'])
export const hkJpUsChainFixture = chainFixture('hk-jp-us-chain', ['hk-auto', 'jp-auto', 'us-auto'])

function chainFixture(id: string, hopIds: string[]) {
  const sourceNodes = hopIds.map((hopId) => subscription(`${hopId}-source`))
  const strategyNodes = hopIds.map((hopId) => node(hopId, 'auto-select', 'strategy'))
  const tail = validTail('chain')
  return project(id, [
    ...sourceNodes,
    ...strategyNodes,
    node('chain', 'proxy-chain', 'chain', { hopIds }),
    node('route', 'routing-group', 'routing', { services: ['OpenAI'], targetId: 'chain', targetLabel: 'Chain' }),
    ...tail.nodes,
  ], [
    ...hopIds.map((hopId) => edge(`e-${hopId}-input`, `${hopId}-source`, hopId, 'data')),
    ...hopIds.map((hopId) => edge(`e-${hopId}-chain`, hopId, 'chain', 'strategy')),
    edge('e-route-chain', 'route', 'chain', 'route'),
    ...tail.edges,
  ])
}

export const manualSelectFixture = strategyFixture(
  'manual-select',
  node('strategy', 'manual-select', 'strategy'),
  [subscription('source')],
  [edge('e-source-strategy', 'source', 'strategy', 'data')],
)

export const fallbackFixture = strategyFixture(
  'fallback',
  node('strategy', 'fallback', 'strategy'),
  [subscription('source-a'), subscription('source-b')],
  [edge('e-a-strategy', 'source-a', 'strategy', 'data'), edge('e-b-strategy', 'source-b', 'strategy', 'data')],
)

export const loadBalanceFixture = strategyFixture(
  'load-balance',
  node('strategy', 'load-balance', 'strategy', { loadBalanceMode: 'consistent-hash' }),
  [subscription('source')],
  [edge('e-source-strategy', 'source', 'strategy', 'data')],
)

export const fixedStrategyFixture = (() => {
  const tail = validTail('fixed')
  return project('fixed-strategy', [node('fixed', 'fixed-proxy', 'strategy', { proxyId: 'proxy-placeholder-1' }), ...tail.nodes], tail.edges)
})()

function strategyFixture(id: string, strategy: GraphNode, sources: GraphNode[], inputEdges: GraphEdge[]) {
  const tail = validTail('strategy')
  return project(id, [...sources, strategy, ...tail.nodes], [...inputEdges, ...tail.edges])
}

export const invalidMissingTransformInputFixture = (() => {
  const tail = validTail('auto')
  return project('invalid-missing-transform-input', [
    subscription('source'),
    node('orphan-filter', 'filter', 'processing', { include: ['HK'] }),
    node('auto', 'auto-select', 'strategy'),
    ...tail.nodes,
  ], [edge('e-source-auto', 'source', 'auto', 'data'), ...tail.edges])
})()

export const invalidMissingRouteTargetFixture = (() => {
  const tail = validTail('auto')
  return project('invalid-missing-route-target', [
    subscription('source'),
    node('auto', 'auto-select', 'strategy'),
    node('route', 'service-rule', 'routing', { services: ['OpenAI'] }),
    ...tail.nodes,
  ], [edge('e-source-auto', 'source', 'auto', 'data'), ...tail.edges])
})()

export const invalidAutoMissingSourceFixture = (() => {
  const tail = validTail('auto')
  return project('invalid-auto-missing-source', [node('auto', 'auto-select', 'strategy'), ...tail.nodes], tail.edges)
})()

export const invalidEmptyChainFixture = (() => {
  const tail = validTail('chain')
  return project('invalid-empty-chain', [node('chain', 'proxy-chain', 'chain', { hopIds: [] }), ...tail.nodes], tail.edges)
})()

export const invalidChainSelfFixture = (() => {
  const tail = validTail('chain')
  return project('invalid-chain-self', [node('chain', 'proxy-chain', 'chain', { hopIds: ['chain'] }), ...tail.nodes], tail.edges)
})()

export const invalidChainCycleFixture = (() => {
  const tail = validTail('chain-a')
  return project('invalid-chain-cycle', [
    node('chain-a', 'proxy-chain', 'chain', { hopIds: ['chain-b'] }),
    node('chain-b', 'proxy-chain', 'chain', { hopIds: ['chain-a'] }),
    ...tail.nodes,
  ], tail.edges)
})()

export const invalidChainMissingReferenceFixture = (() => {
  const tail = validTail('chain')
  return project('invalid-chain-missing-reference', [node('chain', 'proxy-chain', 'chain', { hopIds: ['missing-strategy'] }), ...tail.nodes], tail.edges)
})()

export const invalidMissingFinalFixture = project('invalid-missing-final', [
  subscription('source'),
  node('auto', 'auto-select', 'strategy'),
  output(),
], [edge('e-source-auto', 'source', 'auto', 'data'), edge('e-auto-output', 'auto', 'output', 'output')])
