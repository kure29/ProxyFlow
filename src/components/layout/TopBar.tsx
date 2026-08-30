import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Download, FolderTree, Globe2, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import proxyFlowLogo from '../../assets/brand/proxyflow-logo.png'
import { useBuilderStore } from '../../store/useBuilderStore'
import { localizeProjectName, useI18n } from '../../i18n'
import { RuntimeServicePanel } from '../runtime/RuntimeServicePanel'
import { Button } from '../ui/Primitives'
import { APP_VERSION_BADGE, APP_VERSION_LABEL } from '../../version'
import { resolveTopBarActions } from './shellState'
import type { ProductView } from '../workspace/types'
import type { WorkspaceSectionId } from '../../core/workspace'
import { getTargetCapabilities } from '../../core/capabilities'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'
import type { ProjectListItem } from '../../storage/projectStorage'

interface TopBarProps {
  view: ProductView
  onOpenWorkspaceSection: (section: WorkspaceSectionId) => void
  primaryHealth: PrimaryTargetHealth
  projects: ProjectListItem[]
  onNewProject: () => void
  onSwitchProject: (projectId: string) => Promise<void>
  onRenameProject: (projectId: string, name: string) => Promise<boolean>
  onDeleteProject: (projectId: string) => Promise<void>
}

export function TopBar({ view, onOpenWorkspaceSection, primaryHealth, projects, onNewProject, onSwitchProject, onRenameProject, onDeleteProject }: TopBarProps) {
  const [globalMenuOpen, setGlobalMenuOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const projectTriggerRef = useRef<HTMLButtonElement>(null)
  const { locale, setLocale, t } = useI18n()
  const projectName = useBuilderStore((state) => state.projectName)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const saveStatus = useBuilderStore((state) => state.saveStatus)
  const visibleProjectName = localizeProjectName(projectName, locale)
  const actions = resolveTopBarActions(view)
  const targetLabel = primaryTarget ? getTargetCapabilities(primaryTarget).label : '—'
  const healthLabel = primaryHealth.status === 'ready' ? t('top.healthReady') : primaryHealth.status === 'blocked' ? t('top.healthBlocked') : t('top.healthChecking')

  useEffect(() => {
    if (!globalMenuOpen) return
    const close = () => setGlobalMenuOpen(false)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [globalMenuOpen])

  useEffect(() => {
    if (!projectMenuOpen) return
    const close = () => {
      setProjectMenuOpen(false)
      projectTriggerRef.current?.focus()
    }
    const closeOutside = (event: PointerEvent) => {
      if (!projectMenuRef.current?.contains(event.target as Node)) close()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [projectMenuOpen])

  const openRename = (project: ProjectListItem) => {
    setDeleteProjectId(null)
    setRenameProjectId(project.id)
    setRenameDraft(localizeProjectName(project.name, locale))
  }
  const submitRename = async (projectId: string) => {
    if (!renameDraft.trim()) return
    if (await onRenameProject(projectId, renameDraft)) setRenameProjectId(null)
  }
  const submitDelete = async (projectId: string) => {
    await onDeleteProject(projectId)
    setDeleteProjectId(null)
  }
  const closeProjectMenu = () => {
    setProjectMenuOpen(false)
    projectTriggerRef.current?.focus()
  }

  return <header className="topbar" data-view={view}>
    <button className="brand" type="button" aria-label={t('workspace.sources')} onClick={() => onOpenWorkspaceSection('sources')}>
      <img className="brand-mark" src={proxyFlowLogo} alt="" aria-hidden="true" />
      <strong>ProxyFlow</strong>
      <small className="version-mark" title={APP_VERSION_LABEL}>{APP_VERSION_BADGE}</small>
    </button>

    <div className="topbar-project-selector" ref={projectMenuRef}>
      <button ref={projectTriggerRef} type="button" className="topbar-project-trigger" aria-haspopup="dialog" aria-controls={projectMenuOpen ? 'topbar-project-menu' : undefined} aria-expanded={projectMenuOpen} onClick={() => projectMenuOpen ? closeProjectMenu() : setProjectMenuOpen(true)}>
        <FolderTree size={18} aria-hidden="true" />
        <strong title={visibleProjectName}>{visibleProjectName}</strong>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {projectMenuOpen && <div id="topbar-project-menu" className="topbar-project-menu" role="dialog" aria-label={t('top.projectMenu')}>
        <header><span>{t('top.recentProjects')}</span><button type="button" aria-label={t('newProject.close')} onClick={() => { closeProjectMenu(); onNewProject() }}><Plus size={15} /></button></header>
        <div className="topbar-project-list">
          {projects.map((project) => {
            const active = project.active
            const visibleName = localizeProjectName(project.name, locale)
            const itemTarget = project.primaryTarget ? getTargetCapabilities(project.primaryTarget).label : t('workspace.targetRequired')
            return <article key={project.id} className={active ? 'is-active' : ''}>
              {renameProjectId === project.id
                ? <form className="topbar-project-rename" onSubmit={(event) => { event.preventDefault(); void submitRename(project.id) }}>
                  <input autoFocus value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} aria-label={t('project.name')} />
                  <button type="submit" aria-label={t('project.save')}><Check size={14} /></button>
                  <button type="button" aria-label={t('workspace.cancel')} onClick={() => setRenameProjectId(null)}><X size={14} /></button>
                </form>
                : deleteProjectId === project.id
                  ? <div className="topbar-project-delete-confirm"><span>{t('project.deleteConfirmation', { name: visibleName })}</span><div><button type="button" onClick={() => setDeleteProjectId(null)}>{t('workspace.cancel')}</button><button type="button" className="danger" onClick={() => void submitDelete(project.id)}><Trash2 size={13} />{t('project.delete')}</button></div></div>
                  : <><button type="button" className="topbar-project-select" disabled={active} onClick={() => { closeProjectMenu(); void onSwitchProject(project.id) }}><span className="topbar-project-check">{active && <Check size={14} />}</span><span><strong>{visibleName}</strong><small>{itemTarget}{active ? ` · ${t('project.current')}` : ''}</small></span></button><div className="topbar-project-actions"><button type="button" aria-label={t('project.rename')} onClick={() => openRename(project)}><Pencil size={13} /></button><button type="button" aria-label={t('project.delete')} onClick={() => { setRenameProjectId(null); setDeleteProjectId(project.id) }}><Trash2 size={13} /></button></div></>
              }
            </article>
          })}
        </div>
        <button type="button" className="topbar-project-new" onClick={() => { closeProjectMenu(); onNewProject() }}><Plus size={15} />{t('top.newProject')}</button>
      </div>}
    </div>

    <span className="topbar-mobile-target" title={t('workspace.primaryTarget')}>{targetLabel}</span>
    <span className="topbar-mobile-health" data-status={primaryHealth.status} role="status" aria-label={healthLabel} title={healthLabel} />

    <nav className="top-actions" aria-label={view === 'visual-flow' ? t('top.canvasActions') : t('top.workspaceActions')}>
      <div className="save-indicator" aria-live="polite">
        <span className={saveStatus === 'saving' ? 'saving-dot' : 'saved-dot'} />
        {saveStatus === 'saving' ? t('top.saving') : t('top.savedLocally')}
      </div>
      <RuntimeServicePanel />
      {actions.export && <Button className="top-export-action" variant="primary" aria-label={t('top.exportConfig')} onClick={() => onOpenWorkspaceSection('export')}><Download size={16} /><span>{t('top.exportConfig')}</span></Button>}
      <div className="topbar-language-wrap">
        <button
          type="button"
          className="topbar-language-trigger"
          aria-label={t('top.globalActions')}
          title={t('top.globalActions')}
          aria-haspopup="menu"
          aria-expanded={globalMenuOpen}
          onClick={(event) => { event.stopPropagation(); setGlobalMenuOpen((open) => !open) }}
        ><Globe2 className="topbar-language-icon" size={17} /><MoreHorizontal className="topbar-more-icon" size={20} /><span>{locale === 'zh-CN' ? '中文' : 'English'}</span><ChevronDown size={13} /></button>
        {globalMenuOpen && <div className="language-menu topbar-language-menu" role="menu" aria-label={t('top.globalActions')} onClick={(event) => event.stopPropagation()}>
          <span className="topbar-menu-heading">{t('top.language')}</span>
          <button type="button" role="menuitem" className={locale === 'zh-CN' ? 'is-active' : ''} onClick={() => { setLocale('zh-CN'); setGlobalMenuOpen(false) }}><span>简体中文</span>{locale === 'zh-CN' && <Check size={13} />}</button>
          <button type="button" role="menuitem" className={locale === 'en-US' ? 'is-active' : ''} onClick={() => { setLocale('en-US'); setGlobalMenuOpen(false) }}><span>English</span>{locale === 'en-US' && <Check size={13} />}</button>
        </div>}
      </div>
    </nav>
  </header>
}
