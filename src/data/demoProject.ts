import { MarkerType } from '@xyflow/react'
import type { BlockNodeData, FlowEdgeData, GraphEdge, GraphNode, OutputDefinition, ProxyFlowProject } from '../types/project'
import { serviceCatalog } from './serviceCatalog'

const node = (id: string, x: number, y: number, data: BlockNodeData): GraphNode => ({
  id,
  type: 'block',
  position: { x, y },
  data,
})

const edge = (id: string, source: string, target: string, semantic: FlowEdgeData['semantic']): GraphEdge => ({
  id,
  source,
  target,
  type: 'smoothstep',
  data: { semantic },
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
})

export const outputDefinitions: OutputDefinition[] = [
  { id: 'mihomo', target: 'mihomo', label: 'Mihomo', status: 'supported' },
  { id: 'sing-box', target: 'sing-box', label: 'sing-box', status: 'prototype' },
  { id: 'surge', target: 'surge', label: 'Surge', status: 'prototype' },
  { id: 'loon', target: 'loon', label: 'Loon', status: 'coming-soon' },
  { id: 'quantumult-x', target: 'quantumult-x', label: 'Quantumult X', status: 'coming-soon' },
  { id: 'shadowrocket', target: 'shadowrocket', label: 'Shadowrocket', status: 'coming-soon' },
  { id: 'stash', target: 'stash', label: 'Stash', status: 'coming-soon' },
]

export const demoNodes: GraphNode[] = [
  node('hkt-subscription', 80, 80, {
    blockType: 'subscription', category: 'source', title: 'HKT 订阅源', subtitle: '24 个可用节点', icon: 'radio',
    subscriptionUrl: 'https://example.com/hkt/••••••', enabled: true, nodeCount: 24, updatedAt: '2 分钟前',
  }),
  node('hk-filter', 380, 80, {
    blockType: 'filter', category: 'processing', title: '香港节点筛选', subtitle: '匹配 8 / 24 个节点', icon: 'list-filter',
    include: ['香港', 'HK'], exclude: ['官网', '剩余', '倍率'],
  }),
  node('hk-auto', 680, 80, {
    blockType: 'auto-select', category: 'strategy', title: '香港自动选择', subtitle: '当前 HK-03 · 42 ms', icon: 'gauge',
    strategyMode: '自动选择最快', testUrl: 'https://www.gstatic.com/generate_204', interval: 300, tolerance: 50,
  }),
  node('us-subscription', 80, 340, {
    blockType: 'subscription', category: 'source', title: 'US 订阅源', subtitle: '18 个可用节点', icon: 'radio',
    subscriptionUrl: 'https://example.com/us/••••••', enabled: true, nodeCount: 18, updatedAt: '5 分钟前',
  }),
  node('us-filter', 380, 340, {
    blockType: 'filter', category: 'processing', title: '美国节点筛选', subtitle: '匹配 6 / 18 个节点', icon: 'list-filter',
    include: ['美国', 'US'], exclude: ['官网', '剩余', '倍率'],
  }),
  node('us-auto', 680, 340, {
    blockType: 'auto-select', category: 'strategy', title: '美国自动选择', subtitle: '当前 LA-02 · 126 ms', icon: 'gauge',
    strategyMode: '自动选择最快', testUrl: 'https://www.gstatic.com/generate_204', interval: 300, tolerance: 80,
  }),
  node('us-via-hk', 1000, 175, {
    blockType: 'proxy-chain', category: 'chain', title: 'US via HK', subtitle: '代理链 · 2 Hops', icon: 'route',
    hopIds: ['hk-auto', 'us-auto'],
  }),
  node('ai-services', 520, 650, {
    blockType: 'routing-group', category: 'routing', title: 'AI 服务', subtitle: '3 个服务 · US via HK', icon: 'sparkles',
    services: ['OpenAI', 'Claude', 'Gemini'], targetId: 'us-via-hk', targetLabel: 'US via HK', ruleSource: 'ios_rule_script',
  }),
  node('streaming', 800, 650, {
    blockType: 'routing-group', category: 'routing', title: '流媒体', subtitle: '3 个服务 · US Auto', icon: 'play',
    services: ['Netflix', 'YouTube', 'Disney+'], targetId: 'us-auto', targetLabel: '美国自动选择', ruleSource: 'ios_rule_script',
  }),
  node('telegram', 1080, 650, {
    blockType: 'service-rule', category: 'routing', title: 'Telegram', subtitle: 'Social · HK Auto', icon: 'send',
    services: ['Telegram'], targetId: 'hk-auto', targetLabel: '香港自动选择', ruleSource: 'ios_rule_script',
  }),
  node('china', 1360, 650, {
    blockType: 'service-rule', category: 'routing', title: '国内网站', subtitle: 'China Mainland · DIRECT', icon: 'landmark',
    services: ['China Mainland'], targetId: 'output', targetLabel: 'DIRECT', ruleSource: 'builtin',
  }),
  node('dns', 1080, 870, {
    blockType: 'dns', category: 'dns', title: 'DNS 配置', subtitle: '智能解析 · Fake IP', icon: 'globe-2', resolver: 'https://1.1.1.1/dns-query',
  }),
  node('final-route', 1360, 870, {
    blockType: 'final', category: 'routing', title: 'Final', subtitle: '其余流量 · Default Proxy', icon: 'corner-down-right',
    targetId: 'output', targetLabel: 'Default Proxy', protected: true,
  }),
  node('output', 1360, 250, {
    blockType: 'output', category: 'output', title: 'Mihomo Output', subtitle: '配置就绪 · Mock', icon: 'package-check',
    client: 'mihomo', compatibility: 'Supported', protected: true,
  }),
]

