import { applyEdgeChanges, applyNodeChanges, MarkerType, type Connection, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import { create } from 'zustand'
import { blockByType, resolveLibraryNodePreset } from '../data/blockLibrary'
import { demoProject } from '../data/demoProject'
import { withLegacyChinaCompatibility } from '../data/legacyServices'
import { createBlankProject } from '../data/newProject'
import { isConnectionAllowed, semanticForConnection } from '../core/graph/graphRules'
import { migrateProject, PROJECT_SCHEMA_VERSION } from '../core/project/version'
import type { BlockNodeData, BlockType, GraphEdge, GraphNode, ProxyFlowProject, TargetClient } from '../types/project'
import { moveRoutingRule, moveRoutingRuleToIndex } from '../core/routing/routeProductModel'
import {
  clearRuntimeServiceConfig, loadRuntimeServiceConfig, saveRuntimeServiceConfig, ServerRuntimeProvider,
  type RuntimeServiceConfig,
} from '../core/runtime'
import {
  commitCandidate, createSnapshotCandidate, diffSubscriptionSnapshots, mapWithConcurrency, parseSubscription, RefreshCoordinator,
  normalizeSubscriptionRequestProfile, snapshotFreshness, sourceConfigFingerprint, subscriptionRuntimeRepository,
  type RefreshAllSummary, type RefreshHandlers, type SubscriptionFetchPath, type SubscriptionInputKind, type SubscriptionRefreshError,
  type SubscriptionRuntimeRecord, type SubscriptionSnapshot,
} from '../core/subscription'
import {
  blockDescriptionKey, blockTitleKey, getCurrentLocale, localizeDataValue, localizeProject, translateCurrent,
} from '../i18n'
import { createMihomoStarterDnsResolvers, createMihomoStarterProfile } from '../targets/mihomo/profile'
import { isPrimaryTarget, type PrimaryTarget } from '../core/capabilities'
import { resolveProjectPrimaryTarget } from '../core/project/primaryTarget'
import { canUseWorkspaceInput, moveWorkspaceProcessingStep, updateWorkspaceNodeData } from '../core/workspace'
import { normalizeValidProjectName } from '../core/project/projectName'
import { findAvailableNodePosition } from './nodePlacement'

interface GraphSnapshot {
  primaryTarget: PrimaryTarget | null
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface BuilderState {
  projectId: string
  projectName: string
  primaryTarget: PrimaryTarget | null
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  activeService: string | null
  historyPast: GraphSnapshot[]
  historyFuture: GraphSnapshot[]
  transactionStart: GraphSnapshot | null
  previewOpen: boolean
  previewTarget: PrimaryTarget | null
  saveStatus: 'saved' | 'saving'
  hydrated: boolean
  recoveryRequired: boolean
  recoveryNotice: string | null
  toast: string | null
  subscriptionSnapshots: Record<string, SubscriptionSnapshot>
  subscriptionRuntimes: Record<string, SubscriptionRuntimeRecord>
  runtimeService: RuntimeServiceConfig | null
  onNodesChange: (changes: NodeChange<GraphNode>[]) => void
  onEdgesChange: (changes: EdgeChange<GraphEdge>[]) => void
  connect: (connection: Connection) => boolean
  addNode: (type: BlockType, position: XYPosition, data?: Partial<BlockNodeData>) => string | null
  addLibraryNode: (entryType: BlockType, position: XYPosition, data?: Partial<BlockNodeData>) => string | null
  duplicateNode: (id: string) => void
  removeNode: (id: string) => void
  deleteSelected: () => void
  selectNode: (id: string | null, service?: string | null, additive?: boolean) => void
  selectEdge: (id: string | null) => void
  updateNodeData: (id: string, patch: Partial<BlockNodeData>) => void
  setWorkspaceInputs: (nodeId: string, sourceIds: string[]) => boolean
  moveProcessingStep: (nodeId: string, direction: 'up' | 'down') => boolean
  setRoutingTarget: (nodeId: string, targetId: string) => void
  moveRoutingRule: (nodeId: string, direction: 'up' | 'down') => void
  moveRoutingRuleToIndex: (nodeId: string, targetIndex: number) => void
  addHop: (chainId: string) => void
  removeHop: (chainId: string, hopId: string) => void
  moveHop: (chainId: string, from: number, to: number) => void
  setOutputClient: (id: string, client: TargetClient) => void
  setPrimaryTarget: (target: PrimaryTarget) => void
  beginTransaction: () => void
  commitTransaction: () => void
  undo: () => void
  redo: () => void
  autoLayout: () => void
  setPreviewOpen: (open: boolean, target?: PrimaryTarget) => void
  setSaveStatus: (status: 'saved' | 'saving') => void
  setToast: (message: string | null) => void
  setRuntimeServiceConfig: (config: RuntimeServiceConfig | null) => void
  disconnectRuntimeService: () => void
  hydrate: (project: ProxyFlowProject | null | undefined) => void
  resetToDemo: () => void
  createNewProject: (primaryTarget?: PrimaryTarget, name?: string) => void
  renameProject: (name: string) => boolean
  dismissRecoveryNotice: () => void
  parseSubscriptionInput: (id: string, content: string, inputKind: Extract<SubscriptionInputKind, 'paste' | 'file'>, fileName?: string) => Promise<void>
  refreshSubscription: (id: string) => Promise<void>
  refreshAllSubscriptions: () => Promise<RefreshAllSummary>
  applyEmptySubscription: (id: string) => Promise<void>
  adoptSubscriptionSnapshot: (id: string, snapshot: SubscriptionSnapshot) => Promise<void>
  keepCurrentSubscription: (id: string) => void
  clearCachedSubscription: (id: string) => Promise<void>
  hydrateSubscriptionCache: () => Promise<void>
  toProject: () => ProxyFlowProject
}

const cloneSnapshot = (primaryTarget: PrimaryTarget | null, nodes: GraphNode[], edges: GraphEdge[]): GraphSnapshot => ({
  primaryTarget,
  nodes: structuredClone(nodes),
  edges: structuredClone(edges),
})

const makeId = (prefix: string) => `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now()}`

const defaultDataFor = (type: BlockType): Partial<BlockNodeData> => {
  if (type === 'subscription') return { subscriptionUrl: '', subscriptionInputKind: 'url', subscriptionRequestProfile: 'auto', subscriptionExportMode: 'auto', enabled: true, nodeCount: 0, updatedAt: translateCurrent('demo.subscription.notParsed') }
  if (type === 'manual-proxy') return { proxyProtocol: 'socks5', proxyServer: '', proxyPort: 1080, proxyTransport: 'tcp' }
  if (type === 'filter') return {
    include: [], exclude: [], filterMode: 'keyword', filterOperation: 'include', filterKeyword: '', filterRegexIgnoreCase: true,
  }
  if (type === 'rename') return { renameMode: 'regex', renamePattern: '', renameReplacement: '', renameIgnoreCase: false, renameGlobal: true }
  if (type === 'limit') return { limit: 10 }
  if (type === 'auto-select') return { strategyMode: translateCurrent('demo.strategy.auto'), testUrl: 'https://www.gstatic.com/generate_204', interval: 300, tolerance: 50 }
  if (type === 'load-balance') return { loadBalanceMode: 'round-robin' }
  if (type === 'proxy-chain') return { hopIds: [] }
  if (['routing-group', 'service-rule'].includes(type)) return { services: [], routeMatcherKind: 'service', ruleSource: 'ios_rule_script' }
  if (type === 'custom-rule') return { routeMatcherKind: 'domain-suffix', routeMatcherValue: '', ruleSource: 'custom' }
  if (type === 'output') return { client: 'mihomo', compatibility: 'Supported', mihomoProfile: createMihomoStarterProfile() }
  if (type === 'dns') return { dnsResolvers: createMihomoStarterDnsResolvers() }
  return {}
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(getCurrentLocale(), { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

const subscriptionRefreshCoordinator = new RefreshCoordinator()

function emptySubscriptionRuntime(sourceId: string, inputKind: SubscriptionInputKind, fingerprint = ''): SubscriptionRuntimeRecord {
  return {
    sourceId, inputKind, sourceConfigFingerprint: fingerprint, refreshStatus: 'idle', activeState: 'none',
    freshness: 'fresh', requestGeneration: 0,
  }
}

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}

function snapshotNodeData(snapshot: SubscriptionSnapshot) {
  return {
    subscriptionInputKind: snapshot.inputKind,
    nodeCount: snapshot.result.detectedCount,
    updatedAt: formatTimestamp(snapshot.committedAt),
    subtitle: translateCurrent('demo.subscription.dynamicSubtitle', { detected: snapshot.result.detectedCount, ready: snapshot.readyCount }),
    subtitleKey: undefined,
  } as const
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
  const inputGenerations = new Map<string, number>()
  let hydrationProjectId: string | null = null
  let hydrationBarrier: Promise<void> = Promise.resolve()
  const trackHydration = (projectId: string, task: Promise<void>) => {
    hydrationProjectId = projectId
    hydrationBarrier = task.catch(() => undefined)
  }
  const waitForHydration = async (projectId: string) => {
    if (hydrationProjectId !== projectId) return
    const barrier = hydrationBarrier
    await barrier
    if (hydrationProjectId === projectId && hydrationBarrier !== barrier) await waitForHydration(projectId)
  }
  const nextInputGeneration = (projectId: string, sourceId: string) => {
    const key = `${projectId}\u0000${sourceId}`
    const generation = (inputGenerations.get(key) ?? 0) + 1
    inputGenerations.set(key, generation)
    return generation
  }
  const isCurrentInput = (projectId: string, sourceId: string, generation: number) => (inputGenerations.get(`${projectId}\u0000${sourceId}`) ?? 0) === generation
  const cancelSubscriptionSource = (projectId: string, sourceId: string) => {
    nextInputGeneration(projectId, sourceId)
    subscriptionRefreshCoordinator.cancel(projectId, sourceId)
  }
  const deleteSubscriptionSource = (projectId: string, sourceId: string) => {
    nextInputGeneration(projectId, sourceId)
    void subscriptionRefreshCoordinator.deleteSource(projectId, sourceId).catch(() => undefined)
  }
  const record = () => set((state) => ({
    historyPast: [...state.historyPast.slice(-49), cloneSnapshot(state.primaryTarget, state.nodes, state.edges)],
    historyFuture: [],
  }))

  const refreshHandlers = (id: string, fetchPath: SubscriptionFetchPath = 'browser'): RefreshHandlers => ({
    onStart: (generation, attemptedAt, fingerprint) => set((state) => {
      const previous = state.subscriptionRuntimes[id]
      const configChanged = Boolean(previous?.sourceConfigFingerprint && previous.sourceConfigFingerprint !== fingerprint)
      const base = configChanged ? emptySubscriptionRuntime(id, 'url', fingerprint) : previous ?? emptySubscriptionRuntime(id, 'url', fingerprint)
      return {
        subscriptionRuntimes: {
          ...state.subscriptionRuntimes,
          [id]: {
            ...base,
            inputKind: 'url', sourceConfigFingerprint: fingerprint, refreshStatus: 'loading',
            lastAttemptAt: attemptedAt, latestFetchPath: fetchPath, requestGeneration: generation,
            pendingEmptySnapshot: undefined, pendingEmptyDiff: undefined, cacheError: undefined,
          },
        },
        ...(configChanged ? { subscriptionSnapshots: withoutKey(state.subscriptionSnapshots, id) } : {}),
      }
    }),
    onCommit: (snapshot, diff, generation) => set((state) => {
      const previous = state.subscriptionRuntimes[id]
      if (previous?.requestGeneration !== generation || state.projectId !== get().projectId
        || !state.nodes.some((item) => item.id === id && item.data.blockType === 'subscription')) return state
      return {
        subscriptionSnapshots: { ...state.subscriptionSnapshots, [id]: snapshot },
        subscriptionRuntimes: {
          ...state.subscriptionRuntimes,
          [id]: {
            ...previous, sourceId: id, inputKind: 'url', sourceConfigFingerprint: snapshot.sourceConfigFingerprint,
            refreshStatus: 'succeeded', activeState: snapshot.quality, freshness: 'fresh', latestOutcome: 'success',
            activeSnapshot: snapshot, latestDiff: diff, lastSuccessfulAt: snapshot.committedAt,
            latestError: undefined, cacheError: undefined, pendingEmptySnapshot: undefined, pendingEmptyDiff: undefined,
            requestGeneration: generation,
          },
        },
        nodes: state.nodes.map((item) => item.id === id ? {
          ...item,
          data: { ...item.data, ...snapshotNodeData(snapshot), subscriptionContent: undefined, subscriptionFileName: undefined },
        } : item),
        toast: translateCurrent('toast.subscriptionParsed', { count: snapshot.result.detectedCount }),
      }
    }),
    onEmptyConfirmation: (candidate, diff, generation) => set((state) => {
      const previous = state.subscriptionRuntimes[id]
      if (previous?.requestGeneration !== generation
        || !state.nodes.some((item) => item.id === id && item.data.blockType === 'subscription')) return state
      return {
        subscriptionRuntimes: {
          ...state.subscriptionRuntimes,
          [id]: {
            ...previous, refreshStatus: 'succeeded', latestOutcome: 'empty-confirmation-required',
            pendingEmptySnapshot: candidate, pendingEmptyDiff: diff, latestError: undefined,
          },
        },
      }
    }),
    onFailure: (error, generation) => set((state) => {
      const previous = state.subscriptionRuntimes[id]
      if (previous?.requestGeneration !== generation
        || !state.nodes.some((item) => item.id === id && item.data.blockType === 'subscription')) return state
      return {
        subscriptionRuntimes: {
          ...state.subscriptionRuntimes,
          [id]: {
            ...previous, refreshStatus: 'failed', latestOutcome: 'failure', lastFailureAt: error.at,
            latestError: error, freshness: previous.activeSnapshot ? snapshotFreshness(previous.activeSnapshot.committedAt) : 'fresh',
          },
        },
        toast: previous.activeSnapshot ? translateCurrent('toast.refreshCached') : translateCurrent('issue.generic', { code: error.code }),
      }
    }),
    onCacheError: (error, generation) => set((state) => {
      const previous = state.subscriptionRuntimes[id]
      if (!previous || previous.requestGeneration !== generation
        || !state.nodes.some((item) => item.id === id && item.data.blockType === 'subscription')) return state
      return { subscriptionRuntimes: { ...state.subscriptionRuntimes, [id]: { ...previous, cacheError: error } } }
    }),
  })

  return {
    projectId: demoProject.id,
    projectName: demoProject.name,
    primaryTarget: demoProject.primaryTarget ?? null,
    nodes: structuredClone(demoProject.graph.nodes),
    edges: structuredClone(demoProject.graph.edges),
    selectedNodeId: null,
    selectedEdgeId: null,
    activeService: null,
    historyPast: [],
    historyFuture: [],
    transactionStart: null,
    previewOpen: false,
    previewTarget: null,
    saveStatus: 'saved',
    hydrated: false,
    recoveryRequired: false,
    recoveryNotice: null,
    toast: null,
    subscriptionSnapshots: {},
    subscriptionRuntimes: {},
    runtimeService: loadRuntimeServiceConfig(),

    onNodesChange: (changes) => {
      const hasRemoval = changes.some((change) => change.type === 'remove')
      if (hasRemoval) record()
      const protectedIds = new Set(get().nodes.filter((node) => node.data.protected).map((node) => node.id))
      for (const change of changes) {
        const removed = change.type === 'remove' ? get().nodes.find((node) => node.id === change.id) : undefined
        if (removed?.data.blockType === 'subscription' && !protectedIds.has(removed.id)) deleteSubscriptionSource(get().projectId, removed.id)
      }
      const safeChanges = changes.filter((change) => change.type !== 'select' && (change.type !== 'remove' || !protectedIds.has(change.id)))
      set((state) => ({ nodes: applyNodeChanges(safeChanges, state.nodes) }))
    },
    onEdgesChange: (changes) => {
      if (changes.some((change) => change.type === 'remove')) record()
      set((state) => ({ edges: applyEdgeChanges(changes, state.edges) }))
    },
    connect: (connection) => {
      const state = get()
      if (!isConnectionAllowed(connection, state.nodes)) {
        set({ toast: translateCurrent('toast.connectionRejected') })
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
    addNode: (type, position, dataPatch) => {
      const item = blockByType.get(type)
      if (!item) return null
      record()
      const id = makeId(type)
      const data: BlockNodeData = {
        blockType: type, category: item.category, title: translateCurrent(blockTitleKey(type)), subtitle: translateCurrent(blockDescriptionKey(type)),
        titleKey: blockTitleKey(type), subtitleKey: blockDescriptionKey(type), icon: item.icon,
        ...defaultDataFor(type),
        ...dataPatch,
      }
      if (dataPatch?.titleKey) data.title = translateCurrent(dataPatch.titleKey as Parameters<typeof translateCurrent>[0])
      if (dataPatch?.subtitleKey) data.subtitle = translateCurrent(dataPatch.subtitleKey as Parameters<typeof translateCurrent>[0])
      const node: GraphNode = { id, type: 'block', position: findAvailableNodePosition(position, get().nodes), data, selected: true }
      set((state) => ({
        nodes: [...state.nodes.map((existing) => ({ ...existing, selected: false })), node],
        selectedNodeId: id,
        selectedEdgeId: null,
      }))
      return id
    },
    addLibraryNode: (entryType, position, data) => {
      const preset = resolveLibraryNodePreset(entryType)
      return get().addNode(preset.blockType, position, { ...preset.data, ...data })
    },
    duplicateNode: (id) => {
      const source = get().nodes.find((node) => node.id === id)
      if (!source) return
      record()
      const duplicateId = makeId(source.data.blockType)
      const duplicate: GraphNode = {
        ...structuredClone(source), id: duplicateId,
        position: findAvailableNodePosition({ x: source.position.x + 36, y: source.position.y + 36 }, get().nodes),
        data: { ...structuredClone(source.data), title: translateCurrent('toast.duplicateSuffix', { name: localizeDataValue(source.data.title, source.data.titleKey, getCurrentLocale()) }), titleKey: undefined, protected: false }, selected: true,
      }
      set((state) => ({
        nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), duplicate],
        selectedNodeId: duplicateId, selectedEdgeId: null,
      }))
    },
    removeNode: (id) => {
      const node = get().nodes.find((item) => item.id === id)
      if (!node || node.data.protected) {
        set({ toast: translateCurrent('toast.protectedNode') })
        return
      }
      record()
      if (node.data.blockType === 'subscription') deleteSubscriptionSource(get().projectId, id)
      else subscriptionRefreshCoordinator.cancel(get().projectId, id)
      set((state) => ({
        nodes: state.nodes.filter((item) => item.id !== id),
        edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        subscriptionSnapshots: withoutKey(state.subscriptionSnapshots, id),
        subscriptionRuntimes: withoutKey(state.subscriptionRuntimes, id),
      }))
    },
    deleteSelected: () => {
      const state = get()
      const protectedSelection = state.nodes.find((node) => node.selected && node.data.protected)
      const selectedNodeIds = new Set(state.nodes.filter((node) => node.selected && !node.data.protected).map((node) => node.id))
      if (selectedNodeIds.size > 0) {
        for (const id of selectedNodeIds) {
          const node = state.nodes.find((item) => item.id === id)
          if (node?.data.blockType === 'subscription') deleteSubscriptionSource(state.projectId, id)
          else subscriptionRefreshCoordinator.cancel(state.projectId, id)
        }
        record()
        set({
          nodes: state.nodes.filter((node) => !selectedNodeIds.has(node.id)),
          edges: state.edges.filter((edge) => !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target)),
          selectedNodeId: null,
          subscriptionSnapshots: Object.fromEntries(Object.entries(state.subscriptionSnapshots).filter(([id]) => !selectedNodeIds.has(id))),
          subscriptionRuntimes: Object.fromEntries(Object.entries(state.subscriptionRuntimes).filter(([id]) => !selectedNodeIds.has(id))),
        })
        return
      }
      if (protectedSelection) {
        set({ toast: translateCurrent('toast.protectedNode') })
        return
      }
      const selectedEdgeIds = new Set(state.edges.filter((edge) => edge.selected || edge.id === state.selectedEdgeId).map((edge) => edge.id))
      if (selectedEdgeIds.size > 0) {
        record()
        set({ edges: state.edges.filter((edge) => !selectedEdgeIds.has(edge.id)), selectedEdgeId: null })
      }
    },
    selectNode: (id, service = null, additive = false) => set((state) => ({
      selectedNodeId: id, selectedEdgeId: null, activeService: service,
      nodes: state.nodes.map((node) => ({ ...node, selected: additive ? Boolean(node.selected || node.id === id) : node.id === id })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
    })),
    selectEdge: (id) => set((state) => ({
      selectedEdgeId: id, selectedNodeId: null, activeService: null,
      nodes: state.nodes.map((node) => ({ ...node, selected: false })),
      edges: state.edges.map((edge) => ({ ...edge, selected: edge.id === id })),
    })),
    updateNodeData: (id, patch) => {
      const current = get()
      const node = current.nodes.find((item) => item.id === id)
      const urlChanged = node?.data.blockType === 'subscription'
        && patch.subscriptionUrl !== undefined
        && patch.subscriptionUrl !== node.data.subscriptionUrl
      const requestProfileChanged = node?.data.blockType === 'subscription'
        && patch.subscriptionRequestProfile !== undefined
        && normalizeSubscriptionRequestProfile(patch.subscriptionRequestProfile) !== normalizeSubscriptionRequestProfile(node.data.subscriptionRequestProfile)
      const sourceConfigChanged = urlChanged || requestProfileChanged
      record()
      if (sourceConfigChanged) {
        nextInputGeneration(current.projectId, id)
        void subscriptionRefreshCoordinator.deleteSource(current.projectId, id).catch(() => undefined)
      }
      const soleOutputTarget = node?.data.blockType === 'output'
        && current.nodes.filter((item) => item.data.blockType === 'output').length === 1
        && patch.client !== undefined
        ? (isPrimaryTarget(patch.client) ? patch.client : null)
        : undefined
      set((state) => ({
        nodes: updateWorkspaceNodeData(state.nodes, id, { ...patch, ...(sourceConfigChanged ? { nodeCount: 0 } : {}) }),
        ...(soleOutputTarget !== undefined ? { primaryTarget: soleOutputTarget } : {}),
        ...(sourceConfigChanged ? {
          subscriptionSnapshots: withoutKey(state.subscriptionSnapshots, id),
          subscriptionRuntimes: withoutKey(state.subscriptionRuntimes, id),
        } : {}),
      }))
    },
    setWorkspaceInputs: (nodeId, sourceIds) => {
      const state = get()
      const target = state.nodes.find((node) => node.id === nodeId)
      if (!target || !['processing', 'strategy'].includes(target.data.category)) return false
      const uniqueSourceIds = [...new Set(sourceIds)]
      const connections = uniqueSourceIds.map((source) => ({ source, target: nodeId, sourceHandle: null, targetHandle: null }))
      if (connections.some((connection) => !canUseWorkspaceInput(state.nodes, state.edges, nodeId, connection.source))) return false

      const managedSemantics = new Set(['data', 'strategy'])
      const existingInputs = state.edges
        .filter((edge) => edge.target === nodeId && managedSemantics.has(String(edge.data?.semantic)))
        .map((edge) => edge.source)
      if (existingInputs.length === uniqueSourceIds.length && existingInputs.every((id) => uniqueSourceIds.includes(id))) return true

      const retainedEdges = state.edges.filter((edge) => edge.target !== nodeId || !managedSemantics.has(String(edge.data?.semantic)))
      const nextEdges: GraphEdge[] = connections.map((connection) => {
        const semantic = semanticForConnection(connection, state.nodes)
        return {
          id: makeId(semantic), source: connection.source, target: connection.target, type: 'smoothstep',
          data: { semantic }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        }
      })
      record()
      set({ edges: [...retainedEdges, ...nextEdges] })
      return true
    },
    moveProcessingStep: (nodeId, direction) => {
      const state = get()
      const edges = moveWorkspaceProcessingStep(state.nodes, state.edges, nodeId, direction)
      if (edges === state.edges) return false
      record()
      set({ edges })
      return true
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
    moveRoutingRule: (nodeId, direction) => {
      const state = get()
      const nodes = moveRoutingRule(state.nodes, nodeId, direction)
      if (nodes === state.nodes) return
      record()
      set({ nodes })
    },
    moveRoutingRuleToIndex: (nodeId, targetIndex) => {
      const state = get()
      const nodes = moveRoutingRuleToIndex(state.nodes, nodeId, targetIndex)
      if (nodes === state.nodes) return
      record()
      set({ nodes })
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
          position: findAvailableNodePosition({ x: chain.position.x - 300, y: chain.position.y + 420 }, state.nodes),
          data: {
            blockType: 'fallback', category: 'strategy', title: translateCurrent('block.fallback.title'), titleKey: 'block.fallback.title',
            subtitle: translateCurrent('block.fallback.description'), subtitleKey: 'block.fallback.description', icon: 'refresh-cw', strategyMode: translateCurrent('demo.strategy.fallback'),
          },
        }
        const inputSource = state.nodes.find((node) => node.id === 'us-filter')
        const newEdges: GraphEdge[] = [
          ...(inputSource ? [{ id: makeId('data'), source: inputSource.id, target: fallbackId, type: 'smoothstep' as const, data: { semantic: 'data' as const }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } }] : []),
          { id: makeId('strategy'), source: fallbackId, target: chainId, type: 'smoothstep', data: { semantic: 'strategy' }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } },
        ]
        const hopIds = [...(chain.data.hopIds ?? []), fallbackId]
        set({
          nodes: [...state.nodes.map((node) => node.id === chainId ? { ...node, data: { ...node.data, hopIds, subtitle: translateCurrent('demo.chain.dynamicSubtitle', { count: hopIds.length }), subtitleKey: undefined } } : node), fallback],
          edges: [...state.edges, ...newEdges],
          toast: translateCurrent('toast.fallbackAdded'),
        })
        return
      }
      record()
      const hopIds = [...(chain.data.hopIds ?? []), available.id]
      const hasReference = state.edges.some((edge) => edge.source === available.id && edge.target === chainId)
      const reference: GraphEdge = { id: makeId('strategy'), source: available.id, target: chainId, type: 'smoothstep', data: { semantic: 'strategy' }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } }
      set({
        nodes: state.nodes.map((node) => node.id === chainId ? { ...node, data: { ...node.data, hopIds, subtitle: translateCurrent('demo.chain.dynamicSubtitle', { count: hopIds.length }), subtitleKey: undefined } } : node),
        edges: hasReference ? state.edges : [...state.edges, reference],
      })
    },
    removeHop: (chainId, hopId) => {
      const chain = get().nodes.find((node) => node.id === chainId)
      if (!chain) return
      const hops = (chain.data.hopIds ?? []).filter((id) => id !== hopId)
      record()
      set((state) => ({
        nodes: state.nodes.map((node) => node.id === chainId ? { ...node, data: { ...node.data, hopIds: hops, subtitle: translateCurrent('demo.chain.dynamicSubtitle', { count: hops.length }), subtitleKey: undefined } } : node),
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
      get().updateNodeData(id, { client, title: translateCurrent('node.outputTitle', { target: labels[client] }), titleKey: undefined, compatibility: ['mihomo', 'sing-box'].includes(client) ? 'Supported' : 'Prototype' })
    },
    setPrimaryTarget: (target) => {
      const state = get()
      const outputNodes = state.nodes.filter((node) => node.data.blockType === 'output')
      if (state.primaryTarget === target && (outputNodes.length !== 1 || outputNodes[0].data.client === target)) return
      record()
      const labels: Record<PrimaryTarget, string> = { mihomo: 'Mihomo', 'sing-box': 'sing-box' }
      set({
        primaryTarget: target,
        nodes: outputNodes.length === 1 ? state.nodes.map((node) => node.id === outputNodes[0].id ? {
          ...node,
          data: {
            ...node.data,
            client: target,
            title: translateCurrent('node.outputTitle', { target: labels[target] }),
            titleKey: undefined,
            compatibility: 'Supported',
          },
        } : node) : state.nodes,
      })
    },
    beginTransaction: () => set((state) => ({ transactionStart: cloneSnapshot(state.primaryTarget, state.nodes, state.edges) })),
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
        primaryTarget: previous.primaryTarget, nodes: structuredClone(previous.nodes), edges: structuredClone(previous.edges),
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [cloneSnapshot(state.primaryTarget, state.nodes, state.edges), ...state.historyFuture].slice(0, 50),
        selectedNodeId: null, selectedEdgeId: null,
      })
    },
    redo: () => {
      const state = get()
      const next = state.historyFuture[0]
      if (!next) return
      set({
        primaryTarget: next.primaryTarget, nodes: structuredClone(next.nodes), edges: structuredClone(next.edges),
        historyPast: [...state.historyPast, cloneSnapshot(state.primaryTarget, state.nodes, state.edges)].slice(-50),
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
    setPreviewOpen: (previewOpen, target) => set((state) => ({
      previewOpen,
      ...(previewOpen ? { previewTarget: target ?? state.primaryTarget } : {}),
    })),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setToast: (toast) => set({ toast }),
    parseSubscriptionInput: async (id, content, inputKind, fileName) => {
      const projectId = get().projectId
      const node = get().nodes.find((item) => item.id === id && item.data.blockType === 'subscription')
      if (!node) return
      const inputGeneration = nextInputGeneration(projectId, id)
      subscriptionRefreshCoordinator.cancel(get().projectId, id)
      const attemptedAt = new Date().toISOString()
      const result = parseSubscription(content, { sourceId: id, sourceName: localizeDataValue(node.data.title, node.data.titleKey, getCurrentLocale()), filename: fileName })
      const fingerprint = await sourceConfigFingerprint(inputKind, content)
      const parsedAt = new Date().toISOString()
      const candidate = await createSnapshotCandidate({
        sourceId: id, inputKind, sourceConfigFingerprint: fingerprint, content, result,
        fetchedAt: attemptedAt, parsedAt,
      })
      if (!isCurrentInput(projectId, id, inputGeneration) || get().projectId !== projectId || !get().nodes.some((item) => item.id === id && item.data.blockType === 'subscription')) return
      if (candidate.quality === 'invalid') {
        const code = result.detectedCount > 0 ? 'SUBSCRIPTION_NO_USABLE_NODES'
          : result.format === 'unsupported' && content.trim() ? 'SUBSCRIPTION_UNSUPPORTED_FORMAT' : 'SUBSCRIPTION_PARSE_FAILED'
        const latestError: SubscriptionRefreshError = {
          code, at: parsedAt, message: code === 'SUBSCRIPTION_NO_USABLE_NODES'
            ? 'The subscription contains no Ready nodes.'
            : code === 'SUBSCRIPTION_UNSUPPORTED_FORMAT' ? 'The subscription format is not supported.' : 'The subscription could not be parsed.',
        }
        set((state) => ({
          subscriptionSnapshots: withoutKey(state.subscriptionSnapshots, id),
          subscriptionRuntimes: {
            ...state.subscriptionRuntimes,
            [id]: {
              ...emptySubscriptionRuntime(id, inputKind, fingerprint), refreshStatus: 'failed', latestOutcome: 'failure',
              lastAttemptAt: attemptedAt, lastFailureAt: parsedAt, latestError, fileName,
            },
          },
          nodes: state.nodes.map((item) => item.id === id ? {
            ...item,
            data: {
              ...item.data, subscriptionInputKind: inputKind,
              ...(inputKind === 'paste' ? { subscriptionContent: content, subscriptionFileName: undefined } : { subscriptionContent: undefined, subscriptionFileName: fileName }),
              nodeCount: 0,
            },
          } : item),
          toast: translateCurrent('toast.importFailed'),
        }))
        return
      }
      const committedAt = new Date().toISOString()
      const snapshot = commitCandidate(candidate, committedAt)
      const diff = await diffSubscriptionSnapshots(undefined, candidate)
      if (!isCurrentInput(projectId, id, inputGeneration) || get().projectId !== projectId || !get().nodes.some((item) => item.id === id && item.data.blockType === 'subscription')) return
      set((state) => ({
        subscriptionSnapshots: { ...state.subscriptionSnapshots, [id]: snapshot },
        subscriptionRuntimes: {
          ...state.subscriptionRuntimes,
          [id]: {
            ...emptySubscriptionRuntime(id, inputKind, fingerprint), refreshStatus: 'succeeded', activeState: snapshot.quality,
            latestOutcome: 'success', activeSnapshot: snapshot, latestDiff: diff, lastAttemptAt: attemptedAt,
            lastSuccessfulAt: committedAt, fileName,
          },
        },
        nodes: state.nodes.map((item) => item.id === id ? {
          ...item,
          data: {
            ...item.data, ...snapshotNodeData(snapshot), subscriptionInputKind: inputKind,
            ...(inputKind === 'paste' ? { subscriptionContent: content, subscriptionFileName: undefined } : { subscriptionContent: undefined, subscriptionFileName: fileName }),
          },
        } : item),
        toast: translateCurrent('toast.importComplete', { detected: result.detectedCount, ready: result.readyCount }),
      }))
    },
    refreshSubscription: async (id) => {
      const projectId = get().projectId
      await waitForHydration(projectId)
      if (get().projectId !== projectId) return
      const node = get().nodes.find((item) => item.id === id && item.data.blockType === 'subscription')
      const url = node?.data.subscriptionUrl?.trim()
      if (!node || !url) {
        set({ toast: translateCurrent('toast.enterSubscriptionUrl') })
        return
      }
      nextInputGeneration(projectId, id)
      const state = get()
      const requestProfile = normalizeSubscriptionRequestProfile(node.data.subscriptionRequestProfile)
      const fetchPath: SubscriptionFetchPath = state.runtimeService ? 'runtime' : 'browser'
      const runtimeFetcher = state.runtimeService
        ? new ServerRuntimeProvider(state.runtimeService, {
          projectId: state.projectId, sourceId: id,
          sourceName: localizeDataValue(node.data.title, node.data.titleKey, getCurrentLocale()),
        })
        : undefined
      await subscriptionRefreshCoordinator.refresh({
        projectId: state.projectId, sourceId: id,
        sourceName: localizeDataValue(node.data.title, node.data.titleKey, getCurrentLocale()),
        url, requestProfile, activeSnapshot: state.subscriptionSnapshots[id], fetcher: runtimeFetcher,
      }, refreshHandlers(id, fetchPath))
    },
    refreshAllSubscriptions: async () => {
      const state = get()
      const subscriptions = state.nodes.filter((node) => node.data.blockType === 'subscription')
      const eligible = subscriptions.filter((node) => node.data.enabled !== false && node.data.subscriptionInputKind === 'url' && Boolean(node.data.subscriptionUrl?.trim()))
      const retainedBefore = new Set(eligible.filter((node) => state.subscriptionSnapshots[node.id]).map((node) => node.id))
      const settled = await mapWithConcurrency(eligible, 3, async (node) => {
        const before = get().subscriptionRuntimes[node.id]?.latestOutcome
        await get().refreshSubscription(node.id)
        const runtime = get().subscriptionRuntimes[node.id]
        return { id: node.id, outcome: runtime?.latestOutcome ?? before }
      })
      const outcomes = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      const summary: RefreshAllSummary = {
        succeeded: outcomes.filter(({ outcome }) => outcome === 'success').length,
        failed: outcomes.filter(({ outcome }) => outcome === 'failure').length + settled.filter((result) => result.status === 'rejected').length,
        skipped: subscriptions.length - eligible.length,
        confirmationRequired: outcomes.filter(({ outcome }) => outcome === 'empty-confirmation-required').length,
        retainedPrevious: outcomes.filter(({ id, outcome }) => outcome === 'failure' && retainedBefore.has(id)).length,
      }
      set({ toast: translateCurrent('toast.refreshAllComplete', { succeeded: summary.succeeded, failed: summary.failed, skipped: summary.skipped }) })
      return summary
    },
    applyEmptySubscription: async (id) => {
      const state = get()
      const runtime = state.subscriptionRuntimes[id]
      const candidate = runtime?.pendingEmptySnapshot
      if (!runtime || !candidate || candidate.quality !== 'empty') return
      const inputGeneration = inputGenerations.get(`${state.projectId}\u0000${id}`) ?? 0
      if (!isCurrentInput(state.projectId, id, inputGeneration) || !state.nodes.some((item) => item.id === id && item.data.blockType === 'subscription')) return
      const snapshot = commitCandidate(candidate, new Date().toISOString())
      const diff = runtime.pendingEmptyDiff ?? await diffSubscriptionSnapshots(runtime.activeSnapshot, candidate)
      if (!isCurrentInput(state.projectId, id, inputGeneration) || !get().nodes.some((item) => item.id === id && item.data.blockType === 'subscription')) return
      set((current) => ({
        subscriptionSnapshots: { ...current.subscriptionSnapshots, [id]: snapshot },
        subscriptionRuntimes: {
          ...current.subscriptionRuntimes,
          [id]: {
            ...runtime, refreshStatus: 'succeeded', activeState: 'empty', freshness: 'fresh', latestOutcome: 'success',
            activeSnapshot: snapshot, latestDiff: diff, lastSuccessfulAt: snapshot.committedAt,
            pendingEmptySnapshot: undefined, pendingEmptyDiff: undefined, latestError: undefined, cacheError: undefined,
          },
        },
        nodes: current.nodes.map((item) => item.id === id ? { ...item, data: { ...item.data, ...snapshotNodeData(snapshot) } } : item),
      }))
      await subscriptionRefreshCoordinator.persistSnapshot(state.projectId, snapshot, {
        onCacheError: (error) => refreshHandlers(id, runtime.latestFetchPath).onCacheError(error, runtime.requestGeneration),
      }, runtime.requestGeneration)
      if (state.runtimeService) {
        const node = state.nodes.find((item) => item.id === id)
        if (node) await new ServerRuntimeProvider(state.runtimeService, {
          projectId: state.projectId, sourceId: id,
          sourceName: localizeDataValue(node.data.title, node.data.titleKey, getCurrentLocale()),
        }).confirmEmpty().catch(() => undefined)
      }
    },
    adoptSubscriptionSnapshot: async (id, snapshot) => {
      const state = get()
      const node = state.nodes.find((item) => item.id === id && item.data.blockType === 'subscription')
      if (!node) return
      const generation = nextInputGeneration(state.projectId, id)
      subscriptionRefreshCoordinator.cancel(state.projectId, id)
      const diff = await diffSubscriptionSnapshots(state.subscriptionSnapshots[id], snapshot)
      if (!isCurrentInput(state.projectId, id, generation) || !get().nodes.some((item) => item.id === id && item.data.blockType === 'subscription')) return
      set((current) => ({
        subscriptionSnapshots: { ...current.subscriptionSnapshots, [id]: snapshot },
        subscriptionRuntimes: {
          ...current.subscriptionRuntimes,
          [id]: {
            ...emptySubscriptionRuntime(id, 'url', snapshot.sourceConfigFingerprint), refreshStatus: 'succeeded', activeState: snapshot.quality,
            freshness: snapshotFreshness(snapshot.committedAt), latestOutcome: 'success', activeSnapshot: snapshot,
            latestDiff: diff, lastSuccessfulAt: snapshot.committedAt,
          },
        },
        nodes: current.nodes.map((item) => item.id === id ? { ...item, data: { ...item.data, ...snapshotNodeData(snapshot) } } : item),
      }))
      await subscriptionRefreshCoordinator.persistSnapshot(state.projectId, snapshot)
    },
    keepCurrentSubscription: (id) => {
      const state = get()
      const runtime = state.subscriptionRuntimes[id]
      if (!runtime?.pendingEmptySnapshot) return
      const node = state.nodes.find((item) => item.id === id)
      set({ subscriptionRuntimes: {
        ...state.subscriptionRuntimes,
        [id]: { ...runtime, latestOutcome: 'success', pendingEmptySnapshot: undefined, pendingEmptyDiff: undefined },
      } })
      if (state.runtimeService && node) void new ServerRuntimeProvider(state.runtimeService, {
        projectId: state.projectId, sourceId: id,
        sourceName: localizeDataValue(node.data.title, node.data.titleKey, getCurrentLocale()),
      }).discardEmpty().catch(() => undefined)
    },
    clearCachedSubscription: async (id) => {
      const state = get()
      const node = state.nodes.find((item) => item.id === id && item.data.blockType === 'subscription')
      if (!node) return
      const projectId = state.projectId
      const clearGeneration = nextInputGeneration(projectId, id)
      subscriptionRefreshCoordinator.cancel(state.projectId, id)
      const fingerprint = state.subscriptionRuntimes[id]?.sourceConfigFingerprint
        || await sourceConfigFingerprint('url', node.data.subscriptionUrl ?? '', normalizeSubscriptionRequestProfile(node.data.subscriptionRequestProfile))
      let cacheError: SubscriptionRefreshError | undefined
      try {
        await subscriptionRefreshCoordinator.clearPersistedSnapshot(
          { projectId, sourceId: id, sourceConfigFingerprint: fingerprint },
          () => isCurrentInput(projectId, id, clearGeneration),
        )
      } catch {
        cacheError = { code: 'SUBSCRIPTION_CACHE_WRITE_FAILED', message: 'The cached subscription snapshot could not be removed from this browser.', at: new Date().toISOString() }
      }
      set((current) => {
        if (!isCurrentInput(projectId, id, clearGeneration) || current.projectId !== projectId) return current
        return {
          subscriptionSnapshots: withoutKey(current.subscriptionSnapshots, id),
          subscriptionRuntimes: {
            ...current.subscriptionRuntimes,
            [id]: { ...emptySubscriptionRuntime(id, 'url', fingerprint), ...(cacheError ? { cacheError } : {}) },
          },
          nodes: current.nodes.map((item) => item.id === id ? {
            ...item,
            data: { ...item.data, nodeCount: 0, subtitle: translateCurrent('demo.subscription.notParsed'), subtitleKey: undefined, updatedAt: translateCurrent('demo.subscription.notParsed') },
          } : item),
          toast: cacheError ? translateCurrent('issue.generic', { code: cacheError.code }) : translateCurrent('toast.cacheCleared'),
        }
      })
    },
    hydrateSubscriptionCache: async () => {
      const initial = get()
      const projectId = initial.projectId
      const sources = initial.nodes.filter((node) => node.data.blockType === 'subscription' && node.data.subscriptionInputKind === 'url')
      await Promise.all(sources.map(async (node) => {
        const url = node.data.subscriptionUrl ?? ''
        const requestProfile = normalizeSubscriptionRequestProfile(node.data.subscriptionRequestProfile)
        const hydrationGeneration = inputGenerations.get(`${projectId}\u0000${node.id}`) ?? 0
        const fingerprint = await sourceConfigFingerprint('url', url, requestProfile)
        try {
          const snapshot = await subscriptionRuntimeRepository.readActive({ projectId, sourceId: node.id, sourceConfigFingerprint: fingerprint })
          const current = get()
          const currentNode = current.nodes.find((item) => item.id === node.id)
          if (!isCurrentInput(projectId, node.id, hydrationGeneration)
            || current.projectId !== projectId
            || currentNode?.data.subscriptionUrl !== node.data.subscriptionUrl
            || normalizeSubscriptionRequestProfile(currentNode?.data.subscriptionRequestProfile) !== requestProfile) return
          set((state) => ({
            ...(snapshot ? { subscriptionSnapshots: { ...state.subscriptionSnapshots, [node.id]: snapshot } } : {}),
            subscriptionRuntimes: {
              ...state.subscriptionRuntimes,
              [node.id]: snapshot ? {
                ...emptySubscriptionRuntime(node.id, 'url', fingerprint), activeState: snapshot.quality,
                freshness: snapshotFreshness(snapshot.committedAt), activeSnapshot: snapshot, lastSuccessfulAt: snapshot.committedAt,
              } : emptySubscriptionRuntime(node.id, 'url', fingerprint),
            },
            ...(snapshot ? { nodes: state.nodes.map((item) => item.id === node.id ? { ...item, data: { ...item.data, ...snapshotNodeData(snapshot) } } : item) } : {}),
          }))
        } catch {
          const at = new Date().toISOString()
          const cacheError: SubscriptionRefreshError = { code: 'SUBSCRIPTION_CACHE_READ_FAILED', message: 'The cached subscription snapshot could not be read.', at }
          const current = get()
          const currentNode = current.nodes.find((item) => item.id === node.id)
          if (!isCurrentInput(projectId, node.id, hydrationGeneration)
            || current.projectId !== projectId
            || currentNode?.data.subscriptionUrl !== node.data.subscriptionUrl
            || normalizeSubscriptionRequestProfile(currentNode?.data.subscriptionRequestProfile) !== requestProfile) return
          set((state) => ({
            subscriptionRuntimes: {
              ...state.subscriptionRuntimes,
              [node.id]: { ...emptySubscriptionRuntime(node.id, 'url', fingerprint), cacheError },
            },
          }))
        }
      }))
    },
    setRuntimeServiceConfig: (config) => {
      if (config) saveRuntimeServiceConfig(config)
      else clearRuntimeServiceConfig()
      set({ runtimeService: config })
    },
    disconnectRuntimeService: () => {
      clearRuntimeServiceConfig()
      set({ runtimeService: null })
    },
    hydrate: (project) => {
      const previous = get()
      const migration = project ? migrateProject(project) : undefined
      const value = migration?.success && migration.project ? migration.project : demoProject
      const nextNodes = project === undefined ? [] : value.graph.nodes
      const switchedProject = previous.projectId !== value.id
      const nextSources = new Map(nextNodes.filter((node) => node.data.blockType === 'subscription').map((node) => [node.id, node.data.subscriptionUrl ?? '']))
      for (const source of previous.nodes.filter((node) => node.data.blockType === 'subscription')) {
        if (switchedProject) {
          cancelSubscriptionSource(previous.projectId, source.id)
          continue
        }
        const nextUrl = nextSources.get(source.id)
        if (nextUrl === undefined || nextUrl !== (source.data.subscriptionUrl ?? '')) deleteSubscriptionSource(previous.projectId, source.id)
        else {
          nextInputGeneration(previous.projectId, source.id)
          subscriptionRefreshCoordinator.cancel(previous.projectId, source.id)
        }
      }
      if (project === undefined) {
        set({
          projectId: demoProject.id, projectName: demoProject.name,
          primaryTarget: demoProject.primaryTarget ?? null,
          nodes: structuredClone(demoProject.graph.nodes), edges: structuredClone(demoProject.graph.edges),
          historyPast: [], historyFuture: [], hydrated: true, selectedNodeId: null, selectedEdgeId: null,
          recoveryRequired: true,
          recoveryNotice: translateCurrent('recovery.unreadable'),
          subscriptionSnapshots: {},
          subscriptionRuntimes: {},
        })
        trackHydration(demoProject.id, rehydrateEmbeddedSubscriptions(demoProject.graph.nodes, get().parseSubscriptionInput))
        return
      }
      const primaryTarget = resolveProjectPrimaryTarget(value).target
      set({
        projectId: value.id, projectName: value.name, primaryTarget, nodes: structuredClone(value.graph.nodes), edges: structuredClone(value.graph.edges),
        historyPast: [], historyFuture: [], hydrated: true, selectedNodeId: null, selectedEdgeId: null,
        recoveryRequired: migration?.recoveryRequired ?? false,
        recoveryNotice: migration?.message ?? null,
        subscriptionSnapshots: {},
        subscriptionRuntimes: {},
      })
      trackHydration(value.id, rehydrateEmbeddedSubscriptions(value.graph.nodes, get().parseSubscriptionInput))
      void get().hydrateSubscriptionCache()
    },
    resetToDemo: () => {
      const previous = get()
      const nextSources = new Map(demoProject.graph.nodes.filter((node) => node.data.blockType === 'subscription').map((node) => [node.id, node.data.subscriptionUrl ?? '']))
      for (const source of previous.nodes.filter((node) => node.data.blockType === 'subscription')) {
        if (nextSources.get(source.id) !== (source.data.subscriptionUrl ?? '')) deleteSubscriptionSource(previous.projectId, source.id)
        else {
          nextInputGeneration(previous.projectId, source.id)
          subscriptionRefreshCoordinator.cancel(previous.projectId, source.id)
        }
      }
      set({
        projectId: demoProject.id, projectName: demoProject.name,
        primaryTarget: demoProject.primaryTarget ?? null,
        nodes: structuredClone(demoProject.graph.nodes), edges: structuredClone(demoProject.graph.edges),
        historyPast: [], historyFuture: [], selectedNodeId: null, selectedEdgeId: null,
        recoveryRequired: false, recoveryNotice: translateCurrent('recovery.resetDemo'),
        subscriptionSnapshots: {},
        subscriptionRuntimes: {},
      })
      trackHydration(demoProject.id, rehydrateEmbeddedSubscriptions(demoProject.graph.nodes, get().parseSubscriptionInput))
    },
    createNewProject: (primaryTarget = 'mihomo', name) => {
      const previous = get()
      for (const source of previous.nodes.filter((node) => node.data.blockType === 'subscription')) {
        cancelSubscriptionSource(previous.projectId, source.id)
      }
      const value = createBlankProject(primaryTarget)
      const projectName = normalizeValidProjectName(name ?? value.name) ?? value.name
      set({
        projectId: value.id, projectName, primaryTarget,
        nodes: structuredClone(value.graph.nodes), edges: structuredClone(value.graph.edges),
        historyPast: [], historyFuture: [], selectedNodeId: null, selectedEdgeId: null,
        recoveryRequired: false, recoveryNotice: translateCurrent('recovery.createdBlank'),
        subscriptionSnapshots: {},
        subscriptionRuntimes: {},
      })
      hydrationProjectId = value.id
      hydrationBarrier = Promise.resolve()
    },
    renameProject: (name) => {
      const normalized = normalizeValidProjectName(name)
      if (!normalized) return false
      if (normalized !== get().projectName) set({ projectName: normalized, saveStatus: 'saving' })
      return true
    },
    dismissRecoveryNotice: () => set((state) => state.recoveryRequired ? state : { recoveryNotice: null }),
    toProject: () => {
      const state = get()
      const project: ProxyFlowProject = {
        version: PROJECT_SCHEMA_VERSION, id: state.projectId, name: state.projectName,
        ...(state.primaryTarget ? { primaryTarget: state.primaryTarget } : {}),
        graph: { nodes: state.nodes.map(({ selected: _selected, ...node }) => node as GraphNode), edges: state.edges.map(({ selected: _selected, ...edge }) => edge as GraphEdge) },
        services: [...withLegacyChinaCompatibility(demoProject.services, state.nodes)], outputs: demoProject.outputs, updatedAt: new Date().toISOString(),
      }
      return { ...localizeProject(project), name: project.name }
    },
  }
})
