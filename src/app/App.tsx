import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Route } from 'lucide-react'
import proxyFlowMark from '../assets/proxyflow-mark.svg'
import { TopBar } from '../components/layout/TopBar'
import { StatusBar } from '../components/layout/StatusBar'
import { useBuilderStore } from '../store/useBuilderStore'
import { projectStorage, type ProjectListItem } from '../storage/projectStorage'
import { localizeKnownSystemText, useI18n } from '../i18n'
import { SubscriptionEmptyConfirmation } from '../components/subscription/SubscriptionEmptyConfirmation'
import { WorkspaceShell } from '../components/workspace/WorkspaceShell'
import { NewProjectDialog } from '../components/workspace/NewProjectDialog'
import type { ProductView } from '../components/workspace/types'
import type { WorkspaceSectionId } from '../core/workspace'

const VisualFlowWorkspace = lazy(() => import('../components/workspace/VisualFlowWorkspace'))
const PreviewModal = lazy(() => import('../components/preview/PreviewModal').then(({ PreviewModal: Component }) => ({ default: Component })))

export function App() {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
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
  const previewOpen = useBuilderStore((state) => state.previewOpen)
  const toProject = useBuilderStore((state) => state.toProject)
  const resetToDemo = useBuilderStore((state) => state.resetToDemo)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const dismissRecoveryNotice = useBuilderStore((state) => state.dismissRecoveryNotice)
  const loadStarted = useRef(false)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const [view, setView] = useState<ProductView>('workspace')
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSectionId>('sources')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const projectSaveKey = useMemo(() => JSON.stringify({
    projectId,
    projectName,
    primaryTarget,
    nodes: nodes.map(({ selected: _selected, ...node }) => node),
    edges: edges.map(({ selected: _selected, ...edge }) => edge),
  }), [edges, nodes, primaryTarget, projectId, projectName])
  const refreshProjectList = useCallback(async () => {
    setProjects(await projectStorage.list())
  }, [])
  const persistProject = useCallback((project = toProject()) => {
    const save = saveQueue.current
      .catch(() => undefined)
      .then(() => projectStorage.save(project, {
        activate: useBuilderStore.getState().projectId === project.id,
      }))
      .then(refreshProjectList)
    saveQueue.current = save
    return save
  }, [refreshProjectList, toProject])

  useEffect(() => {
    if (loadStarted.current) return
    loadStarted.current = true
    void projectStorage.load()
      .then((project) => {
        hydrate(project)
        void refreshProjectList().catch(() => setProjects([]))
      })
      .catch(() => { hydrate(undefined); setProjects([]) })
  }, [hydrate, refreshProjectList])

  useEffect(() => {
    if (!hydrated || recoveryRequired) return
    setSaveStatus('saving')
    const timer = window.setTimeout(async () => {
      const savedProjectId = projectId
      await persistProject(toProject())
      if (useBuilderStore.getState().projectId === savedProjectId) setSaveStatus('saved')
    }, 500)
    return () => window.clearTimeout(timer)
  }, [hydrated, persistProject, projectId, projectSaveKey, recoveryRequired, setSaveStatus, toProject])

  useEffect(() => {
    if (!hydrated || recoveryRequired) return
    const flush = () => { void projectStorage.save(useBuilderStore.getState().toProject(), { activate: true }).catch(() => undefined) }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [hydrated, recoveryRequired])

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
        void persistProject(toProject()).then(() => { setSaveStatus('saved'); setToast(t('app.savedToast')) })
      } else if (!isEditing && command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
      } else if (!isEditing && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelected, persistProject, redo, setSaveStatus, setToast, t, toProject, undo])

  const switchProject = async (nextProjectId: string) => {
    if (nextProjectId === projectId) return
    await persistProject(toProject())
    const project = await projectStorage.activate(nextProjectId)
    if (!project) return
    hydrate(project)
    await refreshProjectList()
  }

  const persistCurrentProject = async () => {
    const project = useBuilderStore.getState().toProject()
    await persistProject(project)
    if (useBuilderStore.getState().projectId === project.id) setSaveStatus('saved')
  }

  return <div className="app-shell">
    <a href={view === 'workspace' ? '#workspace-main' : '#canvas'} className="skip-link">{view === 'workspace' ? t('app.skipToWorkspace') : t('app.skipToCanvas')}</a>
    <TopBar
      view={view}
      projects={projects}
      onViewChange={setView}
      onProjectChange={switchProject}
      onProjectNameCommit={persistCurrentProject}
      onNewProject={() => setNewProjectOpen(true)}
    />
    {view === 'workspace'
      ? <WorkspaceShell activeSection={workspaceSection} onSectionChange={setWorkspaceSection} onViewChange={setView} />
      : <Suspense fallback={<div className="visual-flow-loading" role="status"><Route size={22} /><span>{t('app.loading')}</span></div>}><VisualFlowWorkspace /></Suspense>}
    <StatusBar view={view} />
    {previewOpen && <Suspense fallback={null}><PreviewModal /></Suspense>}
    <SubscriptionEmptyConfirmation />
    {recoveryNotice && <section className={`recovery-banner${recoveryRequired ? ' is-required' : ''}`} role={recoveryRequired ? 'alertdialog' : 'status'} aria-label={t('app.recoveryLabel')}>
      <div><strong>{recoveryRequired ? t('app.recoveryRequiredTitle') : t('app.recoveryMigratedTitle')}</strong><span>{localizeKnownSystemText(recoveryNotice, locale)}</span></div>
      <div><button className="secondary-action" onClick={() => setNewProjectOpen(true)}>{t('app.newProject')}</button><button className="primary-action" onClick={resetToDemo}>{t('app.resetDemo')}</button>{!recoveryRequired && <button className="recovery-close" onClick={dismissRecoveryNotice} aria-label={t('app.dismissRecovery')}>×</button>}</div>
    </section>}
    {!hydrated && <div className="loading-screen"><img className="brand-mark" src={proxyFlowMark} alt="" aria-hidden="true" /><strong>ProxyFlow</strong><small>{t('app.loading')}</small></div>}
    {toast && <div className="toast" role="status"><span><CheckIcon /></span>{toast}</div>}
    <NewProjectDialog
      open={newProjectOpen || Boolean(hydrated && primaryTarget === null && view === 'workspace')}
      required={!newProjectOpen && Boolean(hydrated && primaryTarget === null && view === 'workspace')}
      onClose={() => setNewProjectOpen(false)}
      beforeCreate={persistCurrentProject}
      onComplete={() => { setNewProjectOpen(false); setView('workspace'); setWorkspaceSection('sources') }}
    />
  </div>
}

function CheckIcon() {
  return <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m3.5 8.2 2.7 2.7 6.3-6.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