export const demoEdges: GraphEdge[] = [
  edge('e-hkt-filter', 'hkt-subscription', 'hk-filter', 'data'),
  edge('e-filter-hk', 'hk-filter', 'hk-auto', 'data'),
  edge('e-us-filter', 'us-subscription', 'us-filter', 'data'),
  edge('e-filter-us', 'us-filter', 'us-auto', 'data'),
  edge('e-hk-chain', 'hk-auto', 'us-via-hk', 'strategy'),
  edge('e-us-chain', 'us-auto', 'us-via-hk', 'strategy'),
  edge('e-ai-chain', 'ai-services', 'us-via-hk', 'route'),
  edge('e-stream-us', 'streaming', 'us-auto', 'route'),
  edge('e-telegram-hk', 'telegram', 'hk-auto', 'route'),
  edge('e-china-output', 'china', 'output', 'route'),
  edge('e-chain-output', 'us-via-hk', 'output', 'output'),
  edge('e-hk-output', 'hk-auto', 'output', 'output'),
  edge('e-us-output', 'us-auto', 'output', 'output'),
  edge('e-dns-output', 'dns', 'output', 'dns'),
  edge('e-final-output', 'final-route', 'output', 'output'),
]

export const demoProject: ProxyFlowProject = {
  version: 1,
  id: 'proxyflow-demo',
  name: '我的代理配置',
  graph: { nodes: demoNodes, edges: demoEdges },
  services: serviceCatalog,
  outputs: outputDefinitions,
  updatedAt: new Date().toISOString(),
}

export const mockMihomoPreview = `# ProxyFlow V0.1 Mock Preview
# This is a visual prototype — not a production compiler output.

proxy-providers:
  HKT-Subscription:
    type: http
    url: https://example.com/hkt/••••••
  US-Subscription:
    type: http
    url: https://example.com/us/••••••

proxy-groups:
  - name: HK Auto
    type: url-test
    use: [HKT-Subscription]
  - name: US Auto
    type: url-test
    use: [US-Subscription]
  - name: US via HK
    type: relay
    proxies: [HK Auto, US Auto]

rules:
  - RULE-SET,OpenAI,US via HK
  - RULE-SET,Netflix,US Auto
  - RULE-SET,Telegram,HK Auto
  - GEOIP,CN,DIRECT
  - MATCH,US via HK
`
