import { useEffect, useMemo, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { MonitorUp, Route } from 'lucide-react'
import { TopBar } from '../components/layout/TopBar'
import { BlockLibrary } from '../components/layout/BlockLibrary'
import { StatusBar } from '../components/layout/StatusBar'
import { Inspector } from '../components/inspector/Inspector'
import { ProxyFlowCanvas } from '../components/canvas/ProxyFlowCanvas'
import { PreviewModal } from '../components/preview/PreviewModal'
import { useBuilderStore } from '../store/useBuilderStore'
import { projectStorage } from '../storage/projectStorage'

export function App() {
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const hydrated = useBuilderStore((state) => state.hydrated)
  const recoveryRequired = useBuilderStore((state) => state.recoveryRequired)
  const recoveryNotice = useBuilderStore((state) => state.recoveryNotice)
  const hydrate = useBuilderStore((state) => state.hydrate)
  const undo = useBuilderStore((state) => state.undo)
  const redo = useBuilderStore((state) => state.redo)
  const deleteSelected = useBuilderStore((state) => state.deleteSelected)
  const setSaveStatus = useBuilderStore((state) => state.setSaveStatus)
  const setToast = useBuilderStore((state) => state.setToast)
  const toast = useBuilderStore((state) => state.toast)
  const toProject = useBuilderStore((state) => state.toProject)
  const resetToDemo = useBuilderStore((state) => state.resetToDemo)
  const createNewProject = useBuilderStore((state) => state.createNewProject)
  const dismissRecoveryNotice = useBuilderStore((state) => state.dismissRecoveryNotice)
  const loadStarted = useRef(false)
  const { fitView } = useReactFlow()
  const graphSaveKey = useMemo(() => JSON.stringify({
    nodes: nodes.map(({ selected: _selected, ...node }) => node),
    edges: edges.map(({ selected: _selected, ...edge }) => edge),
  }), [nodes, edges])

  useEffect(() => {
    if (loadStarted.current) return
    loadStarted.current = true
    projectStorage.load().then(hydrate).catch(() => hydrate(undefined))
  }, [hydrate])

  useEffect(() => {
    if (!hydrated || recoveryRequired) return
    setSaveStatus('saving')
    const timer = window.setTimeout(async () => {
      await projectStorage.save(toProject())
      setSaveStatus('saved')
    }, 500)
    return () => window.clearTimeout(timer)
  }, [graphSaveKey, hydrated, recoveryRequired, setSaveStatus, toProject])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast, setToast])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement
      const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === 's') {
        event.preventDefault()
        projectStorage.save(toProject()).then(() => { setSaveStatus('saved'); setToast('项目已保存到本地') })
      } else if (!isEditing && command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
      } else if (!isEditing && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        deleteSelected()
      } else if (!isEditing && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        fitView({ padding: 0.15, duration: 400 })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelected, fitView, redo, setSaveStatus, setToast, toProject, undo])

  return <div className="app-shell">
    <a href="#canvas" className="skip-link">跳到画布</a>
    <TopBar />
    <div className="workspace">
      <BlockLibrary />
      <div id="canvas" className="canvas-region"><ProxyFlowCanvas /></div>
      <Inspector />
    </div>
    <StatusBar />
    <PreviewModal />
    {recoveryNotice && <section className={`recovery-banner${recoveryRequired ? ' is-required' : ''}`} role={recoveryRequired ? 'alertdialog' : 'status'} aria-label="项目恢复">
      <div><strong>{recoveryRequired ? '需要恢复旧项目' : '项目已迁移'}</strong><span>{recoveryNotice}</span></div>
      <div><button className="secondary-action" onClick={createNewProject}>新建 Project</button><button className="primary-action" onClick={resetToDemo}>重置为 Demo</button>{!recoveryRequired && <button className="recovery-close" onClick={dismissRecoveryNotice} aria-label="关闭恢复提示">×</button>}</div>
    </section>}
    {!hydrated && <div className="loading-screen"><span className="brand-mark"><Route size={22} /></span><strong>ProxyFlow</strong><small>正在加载 Blueprint…</small></div>}
    {toast && <div className="toast" role="status"><span><CheckIcon /></span>{toast}</div>}
    <div className="small-screen-blocker"><MonitorUp size={28} /><h2>请使用桌面设备编辑</h2><p>ProxyFlow 的可视化画布需要至少 1100px 的可用宽度。</p></div>
  </div>
}

function CheckIcon() {
  return <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m3.5 8.2 2.7 2.7 6.3-6.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
