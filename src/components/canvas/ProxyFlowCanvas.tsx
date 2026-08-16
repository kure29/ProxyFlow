import { useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, type Connection, type NodeMouseHandler,
  useReactFlow,
} from '@xyflow/react'
import { Copy, Focus, Plus, Power, Trash2 } from 'lucide-react'
import { BlockNode } from '../nodes/BlockNode'
import { useBuilderStore } from '../../store/useBuilderStore'
import { getHighlightedPath } from '../../core/graph/pathHighlight'
import { isConnectionAllowed } from '../../core/graph/graphRules'
import { validateGraph } from '../../core/validation/validateProject'
import type { BlockType, GraphEdge, GraphNode } from '../../types/project'
import { deriveProjectRuntime } from '../../core/proxySet'

const nodeTypes = { block: BlockNode }
const categoryColors: Record<string, string> = {
  source: '#8b7cc8', processing: '#57a47b', strategy: '#4e87c8', chain: '#c86e94',
  routing: '#d48654', dns: '#3aa0a2', output: '#7257b7',
}
const semanticColors: Record<string, string> = {
  data: '#9aa5b4', route: '#d48654', strategy: '#7b78bd', chain: '#c86e94', output: '#7563b5', dns: '#3aa0a2',
}

interface ContextMenuState { x: number; y: number; nodeId?: string }

export function ProxyFlowCanvas() {
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId)
  const hydrated = useBuilderStore((state) => state.hydrated)
  const onNodesChange = useBuilderStore((state) => state.onNodesChange)
  const onEdgesChange = useBuilderStore((state) => state.onEdgesChange)
  const connect = useBuilderStore((state) => state.connect)
  const addNode = useBuilderStore((state) => state.addNode)
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

  useEffect(() => {
    if (!hydrated) return
    const timer = window.setTimeout(() => fitView({ padding: 0.14, duration: 0, maxZoom: 0.82 }), 80)
    return () => window.clearTimeout(timer)
  }, [fitView, hydrated])

  const issues = useMemo(() => validateGraph(nodes, edges), [nodes, edges])
  const path = useMemo(() => getHighlightedPath(selectedNodeId, nodes, edges), [selectedNodeId, nodes, edges])
  const hasPath = selectedNodeId !== null && path.nodeIds.size > 0
  const pipelineRuntime = useMemo(() => deriveProjectRuntime(toProject(), subscriptionSnapshots), [edges, nodes, subscriptionSnapshots, toProject])

  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      warning: issues.find((issue) => issue.nodeId === node.id)?.message,
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
  })), [nodes, issues, hasPath, path.nodeIds, pipelineRuntime])

  const displayEdges = useMemo(() => edges.map((edge) => {
    const highlighted = hasPath && path.edgeIds.has(edge.id)
    const dimmed = hasPath && !highlighted
    const color = semanticColors[String(edge.data?.semantic ?? 'data')]
    return {
      ...edge,
      animated: highlighted,
      style: { stroke: color, strokeWidth: highlighted ? 2.4 : 1.45, opacity: dimmed ? 0.12 : highlighted ? 1 : 0.64 },
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
  const onNodeClick: NodeMouseHandler<GraphNode> = (_event, node) => { setMenu(null); selectNode(node.id) }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/proxyflow') as BlockType
    if (!type) return
    addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const onPaneContextMenu = (event: globalThis.MouseEvent | ReactMouseEvent) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  const selectedMenuNode = menu?.nodeId ? nodes.find((node) => node.id === menu.nodeId) : null

  return (
    <main className="canvas-shell" onContextMenu={(event) => event.preventDefault()}>
      <div className="canvas-breadcrumb"><span>Blueprint</span><b>/</b><strong>主配置流</strong><i>LIVE</i></div>
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
        selectionOnDrag
        panOnScroll
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={['Meta', 'Control']}
        deleteKeyCode={null}
        elevateEdgesOnSelect
        connectionLineStyle={{ stroke: '#7563b5', strokeWidth: 2 }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.15} color="#cbd1dc" />
        <MiniMap
          className="proxy-minimap"
          position="bottom-left"
          nodeColor={(node) => categoryColors[String(node.data?.category ?? 'source')]}
          nodeStrokeWidth={2}
          maskColor="rgba(245, 247, 250, 0.72)"
          pannable
          zoomable
        />
        <Controls className="proxy-controls" position="bottom-right" showInteractive={false} />
      </ReactFlow>

      {menu && <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
        {selectedMenuNode ? <>
          <button onClick={() => { duplicateNode(selectedMenuNode.id); setMenu(null) }}><Copy size={14} /> 复制节点 <kbd>⌘D</kbd></button>
          <button onClick={() => { updateNodeData(selectedMenuNode.id, { disabled: !selectedMenuNode.data.disabled }); setMenu(null) }}><Power size={14} /> {selectedMenuNode.data.disabled ? '启用节点' : '禁用节点'}</button>
          <span />
          <button className="danger" disabled={selectedMenuNode.data.protected} onClick={() => { removeNode(selectedMenuNode.id); setMenu(null) }}><Trash2 size={14} /> 删除节点</button>
        </> : <>
          <button onClick={() => { addNode('subscription', screenToFlowPosition({ x: menu.x, y: menu.y })); setMenu(null) }}><Plus size={14} /> 添加订阅源</button>
          <button onClick={() => { addNode('routing-group', screenToFlowPosition({ x: menu.x, y: menu.y })); setMenu(null) }}><Plus size={14} /> 添加分流规则</button>
          <span />
          <button onClick={() => { fitView({ padding: 0.15, duration: 400 }); setMenu(null) }}><Focus size={14} /> 适应画布 <kbd>F</kbd></button>
        </>}
      </div>}
    </main>
  )
}
