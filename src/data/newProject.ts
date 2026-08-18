import { PROJECT_SCHEMA_VERSION } from '../core/project/version'
import type { GraphNode, ProxyFlowProject } from '../types/project'
import { outputDefinitions } from './demoProject'
import { serviceCatalog } from './serviceCatalog'
import { createMihomoOutputProfile } from '../targets/mihomo/profile'
import type { PrimaryTarget } from '../core/capabilities'

const finalNode: GraphNode = {
  id: 'final-route',
  type: 'block',
  position: { x: 720, y: 420 },
  data: {
    blockType: 'final', category: 'routing', title: 'Final', titleKey: 'block.final.title', subtitle: '其余流量 · DIRECT', subtitleKey: 'demo.blank.finalSubtitle', icon: 'corner-down-right',
    targetId: 'DIRECT', targetLabel: 'DIRECT', targetKind: 'direct', protected: true,
  },
}

const outputNode = (primaryTarget: PrimaryTarget): GraphNode => ({
  id: 'output',
  type: 'block',
  position: { x: 1080, y: 260 },
  data: {
    blockType: 'output', category: 'output', title: `${primaryTarget === 'mihomo' ? 'Mihomo' : 'sing-box'} Output`, subtitle: '等待编译', subtitleKey: 'demo.blank.outputSubtitle', icon: 'package-check',
    client: primaryTarget, compatibility: 'Supported', protected: true,
    ...(primaryTarget === 'mihomo' ? { mihomoProfile: createMihomoOutputProfile() } : {}),
  },
})

function createProjectId() {
  const suffix = typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `proxyflow-${suffix}`
}

export function createBlankProject(primaryTarget: PrimaryTarget = 'mihomo'): ProxyFlowProject {
  return {
    version: PROJECT_SCHEMA_VERSION,
    id: createProjectId(),
    name: '未命名项目',
    primaryTarget,
    graph: { nodes: [structuredClone(finalNode), outputNode(primaryTarget)], edges: [] },
    services: serviceCatalog,
    outputs: outputDefinitions,
    updatedAt: new Date().toISOString(),
  }
}
