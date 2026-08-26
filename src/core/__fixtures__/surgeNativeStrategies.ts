import { MarkerType } from '@xyflow/react'
import type { GraphEdge, GraphNode, ProxyFlowProject } from '../../types/project'
import { PROJECT_SCHEMA_VERSION } from '../project/version'
import { serviceCatalog } from '../../data/serviceCatalog'
import { outputDefinitions } from '../../data/demoProject'

const proxy = (id: string, title: string, x: number): GraphNode => ({
  id, type: 'block', position: { x, y: 80 }, data: {
    blockType: 'manual-proxy', category: 'source', title, subtitle: 'Synthetic test endpoint', icon: 'server',
    proxyProtocol: 'socks5', proxyServer: `${id}.example.test`, proxyPort: 1080,
  },
})

const edge = (id: string, source: string, target: string, semantic: NonNullable<GraphEdge['data']>['semantic']): GraphEdge => ({
  id, source, target, type: 'smoothstep', data: { semantic }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
})

export const surgeNativeAcceptanceProject: ProxyFlowProject = {
  version: PROJECT_SCHEMA_VERSION,
  id: 'surge-native-acceptance',
  name: 'Surge native strategy acceptance',
  primaryTarget: 'surge',
  graph: {
    nodes: [
      proxy('HK-01', 'HK-01', 80), proxy('HK-02', 'HK-02', 80), proxy('HK-03', 'HK-03', 80),
      { id: 'hk-smart', type: 'block', position: { x: 420, y: 80 }, data: {
        blockType: 'target-native-strategy', category: 'strategy', title: 'Hong Kong Smart', subtitle: 'Smart · SURGE', icon: 'sparkles',
        targetNativeStrategy: { target: 'surge', kind: 'smart', members: [
          { kind: 'proxy', id: 'HK-01' }, { kind: 'proxy', id: 'HK-02' }, { kind: 'proxy', id: 'HK-03' },
        ] },
      } },
      { id: 'hk-subnet', type: 'block', position: { x: 720, y: 80 }, data: {
        blockType: 'target-native-strategy', category: 'strategy', title: 'Hong Kong', subtitle: 'Subnet · SURGE', icon: 'network',
        targetNativeStrategy: { target: 'surge', kind: 'subnet', conditions: [
          { matcher: { kind: 'ssid', value: 'Home-WiFi' }, policy: { kind: 'builtin', id: 'DIRECT' } },
          { matcher: { kind: 'network-type', value: 'CELLULAR' }, policy: { kind: 'strategy', id: 'hk-smart' } },
        ], defaultPolicy: { kind: 'strategy', id: 'hk-smart' } },
      } },
      { id: 'final-route', type: 'block', position: { x: 1020, y: 80 }, data: {
        blockType: 'final', category: 'routing', title: 'Final', subtitle: 'Subnet', icon: 'corner-down-right',
        targetKind: 'strategy', targetId: 'hk-subnet', targetLabel: 'Hong Kong', protected: true,
      } },
      { id: 'output', type: 'block', position: { x: 1260, y: 80 }, data: {
        blockType: 'output', category: 'output', title: 'Surge Output', subtitle: 'Synthetic output', icon: 'package-check', client: 'surge', compatibility: 'Supported', protected: true,
      } },
    ],
    edges: [edge('subnet-output', 'hk-subnet', 'output', 'output')],
  },
  services: serviceCatalog,
  outputs: outputDefinitions,
  updatedAt: new Date(0).toISOString(),
}
