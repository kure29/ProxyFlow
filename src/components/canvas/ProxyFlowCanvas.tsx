import { useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Background, BackgroundVariant, MarkerType, MiniMap, ReactFlow, type Connection, type NodeMouseHandler,
  useReactFlow,
} from '@xyflow/react'
import { Copy, Focus, Plus, Power, Trash2 } from 'lucide-react'
import { BlockNode } from '../nodes/BlockNode'
import { useBuilderStore } from '../../store/useBuilderStore'
import { getHighlightedPath } from '../../core/graph/pathHighlight'
import { isConnectionAllowed } from '../../core/graph/graphRules'
import { validateGraph } from '../../core/validation/validateProject'
import { compileGraph } from '../../core/graphCompiler'
import type { BlockType, GraphEdge, GraphNode } from '../../types/project'
import { deriveProjectRuntime } from '../../core/proxySet'
import { localizeDiagnosticMessage, localizeNodeData, localizeSubscriptionSnapshots, useI18n } from '../../i18n'

const nodeTypes = { block: BlockNode }
const neutralFlowColor = 'var(--color-text-muted)'
const semanticColors: Record<string, string> = {
  data: neutralFlowColor,
  route: neutralFlowColor,
  strategy: neutralFlowColor,
  chain: neutralFlowColor,
  output: neutralFlowColor,
  dns: neutralFlowColor,
}

interface ContextMenuState { x: number; y: number; nodeId?: string }

