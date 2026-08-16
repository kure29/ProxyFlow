import { PROJECT_SCHEMA_VERSION } from '../core/project/version'
import type { GraphNode, ProxyFlowProject } from '../types/project'
import { outputDefinitions } from './demoProject'
import { serviceCatalog } from './serviceCatalog'

const finalNode: GraphNode = {
  id: 'final-route',
  type: 'block',
  position: { x: 720, y: 420 },
  data: {
    blockType: 'final', category: 'routing', title: 'Final', titleKey: 'block.final.title', subtitle: '其余流量 · DIRECT', subtitleKey: 'demo.blank.finalSubtitle', icon: 'corner-down-right',
    targetId: 'DIRECT', targetLabel: 'DIRECT', targetKind: 'direct', protected: true,
  },
}

const outputNode: GraphNode = {
  id: 'output',
  type: 'block',
  position: { x: 1080, y: 260 },
  data: {
    blockType: 'output', category: 'output', title: 'Mihomo Output', subtitle: '等待编译', subtitleKey: 'demo.blank.outputSubtitle', icon: 'package-check',
    client: 'mihomo', compatibility: 'Supported', protected: true,
  },
}

export function createBlankProject(): ProxyFlowProject {
  return {
    version: PROJECT_SCHEMA_VERSION,
    id: 'proxyflow-new',
    name: '未命名项目',
    graph: { nodes: [structuredClone(finalNode), structuredClone(outputNode)], edges: [] },
    services: serviceCatalog,
    outputs: outputDefinitions,
    updatedAt: new Date().toISOString(),
  }
}
