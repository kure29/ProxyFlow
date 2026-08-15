import { useEffect, useState } from 'react'
import { Check, ChevronDown, Download, Eye, LayoutTemplate, Redo2, Route, Undo2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useBuilderStore } from '../../store/useBuilderStore'

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className="icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>
}

export function TopBar() {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const { fitView } = useReactFlow()
  const projectName = useBuilderStore((state) => state.projectName)
  const saveStatus = useBuilderStore((state) => state.saveStatus)
  const undo = useBuilderStore((state) => state.undo)
  const redo = useBuilderStore((state) => state.redo)
  const autoLayout = useBuilderStore((state) => state.autoLayout)
  const canUndo = useBuilderStore((state) => state.historyPast.length > 0)
  const canRedo = useBuilderStore((state) => state.historyFuture.length > 0)
  const setPreviewOpen = useBuilderStore((state) => state.setPreviewOpen)
  const createNewProject = useBuilderStore((state) => state.createNewProject)

  useEffect(() => {
    if (!projectMenuOpen) return
    const close = () => setProjectMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [projectMenuOpen])

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Route size={19} /></span>
        <strong>ProxyFlow</strong>
        <span className="version-pill">V0.4</span>
      </div>
      <div className="topbar-divider" />
      <div className="project-switcher-wrap">
        <button className="project-switcher" onClick={(event) => { event.stopPropagation(); setProjectMenuOpen((open) => !open) }}>
          <span><small>当前项目</small><strong>{projectName}</strong></span><ChevronDown size={14} />
        </button>
        {projectMenuOpen && <div className="project-menu"><span>最近项目</span><button><Check size={13} /> {projectName}</button><button onClick={() => { createNewProject(); setProjectMenuOpen(false) }}>新建项目 <small>V0.4</small></button></div>}
      </div>

      <div className="save-indicator" aria-live="polite">
        <span className={saveStatus === 'saving' ? 'saving-dot' : 'saved-dot'} />
        {saveStatus === 'saving' ? '保存中…' : '已保存到本地'}
      </div>

      <nav className="top-actions" aria-label="画布操作">
        <div className="top-action-group">
          <IconButton label="撤销 (⌘Z)" disabled={!canUndo} onClick={undo}><Undo2 size={16} /></IconButton>
          <IconButton label="重做 (⌘⇧Z)" disabled={!canRedo} onClick={redo}><Redo2 size={16} /></IconButton>
          <IconButton label="自动布局" onClick={() => { autoLayout(); window.setTimeout(() => fitView({ padding: 0.15, duration: 450 }), 40) }}><LayoutTemplate size={16} /></IconButton>
        </div>
        <button className="secondary-action" onClick={() => setPreviewOpen(true)}><Eye size={16} /> 预览</button>
        <button className="primary-action" onClick={() => setPreviewOpen(true)}><Download size={16} /> 导出配置</button>
      </nav>
    </header>
  )
}
