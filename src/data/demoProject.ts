import { MarkerType } from '@xyflow/react'
import type { BlockNodeData, FlowEdgeData, GraphEdge, GraphNode, OutputDefinition, ProxyFlowProject } from '../types/project'
import { PROJECT_SCHEMA_VERSION } from '../core/project/version'
import { serviceCatalog } from './serviceCatalog'
import { hktDemoSubscription, usDemoSubscription } from './demoSubscriptions'
import { miniIcon } from './miniIcons'
import { createMihomoOutputProfile } from '../targets/mihomo/profile'

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
  { id: 'mihomo', target: 'mihomo', label: 'Mihomo', status: 'supported', icon: '/third-party/mihomo-party/icon.png', iconDark: '/third-party/mihomo-party/icon.png' },
  { id: 'sing-box', target: 'sing-box', label: 'sing-box', status: 'supported', icon: '/third-party/sing-box/icon.svg', iconDark: '/third-party/sing-box/icon.svg' },
  { id: 'surge', target: 'surge', label: 'Surge', status: 'prototype', ...miniIcon('surge') },
  { id: 'loon', target: 'loon', label: 'Loon', status: 'coming-soon', ...miniIcon('loon') },
  { id: 'quantumult-x', target: 'quantumult-x', label: 'Quantumult X', status: 'coming-soon', ...miniIcon('quantumultx', 'quanX') },
  { id: 'shadowrocket', target: 'shadowrocket', label: 'Shadowrocket', status: 'coming-soon', ...miniIcon('shadowrocket') },
  { id: 'stash', target: 'stash', label: 'Stash', status: 'coming-soon', ...miniIcon('stash') },
]

