import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Download, Eye, Focus, LayoutTemplate, MoreHorizontal, Network, PanelsTopLeft, Redo2, Undo2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import proxyFlowMark from '../../assets/proxyflow-mark.svg'
import { useBuilderStore } from '../../store/useBuilderStore'
import { localizeProjectName, useI18n } from '../../i18n'
import { RuntimeServicePanel } from '../runtime/RuntimeServicePanel'
import { Button, IconButton, SegmentedControl } from '../ui/Primitives'
import { APP_VERSION_BADGE, APP_VERSION_LABEL } from '../../version'
import { resolveTopBarActions } from './shellState'
import type { ProductView } from '../workspace/types'
import type { WorkspaceSectionId } from '../../core/workspace'
import type { ProjectListItem } from '../../storage/projectStorage'

interface TopBarProps {
  view: ProductView
  projects: ProjectListItem[]
  onViewChange: (view: ProductView) => void
  onProjectChange: (projectId: string) => Promise<void>
  onProjectNameCommit: () => Promise<void>
  onNewProject: () => void
  onOpenWorkspaceSection: (section: WorkspaceSectionId) => void
}

export function TopBar({ view, projects, onViewChange, onProjectChange, onProjectNameCommit, onNewProject, onOpenWorkspaceSection }: TopBarProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const { locale, setLocale, t } = useI18n()
  const { fitView } = useReactFlow()
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const renameProject = useBuilderStore((state) => state.renameProject)
  const saveStatus = useBuilderStore((state) => state.saveStatus)
  const undo = useBuilderStore((state) => state.undo)
  const redo = useBuilderStore((state) => state.redo)
  const autoLayout = useBuilderStore((state) => state.autoLayout)
  const canUndo = useBuilderStore((state) => state.historyPast.length > 0)
  const canRedo = useBuilderStore((state) => state.historyFuture.length > 0)
  const setPreviewOpen = useBuilderStore((state) => state.setPreviewOpen)
  const visibleProjectName = localizeProjectName(projectName, locale)
  const [projectNameDraft, setProjectNameDraft] = useState(visibleProjectName)
  const editStartName = useRef(projectName)
  const cancelRename = useRef(false)
  const actions = resolveTopBarActions(view)

  useEffect(() => setProjectNameDraft(visibleProjectName), [projectId, visibleProjectName])

  useEffect(() => {
    if (!projectMenuOpen && !moreMenuOpen) return
    const close = () => { setProjectMenuOpen(false); setMoreMenuOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [moreMenuOpen, projectMenuOpen])

  const commitProjectName = (value: string) => {
    if (!renameProject(value)) {
      setProjectNameDraft(visibleProjectName)
      return
    }
    void onProjectNameCommit()
  }

  return (
    <header className="topbar" data-view={view}>
      <div className="brand">
        <img className="brand-mark" src={proxyFlowMark} alt="" aria-hidden="true" />
        <strong>ProxyFlow</strong>
        <small className="version-mark" title={APP_VERSION_LABEL}>{APP_VERSION_BADGE}</small>
      </div>
      <div className="project-switcher-wrap">
        <div className="project-switcher">
          <span>
            <small>{t('top.currentProject')}</small>
            <input
              className="project-name-input"
              aria-label={t('top.currentProject')}
              value={projectNameDraft}
              onFocus={() => { editStartName.current = projectName; cancelRename.current = false }}
              onChange={(event) => {
                setProjectNameDraft(event.target.value)
                renameProject(event.target.value)
              }}
              onBlur={(event) => {
                if (cancelRename.current) { cancelRename.current = false; return }
                commitProjectName(event.currentTarget.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelRename.current = true
                  renameProject(editStartName.current)
                  setProjectNameDraft(localizeProjectName(editStartName.current, locale))
                  event.currentTarget.blur()
                }
              }}
            />
          </span>
          <button
            className="project-switcher-toggle"
            aria-label={t('top.recentProjects')}
            aria-expanded={projectMenuOpen}
            onClick={(event) => { event.stopPropagation(); setProjectMenuOpen((open) => !open) }}
          ><ChevronDown size={14} /></button>
        </div>
        {projectMenuOpen && <div className="project-menu" role="menu" aria-label={t('top.recentProjects')} onClick={(event) => event.stopPropagation()}>
          <span>{t('top.recentProjects')}</span>
          {projects.map((project) => {
            const name = project.id === projectId ? visibleProjectName : localizeProjectName(project.name, locale)
            return <button type="button" role="menuitem" className={project.id === projectId ? 'is-active' : ''} key={project.id} onClick={() => {
              setProjectMenuOpen(false)
              void onProjectChange(project.id)
            }}>
              {project.id === projectId ? <Check size={13} /> : <span className="project-menu-placeholder" />}
              <span>{name}</span>
            </button>
          })}
          <button type="button" role="menuitem" onClick={() => { onNewProject(); setProjectMenuOpen(false) }}>{t('top.newProject')} <small>{APP_VERSION_LABEL}</small></button>
        </div>}
      </div>

      <SegmentedControl className="product-view-switcher" label={t('top.productViews')}>
        <button className={view === 'workspace' ? 'is-active' : ''} aria-pressed={view === 'workspace'} onClick={() => onViewChange('workspace')}><PanelsTopLeft size={15} /><span>{t('top.workspace')}</span></button>
        <button className={view === 'visual-flow' ? 'is-active' : ''} aria-pressed={view === 'visual-flow'} onClick={() => onViewChange('visual-flow')}><Network size={15} /><span>{t('top.visualFlow')}</span></button>
      </SegmentedControl>

      <nav className="top-actions" aria-label={view === 'visual-flow' ? t('top.canvasActions') : t('top.workspaceActions')}>
        <div className="save-indicator" aria-live="polite">
          <span className={saveStatus === 'saving' ? 'saving-dot' : 'saved-dot'} />
          {saveStatus === 'saving' ? t('top.saving') : t('top.savedLocally')}
        </div>
        <RuntimeServicePanel />
        {view === 'visual-flow' && <div className="top-action-group">
          {actions.undo && <IconButton label={t('top.undo')} disabled={!canUndo} onClick={undo}><Undo2 size={16} /></IconButton>}
          {actions.redo && <IconButton label={t('top.redo')} disabled={!canRedo} onClick={redo}><Redo2 size={16} /></IconButton>}
          {actions.autoLayout && <IconButton label={t('top.autoLayout')} onClick={() => { autoLayout(); window.setTimeout(() => fitView({ padding: 0.15, duration: 180 }), 40) }}><LayoutTemplate size={16} /></IconButton>}
          {actions.fit && <IconButton label={t('status.fit')} onClick={() => fitView({ padding: 0.15, duration: 180 })}><Focus size={16} /></IconButton>}
        </div>}
        {actions.preview && <Button className="top-preview-action" variant="secondary" aria-label={t('top.preview')} onClick={() => setPreviewOpen(true)}><Eye size={16} /><span>{t('top.preview')}</span></Button>}
        {actions.export && <Button className="top-export-action" variant="primary" aria-label={t('top.exportConfig')} onClick={() => onOpenWorkspaceSection('export')}><Download size={16} /><span>{t('top.exportConfig')}</span></Button>}
        <div className="topbar-overflow-wrap">
          <IconButton
            className="topbar-overflow-trigger"
            label={t('top.chooseLanguage')}
            aria-expanded={moreMenuOpen}
            onClick={(event) => { event.stopPropagation(); setMoreMenuOpen((open) => !open) }}
          ><MoreHorizontal size={17} /></IconButton>
          {moreMenuOpen && <div className="language-menu topbar-overflow-menu" role="menu" aria-label={t('top.language')} onClick={(event) => event.stopPropagation()}>
            <span>{t('top.language')}</span>
            <button type="button" role="menuitem" className={locale === 'zh-CN' ? 'is-active' : ''} onClick={() => { setLocale('zh-CN'); setMoreMenuOpen(false) }}><span>中文</span>{locale === 'zh-CN' && <Check size={13} />}</button>
            <button type="button" role="menuitem" className={locale === 'en-US' ? 'is-active' : ''} onClick={() => { setLocale('en-US'); setMoreMenuOpen(false) }}><span>English</span>{locale === 'en-US' && <Check size={13} />}</button>
          </div>}
        </div>
      </nav>
    </header>
  )
}