export function ProxyFlowCanvas() {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId)
  const hydrated = useBuilderStore((state) => state.hydrated)
  const onNodesChange = useBuilderStore((state) => state.onNodesChange)
  const onEdgesChange = useBuilderStore((state) => state.onEdgesChange)
  const connect = useBuilderStore((state) => state.connect)
  const addLibraryNode = useBuilderStore((state) => state.addLibraryNode)
  const duplicateNode = useBuilderStore((state) => state.duplicateNode)
  const removeNode = useBuilderStore((state) => state.removeNode)
  const updateNodeData = useBuilderStore((state) => state.updateNodeData)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const selectEdge = useBuilderStore((state) => state.selectEdge)
  const beginTransaction = useBuilderStore((state) => state.beginTransaction)
  const commitTransaction = useBuilderStore((state) => state.commitTransaction)
  const toProject = useBuilderStore((state) => state.toProject)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const ariaLabelConfig = useMemo(() => ({
    'node.a11yDescription.default': t('canvas.a11y.node'),
    'node.a11yDescription.keyboardDisabled': t('canvas.a11y.nodeKeyboard'),
    'node.a11yDescription.ariaLiveMessage': ({ x, y }: { direction: string; x: number; y: number }) => t('canvas.a11y.nodeMoved', { x, y }),
    'edge.a11yDescription.default': t('canvas.a11y.edge'),
    'controls.ariaLabel': t('canvas.a11y.controls'),
    'controls.zoomIn.ariaLabel': t('canvas.a11y.zoomIn'),
    'controls.zoomOut.ariaLabel': t('canvas.a11y.zoomOut'),
    'controls.fitView.ariaLabel': t('canvas.a11y.fitView'),
    'controls.interactive.ariaLabel': t('canvas.a11y.toggleInteractivity'),
    'minimap.ariaLabel': t('canvas.a11y.minimap'),
    'handle.ariaLabel': t('canvas.a11y.handle'),
  }), [t])

  useEffect(() => {
    if (!hydrated) return
    const timer = window.setTimeout(() => fitView({ padding: 0.14, duration: 0, maxZoom: 0.82 }), 80)
    return () => window.clearTimeout(timer)
  }, [fitView, hydrated])

  const graphIssues = useMemo(() => compileGraph(toProject(), {
    subscriptionSnapshots: localizeSubscriptionSnapshots(subscriptionSnapshots, locale),
    retainDraftOnErrorForDiagnostics: true,
    validationTarget: primaryTarget,
  }).issues.filter((issue) => issue.code === 'TARGET_NATIVE_STRATEGY_UNSUPPORTED'), [edges, locale, nodes, primaryTarget, projectId, projectName, subscriptionSnapshots, toProject])
  const issues = useMemo(() => [
    ...validateGraph(nodes, edges),
    ...graphIssues.map((issue) => ({
      id: `${issue.code}-${issue.nodeId ?? issue.entity?.id ?? 'project'}`,
      code: issue.code,
      nodeId: issue.nodeId,
      severity: issue.severity,
      message: issue.message,
    })),
  ], [edges, graphIssues, nodes])
  const path = useMemo(() => getHighlightedPath(selectedNodeId, nodes, edges), [selectedNodeId, nodes, edges])
  const hasPath = selectedNodeId !== null && path.nodeIds.size > 0
  const pipelineRuntime = useMemo(() => deriveProjectRuntime(toProject(), localizeSubscriptionSnapshots(subscriptionSnapshots, locale)), [edges, locale, nodes, subscriptionSnapshots, toProject])

  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      ...localizeNodeData(node.data, locale),
      warning: (() => {
        const issue = issues.find((item) => item.nodeId === node.id)
        return issue ? localizeDiagnosticMessage(issue.code, issue.message, locale) : undefined
      })(),
      highlighted: hasPath && path.nodeIds.has(node.id),
      dimmed: hasPath && !path.nodeIds.has(node.id),
      ...(pipelineRuntime.has(node.id) ? {
        runtimeStatus: pipelineRuntime.get(node.id)!.status,
        runtimeInputCount: pipelineRuntime.get(node.id)!.inputCount,
        runtimeOutputCount: pipelineRuntime.get(node.id)!.outputCount,
        runtimeRemovedCount: pipelineRuntime.get(node.id)!.removedCount,
        runtimeProtocolCount: pipelineRuntime.get(node.id)!.protocolCount,
        runtimeIssueCount: pipelineRuntime.get(node.id)!.issues.length,
      } : {}),
    },
  })), [nodes, issues, hasPath, locale, path.nodeIds, pipelineRuntime])

  const displayEdges = useMemo(() => edges.map((edge) => {
    const highlighted = hasPath && path.edgeIds.has(edge.id)
    const dimmed = hasPath && !highlighted
    const color = semanticColors[String(edge.data?.semantic ?? 'data')]
    return {
      ...edge,
      animated: highlighted,
      style: { stroke: color, strokeWidth: highlighted ? 2.4 : 1.45, opacity: dimmed ? 0.38 : highlighted ? 1 : 0.68 },
      markerEnd: edge.markerEnd ? { type: MarkerType.ArrowClosed, width: 14, height: 14, color } : undefined,
      zIndex: highlighted ? 4 : 0,
    }
  }), [edges, hasPath, path.edgeIds])

  const isValidConnection = (candidate: Connection | GraphEdge) => isConnectionAllowed({
    source: candidate.source,
    target: candidate.target,
    sourceHandle: candidate.sourceHandle ?? null,
    targetHandle: candidate.targetHandle ?? null,
  }, nodes)
  const onNodeClick: NodeMouseHandler<GraphNode> = (event, node) => {
    setMenu(null)
    selectNode(node.id, null, event.metaKey || event.ctrlKey)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/proxyflow') as BlockType
    if (!type) return
    let data: Record<string, unknown> | undefined
    const serialized = event.dataTransfer.getData('application/proxyflow-data')
    if (serialized) {
      try {
        const parsed: unknown = JSON.parse(serialized)
        if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
      } catch { /* Ignore malformed drag metadata; the typed preset remains safe. */ }
    }
    addLibraryNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }), data)
  }

  const onPaneContextMenu = (event: globalThis.MouseEvent | ReactMouseEvent) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  const selectedMenuNode = menu?.nodeId ? nodes.find((node) => node.id === menu.nodeId) : null

  return (
    <main className="canvas-shell" onContextMenu={(event) => event.preventDefault()}>
      <div className="canvas-breadcrumb"><span>{t('canvas.blueprint')}</span><b>/</b><strong>{t('canvas.mainFlow')}</strong><i>{t('canvas.live')}</i></div>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(connection) => connect(connection)}
        isValidConnection={isValidConnection}
        onNodeClick={onNodeClick}
        onEdgeClick={(_event, edge) => { setMenu(null); selectEdge(edge.id) }}
        onPaneClick={() => { setMenu(null); selectNode(null) }}
        onNodeDragStart={beginTransaction}
        onNodeDragStop={commitTransaction}
        onNodeContextMenu={(event, node) => { event.preventDefault(); selectNode(node.id); setMenu({ x: event.clientX, y: event.clientY, nodeId: node.id }) }}
        onPaneContextMenu={onPaneContextMenu}
        onDrop={onDrop}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
        fitView
        fitViewOptions={{ padding: 0.16, minZoom: 0.46, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={1.8}
        snapToGrid
        snapGrid={[12, 12]}
        selectionOnDrag={false}
        panOnScroll={false}
        panOnDrag={[0, 1]}
        multiSelectionKeyCode={['Meta', 'Control']}
        deleteKeyCode={null}
        elevateEdgesOnSelect
        connectionLineStyle={{ stroke: 'var(--color-primary)', strokeWidth: 2 }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
        ariaLabelConfig={ariaLabelConfig}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.15} color="var(--color-border-strong)" />
        <MiniMap
          className="proxy-minimap"
          position="bottom-left"
          nodeColor={() => neutralFlowColor}
          nodeStrokeWidth={2}
          maskColor="var(--color-canvas-mask)"
          pannable
          zoomable
        />
      </ReactFlow>

      {menu && <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
        {selectedMenuNode ? <>
          <button onClick={() => { duplicateNode(selectedMenuNode.id); setMenu(null) }}><Copy size={14} /> {t('canvas.copyNode')} <kbd>⌘D</kbd></button>
          <button onClick={() => { updateNodeData(selectedMenuNode.id, { disabled: !selectedMenuNode.data.disabled }); setMenu(null) }}><Power size={14} /> {selectedMenuNode.data.disabled ? t('canvas.enableNode') : t('canvas.disableNode')}</button>
          <span />
          <button className="danger" disabled={selectedMenuNode.data.protected} onClick={() => { removeNode(selectedMenuNode.id); setMenu(null) }}><Trash2 size={14} /> {t('canvas.deleteNode')}</button>
        </> : <>
          <button onClick={() => { addLibraryNode('subscription', screenToFlowPosition({ x: menu.x, y: menu.y })); setMenu(null) }}><Plus size={14} /> {t('canvas.addSubscription')}</button>
          <button onClick={() => { addLibraryNode('service-rule', screenToFlowPosition({ x: menu.x, y: menu.y })); setMenu(null) }}><Plus size={14} /> {t('canvas.addRouting')}</button>
          <span />
          <button onClick={() => { fitView({ padding: 0.15, duration: 400 }); setMenu(null) }}><Focus size={14} /> {t('canvas.fitCanvas')} <kbd>F</kbd></button>
        </>}
      </div>}
    </main>
  )
}
