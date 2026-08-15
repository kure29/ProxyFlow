import { CheckCircle2, CircleAlert, Focus, MousePointer2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useMemo } from 'react'
import { useBuilderStore } from '../../store/useBuilderStore'
import { validateGraph } from '../../core/validation/validateProject'

export function StatusBar() {
  const { fitView, getZoom } = useReactFlow()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const issues = useMemo(() => validateGraph(nodes, edges), [nodes, edges])
  const zoom = Math.round(getZoom() * 100)

  return (
    <footer className="statusbar">
      <button className={issues.length ? 'status-issues' : 'status-ok'} title={issues.map((issue) => issue.message).join('\n')}>
        {issues.length ? <CircleAlert size={13} /> : <CheckCircle2 size={13} />}
        {issues.length ? `${issues.length} 个配置问题` : '配置检查正常'}
      </button>
      <span className="status-separator" />
      <span>{nodes.length} Nodes</span><span>{edges.length} Connections</span>
      <span className="status-spacer" />
      <span className="status-hint"><MousePointer2 size={12} /> 拖拽选择 · 滚轮缩放</span>
      <span className="status-separator" />
      <span className="zoom-value">{zoom}%</span>
      <button className="status-fit" onClick={() => fitView({ padding: 0.15, duration: 400 })}><Focus size={13} /> Fit</button>
    </footer>
  )
}
