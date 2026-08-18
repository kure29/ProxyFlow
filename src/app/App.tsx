import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { Route } from 'lucide-react'
import { TopBar } from '../components/layout/TopBar'
import { BlockLibrary } from '../components/layout/BlockLibrary'
import { StatusBar } from '../components/layout/StatusBar'
import { Inspector } from '../components/inspector/Inspector'
import { ProxyFlowCanvas } from '../components/canvas/ProxyFlowCanvas'
import { PreviewModal } from '../components/preview/PreviewModal'
import { ResizableWorkspace } from '../components/layout/ResizableWorkspace'
import { useBuilderStore } from '../store/useBuilderStore'
import { projectStorage } from '../storage/projectStorage'
import { localizeKnownSystemText, useI18n } from '../i18n'
import { SubscriptionEmptyConfirmation } from '../components/subscription/SubscriptionEmptyConfirmation'
import { WorkspaceShell } from '../components/workspace/WorkspaceShell'
import { NewProjectDialog } from '../components/workspace/NewProjectDialog'
import type { ProductView } from '../components/workspace/types'
import type { WorkspaceSectionId } from '../core/workspace'

export function App() {
  const { locale, t } = useI18n()
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
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const dismissRecoveryNotice = useBuilderStore((state) => state.dismissRecoveryNotice)
  const loadStarted = useRef(false)
  const [view, setView] = useState<ProductView>('workspace')
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSectionId>('sources')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const { fitView } = useReactFlow()
  const graphSaveKey = useMemo(() => JSON.stringify({
    primaryTarget,
    nodes: nodes.map(({ selected: _selected, ...node }) => node),
    edges: edges.map(({ selected: _selected, ...edge }) => edge),
  }), [nodes, edges, primaryTarget])

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
        projectStorage.save(toProject()).then(() => { setSaveStatus('saved'); setToast(t('app.savedToast')) })
      } else if (!isEditing && command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
      } else if (!isEditing && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        deleteSelected()
      } else if (!isEditing && view === 'visual-flow' && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        fitView({ padding: 0.15, duration: 400 })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelected, fitView, redo, setSaveStatus, setToast, t, toProject, undo, view])

  return <div className="app-shell">
    <a href={view === 'workspace' ? '#workspace-main' : '#canvas'} className="skip-link">{view === 'workspace' ? t('app.skipToWorkspace') : t('app.skipToCanvas')}</a>
    <TopBar view={view} onViewChange={setView} onNewProject={() => setNewProjectOpen(true)} />
    {view === 'workspace'
      ? <WorkspaceShell activeSection={workspaceSection} onSectionChange={setWorkspaceSection} onViewChange={setView} />
      : <ResizableWorkspace
          library={<BlockLibrary />}
          canvas={<div id="canvas" className="canvas-region"><ProxyFlowCanvas /></div>}
          inspector={<Inspector />}
        />}
    <StatusBar view={view} />
    <PreviewModal />
    <SubscriptionEmptyConfirmation />
    {recoveryNotice && <section className={`recovery-banner${recoveryRequired ? ' is-required' : ''}`} role={recoveryRequired ? 'alertdialog' : 'status'} aria-label={t('app.recoveryLabel')}>
      <div><strong>{recoveryRequired ? t('app.recoveryRequiredTitle') : t('app.recoveryMigratedTitle')}</strong><span>{localizeKnownSystemText(recoveryNotice, locale)}</span></div>
      <div><button className="secondary-action" onClick={() => setNewProjectOpen(true)}>{t('app.newProject')}</button><button className="primary-action" onClick={resetToDemo}>{t('app.resetDemo')}</button>{!recoveryRequired && <button className="recovery-close" onClick={dismissRecoveryNotice} aria-label={t('app.dismissRecovery')}>×</button>}</div>
    </section>}
    {!hydrated && <div className="loading-screen"><span className="brand-mark"><Route size={22} /></span><strong>ProxyFlow</strong><small>{t('app.loading')}</small></div>}
    {toast && <div className="toast" role="status"><span><CheckIcon /></span>{toast}</div>}
    <NewProjectDialog
      open={newProjectOpen || Boolean(hydrated && primaryTarget === null && view === 'workspace')}
      required={!newProjectOpen && Boolean(hydrated && primaryTarget === null && view === 'workspace')}
      onClose={() => setNewProjectOpen(false)}
      onComplete={() => { setNewProjectOpen(false); setView('workspace'); setWorkspaceSection('sources') }}
    />
  </div>
}

function CheckIcon() {
  return <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m3.5 8.2 2.7 2.7 6.3-6.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
