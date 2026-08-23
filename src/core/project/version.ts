import type { GraphEdge, GraphNode, ProxyFlowProject } from '../../types/project'
import { withLegacyChinaCompatibility } from '../../data/legacyServices'
import { isSubscriptionExportMode } from '../subscription'

export const PROJECT_SCHEMA_VERSION = 2 as const

export interface ProjectMigrationResult {
  success: boolean
  project?: ProxyFlowProject
  fromVersion: number
  toVersion: typeof PROJECT_SCHEMA_VERSION
  migrated: boolean
  recoveryRequired?: boolean
  message?: string
}

export function migrateProject(project: ProxyFlowProject): ProjectMigrationResult {
  if (project.version === PROJECT_SCHEMA_VERSION) {
    const normalized = normalizeCurrentDefaults(project)
    return {
      success: true,
      project: normalized.project,
      fromVersion: project.version,
      toVersion: PROJECT_SCHEMA_VERSION,
      migrated: normalized.changed,
    }
  }

  if (project.version === 1) return migrateV1(project)

  return {
    success: false,
    fromVersion: project.version,
    toVersion: PROJECT_SCHEMA_VERSION,
    migrated: false,
    recoveryRequired: true,
    message: `无法读取 Project Schema V${project.version}。原始数据尚未覆盖，请选择恢复方式。`,
  }
}

function migrateV1(project: ProxyFlowProject): ProjectMigrationResult {
  const migrated = structuredClone(project)
  migrated.version = PROJECT_SCHEMA_VERSION
  for (const node of migrated.graph.nodes) {
    if (node.data.blockType === 'dns') node.data.subtitle = '基础 DNS · redir-host'
    if (node.data.blockType === 'output') {
      node.data.subtitle = '真实编译 · MVP'
      node.data.compatibility = 'Compiled'
    }
  }
  const nodesById = new Map(migrated.graph.nodes.map((node) => [node.id, node]))
  const finalNodes = migrated.graph.nodes.filter((node) => node.data.blockType === 'final')
  let repairedLegacyFinal = false

  for (const finalNode of finalNodes) {
    const target = finalNode.data.targetId ? nodesById.get(finalNode.data.targetId) : undefined
    if (target && ['strategy', 'chain'].includes(target.data.category)) {
      finalNode.data.targetKind = 'strategy'
      continue
    }
    const label = String(finalNode.data.targetLabel ?? '').toLowerCase()
    if (label.includes('direct')) {
      finalNode.data.targetKind = 'direct'
      continue
    }
    if (label.includes('reject')) {
      finalNode.data.targetKind = 'reject'
      continue
    }
    if (!target || target.data.category !== 'output') continue

    const replacement = preferredLegacyFinalTarget(migrated.graph.nodes)
    if (!replacement) return {
      success: false,
      fromVersion: 1,
      toVersion: PROJECT_SCHEMA_VERSION,
      migrated: false,
      recoveryRequired: true,
      message: '旧项目的 Final 指向 Output，且没有可恢复的策略。原始数据尚未覆盖。',
    }
    finalNode.data.targetId = replacement.id
    finalNode.data.targetLabel = replacement.data.title
    finalNode.data.targetKind = 'strategy'
    migrated.graph.edges = repairFinalEdges(migrated.graph.edges, finalNode, replacement)
    repairedLegacyFinal = true
  }

  const normalized = normalizeCurrentDefaults(migrated)
  return {
    success: true,
    project: normalized.project,
    fromVersion: 1,
    toVersion: PROJECT_SCHEMA_VERSION,
    migrated: true,
    message: repairedLegacyFinal
      ? '已将旧版 Final → Output 安全迁移到可用策略，并升级为 Project Schema V2。'
      : '项目已升级为 Project Schema V2。',
  }
}

function normalizeCurrentDefaults(project: ProxyFlowProject) {
  const normalized = structuredClone(project)
  let changed = false
  for (const node of normalized.graph.nodes) {
    if (node.data.blockType === 'subscription' && (node.data.subscriptionInputKind ?? 'url') === 'url'
      && !isSubscriptionExportMode(node.data.subscriptionExportMode)) {
      node.data.subscriptionExportMode = 'materialized'
      changed = true
    }
    if (node.data.blockType === 'limit') {
      const raw = node.data.limit as unknown
      if (raw === undefined || raw === null || raw === '') {
        node.data.limit = 10
        changed = true
      } else if (typeof raw === 'string' && /^-?(?:\d+\.?\d*|\.\d+)$/.test(raw.trim())) {
        node.data.limit = Number(raw)
        changed = true
      }
    }
    if (node.data.blockType === 'rename') {
      if (!node.data.renameMode) { node.data.renameMode = 'regex'; changed = true }
      if (node.data.renameIgnoreCase === undefined) { node.data.renameIgnoreCase = false; changed = true }
      if (node.data.renameGlobal === undefined) { node.data.renameGlobal = true; changed = true }
    }
  }
  const compatibleServices = withLegacyChinaCompatibility(normalized.services, normalized.graph.nodes)
  if (compatibleServices !== normalized.services) {
    normalized.services = [...compatibleServices]
    changed = true
  }
  return { project: normalized, changed }
}

function preferredLegacyFinalTarget(nodes: GraphNode[]) {
  return nodes.find((node) => !node.data.disabled && node.data.category === 'chain')
    ?? nodes.find((node) => !node.data.disabled && node.data.category === 'strategy')
}

function repairFinalEdges(edges: GraphEdge[], finalNode: GraphNode, target: GraphNode): GraphEdge[] {
  const retained = edges.filter((edge) => edge.source !== finalNode.id || !['route', 'output'].includes(String(edge.data?.semantic)))
  return [...retained, {
    id: `migration-${finalNode.id}-${target.id}`,
    source: finalNode.id,
    target: target.id,
    type: 'smoothstep',
    data: { semantic: 'route' },
  }]
}
