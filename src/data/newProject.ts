import { MarkerType } from '@xyflow/react'
import { PROJECT_SCHEMA_VERSION } from '../core/project/version'
import type { GraphEdge, GraphNode, ProxyFlowProject } from '../types/project'
import { outputDefinitions } from './demoProject'
import { serviceCatalog } from './serviceCatalog'
import { createMihomoStarterDnsResolvers, createMihomoStarterProfile } from '../targets/mihomo/profile'
import type { PrimaryTarget } from '../core/capabilities'

const targetLabels: Record<PrimaryTarget, string> = {
  mihomo: 'Mihomo',
  surge: 'Surge',
  'sing-box': 'sing-box',
}

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
    blockType: 'output', category: 'output', title: `${targetLabels[primaryTarget]} Output`, subtitle: '等待编译', subtitleKey: 'demo.blank.outputSubtitle', icon: 'package-check',
    client: primaryTarget, compatibility: 'Supported', protected: true,
    ...(primaryTarget === 'mihomo' ? { mihomoProfile: createMihomoStarterProfile() } : {}),
  },
})

const dnsNode: GraphNode = {
  id: 'dns',
  type: 'block',
  position: { x: 720, y: 620 },
  data: {
    blockType: 'dns', category: 'dns', title: 'DNS 配置', titleKey: 'block.dns.title', subtitle: 'Fake-IP · AliDNS / DNSPod', icon: 'globe-2',
    dnsResolvers: createMihomoStarterDnsResolvers(),
  },
}

const dnsEdge: GraphEdge = {
  id: 'e-dns-output',
  source: 'dns',
  target: 'output',
  type: 'smoothstep',
  data: { semantic: 'dns' },
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
}

function createProjectId() {
  const suffix = typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `proxyflow-${suffix}`
}

export function createBlankProject(primaryTarget: PrimaryTarget = 'mihomo'): ProxyFlowProject {
  const mihomoNodes = primaryTarget === 'mihomo' ? [structuredClone(dnsNode)] : []
  const mihomoEdges = primaryTarget === 'mihomo' ? [structuredClone(dnsEdge)] : []
  return {
    version: PROJECT_SCHEMA_VERSION,
    id: createProjectId(),
    name: '未命名项目',
    primaryTarget,
    graph: {
      nodes: [structuredClone(finalNode), ...mihomoNodes, outputNode(primaryTarget)],
      edges: mihomoEdges,
    },
    services: serviceCatalog,
    outputs: outputDefinitions,
    updatedAt: new Date().toISOString(),
  }
}
