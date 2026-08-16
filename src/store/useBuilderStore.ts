import { applyEdgeChanges, applyNodeChanges, MarkerType, type Connection, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import { create } from 'zustand'
import { blockByType } from '../data/blockLibrary'
import { demoProject } from '../data/demoProject'
import { createBlankProject } from '../data/newProject'
import { isConnectionAllowed, semanticForConnection } from '../core/graph/graphRules'
import { migrateProject, PROJECT_SCHEMA_VERSION } from '../core/project/version'
import type { BlockNodeData, BlockType, GraphEdge, GraphNode, ProxyFlowProject, TargetClient } from '../types/project'
import type { SubscriptionInputKind, SubscriptionSnapshot } from '../core/subscription'

interface GraphSnapshot {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface BuilderState {
  projectId: string
  projectName: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  activeService: string | null
  historyPast: GraphSnapshot[]
  historyFuture: GraphSnapshot[]
  transactionStart: GraphSnapshot | null
  previewOpen: boolean
  saveStatus: 'saved' | 'saving'
  hydrated: boolean
  recoveryRequired: boolean
  recoveryNotice: string | null
  toast: string | null
  subscriptionSnapshots: Record<string, SubscriptionSnapshot>
  onNodesChange: (changes: NodeChange<GraphNode>[]) => void
  onEdgesChange: (changes: EdgeChange<GraphEdge>[]) => void
  connect: (connection: Connection) => boolean
  addNode: (type: BlockType, position: XYPosition) => string | null
  duplicateNode: (id: string) => void
  removeNode: (id: string) => void
  deleteSelected: () => void
  selectNode: (id: string | null, service?: string | null) => void
  selectEdge: (id: string | null) => void
  updateNodeData: (id: string, patch: Partial<BlockNodeData>) => void
  setRoutingTarget: (nodeId: string, targetId: string) => void
  addHop: (chainId: string) => void
  removeHop: (chainId: string, hopId: string) => void
  moveHop: (chainId: string, from: number, to: number) => void
  setOutputClient: (id: string, client: TargetClient) => void
  beginTransaction: () => void
  commitTransaction: () => void
  undo: () => void
  redo: () => void
  autoLayout: () => void
  setPreviewOpen: (open: boolean) => void
  setSaveStatus: (status: 'saved' | 'saving') => void
  setToast: (message: string | null) => void
  hydrate: (project: ProxyFlowProject | null | undefined) => void
  resetToDemo: () => void
  createNewProject: () => void
  dismissRecoveryNotice: () => void
  parseSubscriptionInput: (id: string, content: string, inputKind: Extract<SubscriptionInputKind, 'paste' | 'file'>, fileName?: string) => Promise<void>
  refreshSubscription: (id: string) => Promise<void>
  toProject: () => ProxyFlowProject
}

const cloneSnapshot = (nodes: GraphNode[], edges: GraphEdge[]): GraphSnapshot => ({
  nodes: structuredClone(nodes),
  edges: structuredClone(edges),
})

const makeId = (prefix: string) => `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now()}`

const defaultDataFor = (type: BlockType): Partial<BlockNodeData> => {
  if (type === 'subscription') return { subscriptionUrl: '', subscriptionInputKind: 'url', enabled: true, nodeCount: 0, updatedAt: '尚未解析' }
  if (type === 'manual-proxy') return { proxyProtocol: 'socks5', proxyServer: '', proxyPort: 1080, proxyTransport: 'tcp' }
  if (type === 'filter') return { include: [], exclude: [] }
  if (type === 'auto-select') return { strategyMode: '自动选择最快', testUrl: 'https://www.gstatic.com/generate_204', interval: 300, tolerance: 50 }
  if (type === 'proxy-chain') return { hopIds: [] }
  if (['routing-group', 'service-rule', 'custom-rule'].includes(type)) return { services: [], ruleSource: type === 'custom-rule' ? 'custom' : 'ios_rule_script' }
  if (type === 'output') return { client: 'mihomo', compatibility: 'Supported' }
  if (type === 'dns') return { resolver: 'https://1.1.1.1/dns-query' }
  return {}
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

async function rehydrateEmbeddedSubscriptions(
  nodes: GraphNode[],
  parseInput: BuilderState['parseSubscriptionInput'],
) {
  for (const node of nodes) {
    if (node.data.blockType === 'subscription' && node.data.subscriptionInputKind === 'paste' && node.data.subscriptionContent) {
      await parseInput(node.id, node.data.subscriptionContent, 'paste')
    }
  }
}

export const useBuilderStore = create<BuilderState>((set, get) => {
  const record = () => set((state) => ({
    historyPast: [...state.historyPast.slice(-49), cloneSnapshot(state.nodes, state.edges)],
    historyFuture: [],
  }))

  return {
    projectId: demoProject.id,
    projectName: demoProject.name,
    nodes: structuredClone(demoProject.graph.nodes),
    edges: structuredClone(demoProject.graph.edges),
    selectedNodeId: null,
    selectedEdgeId: null,
    activeService: null,
    historyPast: [],
    historyFuture: [],
    transactionStart: null,
    previewOpen: false,
    saveStatus: 'saved',
    hydrated: false,
    recoveryRequired: false,
    recoveryNotice: null,
    toast: null,
    subscriptionSnapshots: {},

    onNodesChange: (changes) => {
      const hasRemoval = changes.some((change) => change.type === 'remove')
      if (hasRemoval) record()
      const protectedIds = new Set(get().nodes.filter((node) => node.data.protected).map((node) => node.id))
      const safeChanges = changes.filter((change) => change.type !== 'remove' || !protectedIds.has(change.id))
      set((state) => ({ nodes: applyNodeChanges(safeChanges, state.nodes) }))
    },
    onEdgesChange: (changes) => {
      if (changes.some((change) => change.type === 'remove')) record()
      set((state) => ({ edges: applyEdgeChanges(changes, state.edges) }))
    },
    connect: (connection) => {
      const state = get()
      if (!isConnectionAllowed(connection, state.nodes)) {
        set({ toast: '这两个模块的流量类型不能直接连接' })
        return false
      }
      record()
      const semantic = semanticForConnection(connection, state.nodes)
      const edge: GraphEdge = {
        id: makeId('edge'), source: connection.source!, target: connection.target!,
        sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle,
        type: 'smoothstep', data: { semantic }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      }
      set((current) => ({ edges: [...current.edges, edge], selectedEdgeId: edge.id }))
      return true
    },
    addNode: (type, position) => {
      const item = blockByType.get(type)
      if (!item) return null
      record()
      const id = makeId(type)
      const data: BlockNodeData = {
        blockType: type, category: item.category, title: item.title, subtitle: item.description, icon: item.icon,
        ...defaultDataFor(type),
      }
      const node: GraphNode = { id, type: 'block', position, data, selected: true }
      set((state) => ({
        nodes: [...state.nodes.map((existing) => ({ ...existing, selected: false })), node],
        selectedNodeId: id,
        selectedEdgeId: null,
      }))
      return id
    },
    duplicateNode: (id) => {
      const source = get().nodes.find((node) => node.id === id)
      if (!source) return
      record()
      const duplicateId = makeId(source.data.blockType)
      const duplicate: GraphNode = {
        ...structuredClone(source), id: duplicateId,
        position: { x: source.position.x + 36, y: source.position.y + 36 },
        data: { ...structuredClone(source.data), title: `${source.data.title} 副本`, protected: false }, selected: true,
      }
      set((state) => ({
        nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), duplicate],
        selectedNodeId: duplicateId, selectedEdgeId: null,
      }))
    },
    removeNode: (id) => {
      const node = get().nodes.find((item) => item.id === id)
      if (!node || node.data.protected) {
        set({ toast: 'Final 与主输出节点受保护，不能直接删除' })
        return
      }
      record()
      set((state) => ({
        nodes: state.nodes.filter((item) => item.id !== id),
        edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      }))
    },
    deleteSelected: () => {
      const state = get()
      const protectedSelection = state.nodes.find((node) => node.selected && node.data.protected)
      const selectedNodeIds = new Set(state.nodes.filter((node) => node.selected && !node.data.protected).map((node) => node.id))
      if (selectedNodeIds.size > 0) {
        record()
        set({
          nodes: state.nodes.filter((node) => !selectedNodeIds.has(node.id)),
          edges: state.edges.filter((edge) => !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target)),
          selectedNodeId: null,
        })
        return
      }
      if (protectedSelection) {
        set({ toast: 'Final 与主输出节点受保护，不能直接删除' })
        return
      }
      const selectedEdgeIds = new Set(state.edges.filter((edge) => edge.selected || edge.id === state.selectedEdgeId).map((edge) => edge.id))
      if (selectedEdgeIds.size > 0) {
        record()
        set({ edges: state.edges.filter((edge) => !selectedEdgeIds.has(edge.id)), selectedEdgeId: null })
      }
    },
    selectNode: (id, service = null) => set((state) => ({
      selectedNodeId: id, selectedEdgeId: null, activeService: service,
      nodes: state.nodes.map((node) => ({ ...node, selected: node.id === id })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
    })),
    selectEdge: (id) => set((state) => ({
      selectedEdgeId: id, selectedNodeId: null, activeService: null,
      nodes: state.nodes.map((node) => ({ ...node, selected: false })),
      edges: state.edges.map((edge) => ({ ...edge, selected: edge.id === id })),
    })),
    updateNodeData: (id, patch) => {
      record()
      set((state) => ({ nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node) }))
    },
    setRoutingTarget: (nodeId, targetId) => {
      const state = get()
      if (targetId === '__direct__' || targetId === '__reject__') {
        const kind = targetId === '__direct__' ? 'direct' : 'reject'
        record()
        set({
          nodes: state.nodes.map((node) => node.id === nodeId ? {
            ...node,
            data: { ...node.data, targetId: kind.toUpperCase(), targetLabel: kind.toUpperCase(), targetKind: kind },
          } : node),
          edges: state.edges.filter((edge) => edge.source !== nodeId || edge.data?.semantic !== 'route'),
        })
        return
      }
      const target = state.nodes.find((node) => node.id === targetId)
      if (!target) return
      record()
      const oldEdges = state.edges.filter((edge) => edge.source !== nodeId || edge.data?.semantic !== 'route')
      const newEdge: GraphEdge = {
        id: makeId('route'), source: nodeId, target: targetId, type: 'smoothstep',
        data: { semantic: target.data.category === 'output' ? 'output' : 'route' },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      }
      set({
        nodes: state.nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, targetId, targetLabel: target.data.title, targetKind: 'strategy' } } : node),
        edges: [...oldEdges, newEdge],
      })
    },
    addHop: (chainId) => {
      const state = get()
      const chain = state.nodes.find((node) => node.id === chainId)
      if (!chain) return
      const available = state.nodes.find((node) => node.data.category === 'strategy' && !(chain.data.hopIds ?? []).includes(node.id))
      if (!available) {
        record()
        const fallbackId = makeId('fallback')
        const fallback: GraphNode = {
          id: fallbackId,
          type: 'block',
          position: { x: chain.position.x - 300, y: chain.position.y + 420 },
          data: {
            blockType: 'fallback', category: 'strategy', title: '备用故障切换',
            subtitle: 'Mock Fallback · Standby', icon: 'refresh-cw', strategyMode: '故障自动切换',
          },
        }
        const inputSource = state.nodes.find((node) => node.id === 'us-filter')
        const newEdges: GraphEdge[] = [
          ...(inputSource ? [{ id: makeId('data'), source: inputSource.id, target: fallbackId, type: 'smoothstep' as const, data: { semantic: 'data' as const }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } }] : []),
          { id: makeId('strategy'), source: fallbackId, target: chainId, type: 'smoothstep', data: { semantic: 'strategy' }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } },
        ]
        const hopIds = [...(chain.data.hopIds ?? []), fallbackId]
        set({
          nodes: [...state.nodes.map((node) => node.id === chainId ? { ...node, data: { ...node.data, hopIds, subtitle: `代理链 · ${hopIds.length} Hops` } } : node), fallback],
          edges: [...state.edges, ...newEdges],
          toast: '已添加备用故障切换（Mock）',
        })
        return
      }
      record()
      const hopIds = [...(chain.data.hopIds ?? []), available.id]
      const hasReference = state.edges.some((edge) => edge.source === available.id && edge.target === chainId)
      const reference: GraphEdge = { id: makeId('strategy'), source: available.id, target: chainId, type: 'smoothstep', data: { semantic: 'strategy' }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } }
      set({
        nodes: state.nodes.map((node) => node.id === chainId ? { ...node, data: { ...node.data, hopIds, subtitle: `代理链 · ${hopIds.length} Hops` } } : node),
        edges: hasReference ? state.edges : [...state.edges, reference],
      })
    },
    removeHop: (chainId, hopId) => {
      const chain = get().nodes.find((node) => node.id === chainId)
      if (!chain) return
      const hops = (chain.data.hopIds ?? []).filter((id) => id !== hopId)
      record()
      set((state) => ({
        nodes: state.nodes.map((node) => node.id === chainId ? { ...node, data: { ...node.data, hopIds: hops, subtitle: `代理链 · ${hops.length} Hops` } } : node),
        edges: state.edges.filter((edge) => !(edge.source === hopId && edge.target === chainId && edge.data?.semantic === 'strategy')),
      }))
    },
    moveHop: (chainId, from, to) => {
      const chain = get().nodes.find((node) => node.id === chainId)
      if (!chain?.data.hopIds || to < 0 || to >= chain.data.hopIds.length) return
      const hops = [...chain.data.hopIds]
      const [item] = hops.splice(from, 1)
      hops.splice(to, 0, item)
      get().updateNodeData(chainId, { hopIds: hops })
    },
    setOutputClient: (id, client) => {
      const labels: Record<TargetClient, string> = { mihomo: 'Mihomo', 'sing-box': 'sing-box', surge: 'Surge', loon: 'Loon', 'quantumult-x': 'Quantumult X', shadowrocket: 'Shadowrocket', stash: 'Stash' }
      get().updateNodeData(id, { client, title: `${labels[client]} Output`, compatibility: ['mihomo', 'sing-box'].includes(client) ? 'Supported' : 'Prototype' })
    },
    beginTransaction: () => set((state) => ({ transactionStart: cloneSnapshot(state.nodes, state.edges) })),
    commitTransaction: () => {
      const start = get().transactionStart
      if (!start) return
      set((state) => ({ historyPast: [...state.historyPast.slice(-49), start], historyFuture: [], transactionStart: null }))
    },
    undo: () => {
      const state = get()
      const previous = state.historyPast.at(-1)
      if (!previous) return
      set({
        nodes: structuredClone(previous.nodes), edges: structuredClone(previous.edges),
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [cloneSnapshot(state.nodes, state.edges), ...state.historyFuture].slice(0, 50),
        selectedNodeId: null, selectedEdgeId: null,
      })
    },
    redo: () => {
      const state = get()
      const next = state.historyFuture[0]
      if (!next) return
      set({
        nodes: structuredClone(next.nodes), edges: structuredClone(next.edges),
        historyPast: [...state.historyPast, cloneSnapshot(state.nodes, state.edges)].slice(-50),
        historyFuture: state.historyFuture.slice(1), selectedNodeId: null, selectedEdgeId: null,
      })
    },
    autoLayout: () => {
      record()
      const columns: Record<string, { x: number; startY: number; gap: number }> = {
        source: { x: 60, startY: 60, gap: 250 }, processing: { x: 360, startY: 60, gap: 250 },
        strategy: { x: 660, startY: 60, gap: 250 }, chain: { x: 970, startY: 160, gap: 250 },
        routing: { x: 530, startY: 650, gap: 215 }, dns: { x: 1080, startY: 860, gap: 220 }, output: { x: 1350, startY: 250, gap: 250 },
      }
      const counters: Record<string, number> = {}
      set((state) => ({ nodes: state.nodes.map((node) => {
        const layout = columns[node.data.category]
        const index = counters[node.data.category] ?? 0
        counters[node.data.category] = index + 1
        const isRouting = node.data.category === 'routing'
        return { ...node, position: { x: isRouting ? layout.x + index * 280 : layout.x, y: isRouting ? layout.startY : layout.startY + index * layout.gap } }
      }) }))
    },
    setPreviewOpen: (previewOpen) => set({ previewOpen }),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setToast: (toast) => set({ toast }),
    parseSubscriptionInput: async (id, content, inputKind, fileName) => {
      const node = get().nodes.find((item) => item.id === id && item.data.blockType === 'subscription')
      if (!node) return
      const { parseSubscription } = await import('../core/subscription')
      const result = parseSubscription(content, { sourceId: id, sourceName: node.data.title, filename: fileName })
      const now = new Date().toISOString()
      const firstError = result.issues.find((issue) => issue.severity === 'error')
      const parsed = result.readyCount + result.partialCount
      const snapshot: SubscriptionSnapshot = {
        inputKind, fetchStatus: firstError && parsed === 0 ? 'failed' : 'ready', result,
        lastSuccessfulAt: parsed > 0 ? now : undefined, latestAttemptAt: now,
        ...(firstError ? { latestErrorCode: firstError.code, latestErrorMessage: firstError.message } : {}),
        ...(fileName ? { fileName } : {}),
      }
      set((state) => ({
        subscriptionSnapshots: { ...state.subscriptionSnapshots, [id]: snapshot },
        nodes: state.nodes.map((item) => item.id === id ? {
          ...item,
          data: {
            ...item.data, subscriptionInputKind: inputKind,
            ...(inputKind === 'paste' ? { subscriptionContent: content, subscriptionFileName: undefined } : { subscriptionContent: undefined, subscriptionFileName: fileName }),
            nodeCount: result.detectedCount, updatedAt: parsed > 0 ? formatTimestamp(now) : item.data.updatedAt,
            subtitle: `${result.detectedCount} detected · ${result.readyCount} usable`,
          },
        } : item),
        toast: parsed > 0 ? `导入完成：${result.detectedCount} 个节点，${result.readyCount} 个可用` : '订阅内容未能解析',
      }))
    },
    refreshSubscription: async (id) => {
      const node = get().nodes.find((item) => item.id === id && item.data.blockType === 'subscription')
      const url = node?.data.subscriptionUrl?.trim()
      if (!node || !url) {
        set({ toast: '请先填写订阅地址' })
        return
      }
      const previous = get().subscriptionSnapshots[id]
      const attemptedAt = new Date().toISOString()
      set((state) => ({
        subscriptionSnapshots: { ...state.subscriptionSnapshots, [id]: { ...previous, inputKind: 'url', fetchStatus: 'loading', latestAttemptAt: attemptedAt } },
      }))
      try {
        const { BrowserSourceFetcher, parseSubscription } = await import('../core/subscription')
        const content = await new BrowserSourceFetcher().fetchText(url)
        const result = parseSubscription(content, { sourceId: id, sourceName: node.data.title })
        const firstError = result.issues.find((issue) => issue.severity === 'error')
        const parsed = result.readyCount + result.partialCount
        if (parsed === 0 && firstError) throw Object.assign(new Error(firstError.message), { code: firstError.code })
        const successfulAt = new Date().toISOString()
        set((state) => ({
          subscriptionSnapshots: { ...state.subscriptionSnapshots, [id]: { inputKind: 'url', fetchStatus: 'ready', result, lastSuccessfulAt: successfulAt, latestAttemptAt: successfulAt } },
          nodes: state.nodes.map((item) => item.id === id ? { ...item, data: { ...item.data, subscriptionInputKind: 'url', subscriptionContent: undefined, subscriptionFileName: undefined, nodeCount: result.detectedCount, updatedAt: formatTimestamp(successfulAt), subtitle: `${result.detectedCount} detected · ${result.readyCount} usable` } } : item),
          toast: `订阅已解析：${result.detectedCount} 个节点`,
        }))
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'FETCH_FAILED'
        const message = error instanceof Error ? error.message : '无法读取订阅。'
        set((state) => ({
          subscriptionSnapshots: {
            ...state.subscriptionSnapshots,
            [id]: {
              ...previous, inputKind: 'url', fetchStatus: code === 'CORS_OR_NETWORK_ERROR' ? 'cors' : 'failed',
              latestAttemptAt: attemptedAt, latestErrorCode: code, latestErrorMessage: message, stale: Boolean(previous?.result?.proxies.length),
            },
          },
          toast: previous?.result?.proxies.length ? '刷新失败，继续使用上次成功结果' : message,
        }))
      }
    },
    hydrate: (project) => {
      if (project === undefined) {
        set({
          projectId: demoProject.id, projectName: demoProject.name,
          nodes: structuredClone(demoProject.graph.nodes), edges: structuredClone(demoProject.graph.edges),
          historyPast: [], historyFuture: [], hydrated: true, selectedNodeId: null, selectedEdgeId: null,
          recoveryRequired: true,
          recoveryNotice: '本地项目无法解析。原始数据尚未覆盖，请重置为 Demo 或新建 Project。',
          subscriptionSnapshots: {},
        })
        return
      }
      const migration = project ? migrateProject(project) : undefined
      const value = migration?.success && migration.project ? migration.project : demoProject
      set({
        projectId: value.id, projectName: value.name, nodes: structuredClone(value.graph.nodes), edges: structuredClone(value.graph.edges),
        historyPast: [], historyFuture: [], hydrated: true, selectedNodeId: null, selectedEdgeId: null,
        recoveryRequired: migration?.recoveryRequired ?? false,
        recoveryNotice: migration?.message ?? null,
        subscriptionSnapshots: {},
      })
      void rehydrateEmbeddedSubscriptions(value.graph.nodes, get().parseSubscriptionInput)
    },
    resetToDemo: () => {
      set({
        projectId: demoProject.id, projectName: demoProject.name,
        nodes: structuredClone(demoProject.graph.nodes), edges: structuredClone(demoProject.graph.edges),
        historyPast: [], historyFuture: [], selectedNodeId: null, selectedEdgeId: null,
        recoveryRequired: false, recoveryNotice: '已重置为 V0.5 Real Subscription Demo。',
        subscriptionSnapshots: {},
      })
      void rehydrateEmbeddedSubscriptions(demoProject.graph.nodes, get().parseSubscriptionInput)
    },
    createNewProject: () => {
      const value = createBlankProject()
      set({
        projectId: value.id, projectName: value.name,
        nodes: structuredClone(value.graph.nodes), edges: structuredClone(value.graph.edges),
        historyPast: [], historyFuture: [], selectedNodeId: null, selectedEdgeId: null,
        recoveryRequired: false, recoveryNotice: '已创建新的空白项目。',
        subscriptionSnapshots: {},
      })
    },
    dismissRecoveryNotice: () => set((state) => state.recoveryRequired ? state : { recoveryNotice: null }),
    toProject: () => {
      const state = get()
      return {
        version: PROJECT_SCHEMA_VERSION, id: state.projectId, name: state.projectName,
        graph: { nodes: state.nodes.map(({ selected: _selected, ...node }) => node as GraphNode), edges: state.edges.map(({ selected: _selected, ...edge }) => edge as GraphEdge) },
        services: demoProject.services, outputs: demoProject.outputs, updatedAt: new Date().toISOString(),
      }
    },
  }
})
