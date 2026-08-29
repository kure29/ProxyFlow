import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Check, Route, X } from 'lucide-react'
import proxyFlowLogo from '../assets/brand/proxyflow-logo.png'
import { TopBar } from '../components/layout/TopBar'
import { StatusBar } from '../components/layout/StatusBar'
import { useBuilderStore } from '../store/useBuilderStore'
import { projectStorage, type ProjectListItem } from '../storage/projectStorage'
import { localizeKnownSystemText, useI18n } from '../i18n'
import { SubscriptionEmptyConfirmation } from '../components/subscription/SubscriptionEmptyConfirmation'
import { WorkspaceShell } from '../components/workspace/WorkspaceShell'
import { NewProjectDialog } from '../components/workspace/NewProjectDialog'
import type { WorkspaceSectionId } from '../core/workspace'
import { summarizePrimaryTargetHealth, useProjectCompiles } from '../components/compiler/useProjectCompiles'
import {
  initialProductNavigationState, productNavigationReducer,
} from '../components/workspace/productNavigationModel'
import { deleteStoredProject } from '../components/workspace/projectManagement'
import { normalizeValidProjectName } from '../core/project/projectName'

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
  const targetSettings = useBuilderStore((state) => state.targetSettings)
  const dismissRecoveryNotice = useBuilderStore((state) => state.dismissRecoveryNotice)
  const primaryCompiles = useProjectCompiles(Boolean(primaryTarget))
  const primaryHealth = summarizePrimaryTargetHealth(primaryCompiles, primaryTarget)
  const loadStarted = useRef(false)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const storagePausedRef = useRef(false)
  const [navigationState, dispatchNavigation] = useReducer(productNavigationReducer, initialProductNavigationState)
  const { view, workspaceSection, lastNodeSection } = navigationState
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [projectCreationRequired, setProjectCreationRequired] = useState(false)
  const [storagePaused, setStoragePaused] = useState(false)
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const projectSaveKey = useMemo(() => JSON.stringify({
    projectId,
    projectName,
    primaryTarget,
    targetSettings,
    nodes: nodes.map(({ selected: _selected, ...node }) => node),
    edges: edges.map(({ selected: _selected, ...edge }) => edge),
  }), [edges, nodes, primaryTarget, projectId, projectName, targetSettings])
  const refreshProjectList = useCallback(async () => {
    setProjects(await projectStorage.list())
  }, [])
  const persistProject = useCallback((project = toProject()) => {
    if (storagePausedRef.current) return Promise.resolve()
    const save = saveQueue.current
      .catch(() => undefined)
      .then(() => projectStorage.save(project, {
        activate: useBuilderStore.getState().projectId === project.id,
      }))
      .then(refreshProjectList)
    saveQueue.current = save
    return save
  }, [refreshProjectList, toProject])
  const pauseStorage = useCallback((paused: boolean) => {
    storagePausedRef.current = paused
    setStoragePaused(paused)
  }, [])

  useEffect(() => {
    if (loadStarted.current) return
    loadStarted.current = true
    void projectStorage.load()
      .then((project) => {
        hydrate(project)
        void refreshProjectList().catch(() => setProjects([]))
      })
      .catch(() => { hydrate(undefined); setProjects([]) })
  }, [hydrate, pauseStorage, refreshProjectList])

  useEffect(() => {
    if (!hydrated || recoveryRequired || storagePaused) return
    setSaveStatus('saving')
    const timer = window.setTimeout(async () => {
      if (storagePausedRef.current) return
      const savedProjectId = projectId
      await persistProject(toProject())
      if (useBuilderStore.getState().projectId === savedProjectId) setSaveStatus('saved')
    }, 500)
    return () => window.clearTimeout(timer)
  }, [hydrated, persistProject, projectId, projectSaveKey, recoveryRequired, setSaveStatus, storagePaused, toProject])

  useEffect(() => {
    if (!hydrated || recoveryRequired) return
    const flush = () => {
      if (!storagePausedRef.current) void projectStorage.save(useBuilderStore.getState().toProject(), { activate: true }).catch(() => undefined)
    }
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
    if (nextProjectId === projectId || storagePausedRef.current) return
    await persistProject(toProject())
    const project = await projectStorage.activate(nextProjectId)
    if (!project) return
    hydrate(project)
    await refreshProjectList()
  }

  const persistCurrentProject = async () => {
    if (storagePausedRef.current) return
    const project = useBuilderStore.getState().toProject()
    await persistProject(project)
    if (useBuilderStore.getState().projectId === project.id) setSaveStatus('saved')
  }

  const openWorkspaceSection = useCallback((section: WorkspaceSectionId) => {
    dispatchNavigation({ type: 'open-section', section })
  }, [])

  const renameStoredProject = async (renamedProjectId: string, name: string) => {
    const normalized = normalizeValidProjectName(name)
    if (!normalized) return false
    if (renamedProjectId === projectId) {
      if (!useBuilderStore.getState().renameProject(normalized)) return false
      await persistCurrentProject()
      return true
    }
    const project = await projectStorage.load(renamedProjectId)
    if (!project) return false
    await projectStorage.save({ ...project, name: normalized, updatedAt: new Date().toISOString() }, { activate: false })
    await refreshProjectList()
    return true
  }

  const deleteProject = async (deletedProjectId: string) => {
    const deletingCurrent = deletedProjectId === projectId
    if (deletingCurrent) {
      pauseStorage(true)
      await saveQueue.current.catch(() => undefined)
    }
    const result = await deleteStoredProject(projectStorage, deletedProjectId, projectId)
    setProjects(result.projects)
    if (!deletingCurrent) return
    if (result.nextProject) {
      hydrate(result.nextProject)
      setProjectCreationRequired(false)
      pauseStorage(false)
      return
    }
    hydrate(null)
    setProjectCreationRequired(true)
    setNewProjectOpen(true)
    dispatchNavigation({ type: 'open-section', section: 'proxies' })
  }

  const completeProjectFlow = () => {
    const project = useBuilderStore.getState().toProject()
    setNewProjectOpen(false)
    setProjectCreationRequired(false)
    pauseStorage(false)
    dispatchNavigation({ type: 'open-section', section: 'proxies' })
    void persistProject(project).then(() => setSaveStatus('saved'))
  }

  return <div className="app-shell">
    <a href={view === 'workspace' ? '#workspace-main' : '#canvas'} className="skip-link">{view === 'workspace' ? t('app.skipToWorkspace') : t('app.skipToCanvas')}</a>
    <TopBar
      view={view}
      onViewChange={(nextView) => dispatchNavigation({ type: 'set-view', view: nextView })}
      onOpenWorkspaceSection={openWorkspaceSection}
      projects={projects}
      onNewProject={() => setNewProjectOpen(true)}
      onSwitchProject={switchProject}
      onRenameProject={renameStoredProject}
      onDeleteProject={deleteProject}
      primaryHealth={primaryHealth}
    />
    {view === 'workspace'
      ? <WorkspaceShell
        activeSection={workspaceSection}
        lastNodeSection={lastNodeSection}
        projects={projects}
        onSectionChange={openWorkspaceSection}
        onViewChange={(nextView) => dispatchNavigation({ type: 'set-view', view: nextView })}
        onNewProject={() => setNewProjectOpen(true)}
        onSwitchProject={switchProject}
        onRenameProject={renameStoredProject}
        onDeleteProject={deleteProject}
        primaryHealth={primaryHealth}
      />
      : <Suspense fallback={<div className="visual-flow-loading" role="status"><Route size={22} /><span>{t('app.loading')}</span></div>}><VisualFlowWorkspace onOpenWorkspaceSection={openWorkspaceSection} /></Suspense>}
    <StatusBar view={view} health={primaryHealth} />
    {previewOpen && <Suspense fallback={null}><PreviewModal /></Suspense>}
    <SubscriptionEmptyConfirmation />
    {recoveryNotice && <section className={`recovery-banner${recoveryRequired ? ' is-required' : ''}`} role={recoveryRequired ? 'alertdialog' : 'status'} aria-label={t('app.recoveryLabel')}>
      <div><strong>{recoveryRequired ? t('app.recoveryRequiredTitle') : t('app.recoveryMigratedTitle')}</strong><span>{localizeKnownSystemText(recoveryNotice, locale)}</span></div>
      <div><button className="secondary-action" onClick={() => setNewProjectOpen(true)}>{t('app.newProject')}</button><button className="primary-action" onClick={resetToDemo}>{t('app.resetDemo')}</button>{!recoveryRequired && <button className="recovery-close" onClick={dismissRecoveryNotice} aria-label={t('app.dismissRecovery')}><X size={16} /></button>}</div>
    </section>}
    {!hydrated && <div className="loading-screen"><img className="brand-mark" src={proxyFlowLogo} alt="" aria-hidden="true" /><strong>ProxyFlow</strong><small>{t('app.loading')}</small></div>}
    {toast && <div className="toast" role="status"><span><Check size={12} /></span>{toast}</div>}
    <NewProjectDialog
      open={newProjectOpen || projectCreationRequired || Boolean(hydrated && primaryTarget === null && view === 'workspace')}
      required={projectCreationRequired || (!newProjectOpen && Boolean(hydrated && primaryTarget === null && view === 'workspace'))}
      configureExistingProject={!projectCreationRequired && Boolean(hydrated && primaryTarget === null && view === 'workspace')}
      onClose={() => setNewProjectOpen(false)}
      beforeCreate={persistCurrentProject}
      onComplete={completeProjectFlow}
    />
  </div>
}