export const demoNodes: GraphNode[] = [
  node('hkt-subscription', 80, 80, {
    blockType: 'subscription', category: 'source', title: 'HKT 订阅源', titleKey: 'demo.subscription.hkt', subtitle: '真实 Demo · 等待解析', subtitleKey: 'demo.subscription.subtitle', icon: 'radio',
    subscriptionInputKind: 'paste', subscriptionContent: hktDemoSubscription, enabled: true, nodeCount: 0, updatedAt: '启动时解析',
  }),
  node('hk-filter', 380, 80, {
    blockType: 'filter', category: 'processing', title: '香港节点筛选', titleKey: 'demo.filter.hk', subtitle: 'Region = HK', subtitleKey: 'demo.filter.hkSubtitle', icon: 'list-filter',
    include: [], exclude: [], filterMode: 'region', filterOperation: 'include', filterRegions: ['HK'], includeRegions: ['HK'],
  }),
  node('hk-auto', 680, 80, {
    blockType: 'auto-select', category: 'strategy', title: '香港自动选择', titleKey: 'demo.auto.hk', subtitle: '真实候选节点', subtitleKey: 'demo.auto.subtitle', icon: 'gauge',
    strategyMode: '自动选择最快', testUrl: 'https://www.gstatic.com/generate_204', interval: 300, tolerance: 50,
  }),
  node('us-subscription', 80, 340, {
    blockType: 'subscription', category: 'source', title: 'US 订阅源', titleKey: 'demo.subscription.us', subtitle: '真实 Demo · 等待解析', subtitleKey: 'demo.subscription.subtitle', icon: 'radio',
    subscriptionInputKind: 'paste', subscriptionContent: usDemoSubscription, enabled: true, nodeCount: 0, updatedAt: '启动时解析',
  }),
  node('us-filter', 380, 340, {
    blockType: 'filter', category: 'processing', title: '美国节点筛选', titleKey: 'demo.filter.us', subtitle: 'Region = US', subtitleKey: 'demo.filter.usSubtitle', icon: 'list-filter',
    include: [], exclude: [], filterMode: 'region', filterOperation: 'include', filterRegions: ['US'], includeRegions: ['US'],
  }),
  node('us-auto', 680, 340, {
    blockType: 'auto-select', category: 'strategy', title: '美国自动选择', titleKey: 'demo.auto.us', subtitle: '真实候选节点', subtitleKey: 'demo.auto.subtitle', icon: 'gauge',
    strategyMode: '自动选择最快', testUrl: 'https://www.gstatic.com/generate_204', interval: 300, tolerance: 80,
  }),
  node('us-via-hk', 1000, 175, {
    blockType: 'proxy-chain', category: 'chain', title: 'US via HK', titleKey: 'demo.chain.title', subtitle: '代理链 · 2 Hops', subtitleKey: 'demo.chain.subtitle', icon: 'route',
    hopIds: ['hk-auto', 'us-auto'],
  }),
  node('ai-services', 520, 650, {
    blockType: 'routing-group', category: 'routing', title: 'AI 服务', titleKey: 'demo.ai.title', subtitle: '3 个服务 · US via HK', subtitleKey: 'demo.ai.subtitle', icon: 'sparkles',
    services: ['OpenAI', 'Claude', 'Gemini'], targetId: 'us-via-hk', targetLabel: 'US via HK', targetKind: 'strategy', ruleSource: 'ios_rule_script',
  }),
  node('streaming', 800, 650, {
    blockType: 'routing-group', category: 'routing', title: '流媒体', titleKey: 'demo.streaming.title', subtitle: '3 个服务 · US Auto', subtitleKey: 'demo.streaming.subtitle', icon: 'play',
    services: ['Netflix', 'YouTube', 'Disney+'], targetId: 'us-auto', targetLabel: '美国自动选择', targetKind: 'strategy', ruleSource: 'ios_rule_script',
  }),
  node('telegram', 1080, 650, {
    blockType: 'service-rule', category: 'routing', title: 'Telegram', subtitle: 'Social · HK Auto', subtitleKey: 'demo.telegram.subtitle', icon: 'send',
    services: ['Telegram'], targetId: 'hk-auto', targetLabel: '香港自动选择', targetKind: 'strategy', ruleSource: 'ios_rule_script',
  }),
  node('china', 1360, 650, {
    blockType: 'service-rule', category: 'routing', title: '国内网站', titleKey: 'demo.china.title', subtitle: 'China Mainland · DIRECT', subtitleKey: 'demo.china.subtitle', icon: 'landmark',
    services: ['China Mainland'], targetId: 'output', targetLabel: 'DIRECT', targetKind: 'direct', ruleSource: 'builtin',
  }),
  node('dns', 1080, 870, {
    blockType: 'dns', category: 'dns', title: 'DNS 配置', titleKey: 'block.dns.title', subtitle: '基础 DNS · redir-host', subtitleKey: 'demo.dns.subtitle', icon: 'globe-2', resolver: 'https://1.1.1.1/dns-query',
  }),
  node('final-route', 1360, 870, {
    blockType: 'final', category: 'routing', title: 'Final', titleKey: 'block.final.title', subtitle: '其余流量 · Default Proxy', subtitleKey: 'demo.final.subtitle', icon: 'corner-down-right',
    targetId: 'us-via-hk', targetLabel: 'US via HK', targetKind: 'strategy', protected: true,
  }),
  node('output', 1360, 250, {
    blockType: 'output', category: 'output', title: 'Mihomo Output', subtitle: '真实编译 · MVP', subtitleKey: 'demo.output.subtitle', icon: 'package-check',
    client: 'mihomo', compatibility: 'Supported', protected: true, mihomoProfile: createMihomoOutputProfile(),
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
  edge('e-final-chain', 'final-route', 'us-via-hk', 'route'),
]

export const demoProject: ProxyFlowProject = {
  version: PROJECT_SCHEMA_VERSION,
  id: 'proxyflow-demo',
  name: '我的代理配置',
  graph: { nodes: demoNodes, edges: demoEdges },
  services: serviceCatalog,
  outputs: outputDefinitions,
  updatedAt: new Date().toISOString(),
}
