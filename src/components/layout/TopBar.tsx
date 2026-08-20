import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Download, Eye, Globe2, Network, PanelsTopLeft } from 'lucide-react'
import proxyFlowLogo from '../../assets/brand/proxyflow-logo.png'
import { useBuilderStore } from '../../store/useBuilderStore'
import { localizeProjectName, useI18n } from '../../i18n'
import { RuntimeServicePanel } from '../runtime/RuntimeServicePanel'
import { Button, SegmentedControl } from '../ui/Primitives'
import { APP_VERSION_BADGE, APP_VERSION_LABEL } from '../../version'
import { resolveTopBarActions } from './shellState'
import type { ProductView } from '../workspace/types'
import type { WorkspaceSectionId } from '../../core/workspace'
import type { ProjectListItem } from '../../storage/projectStorage'
import { getTargetCapabilities } from '../../core/capabilities'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'

interface TopBarProps {
  view: ProductView
  projects: ProjectListItem[]
  onViewChange: (view: ProductView) => void
  onProjectChange: (projectId: string) => Promise<void>
  onProjectNameCommit: () => Promise<void>
  onNewProject: () => void
  onOpenWorkspaceSection: (section: WorkspaceSectionId) => void
  primaryHealth: PrimaryTargetHealth
}

export function TopBar({ view, projects, onViewChange, onProjectChange, onProjectNameCommit, onNewProject, onOpenWorkspaceSection, primaryHealth }: TopBarProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const { locale, setLocale, t } = useI18n()
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const renameProject = useBuilderStore((state) => state.renameProject)
  const saveStatus = useBuilderStore((state) => state.saveStatus)
  const setPreviewOpen = useBuilderStore((state) => state.setPreviewOpen)
  const visibleProjectName = localizeProjectName(projectName, locale)
  const [projectNameDraft, setProjectNameDraft] = useState(visibleProjectName)
  const editStartName = useRef(projectName)
  const cancelRename = useRef(false)
  const actions = resolveTopBarActions(view)
  const targetLabel = primaryTarget ? getTargetCapabilities(primaryTarget).label : '—'
  const healthLabel = primaryHealth.status === 'ready' ? t('top.healthReady') : primaryHealth.status === 'blocked' ? t('top.healthBlocked') : t('top.healthChecking')

  useEffect(() => setProjectNameDraft(visibleProjectName), [projectId, visibleProjectName])

  useEffect(() => {
    if (!projectMenuOpen && !languageMenuOpen) return
    const close = () => { setProjectMenuOpen(false); setLanguageMenuOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [languageMenuOpen, projectMenuOpen])

  const commitProjectName = (value: string) => {
    if (!renameProject(value)) {
      setProjectNameDraft(visibleProjectName)
      return
    }
    void onProjectNameCommit()
  }

  return (
    <header className="topbar" data-view={view}>
      <button className="brand" type="button" aria-label={t('workspace.overview')} onClick={() => onOpenWorkspaceSection('overview')}>
        <img className="brand-mark" src={proxyFlowLogo} alt="" aria-hidden="true" />
        <strong>ProxyFlow</strong>
        <small className="version-mark" title={APP_VERSION_LABEL}>{APP_VERSION_BADGE}</small>
      </button>
      <div className="project-switcher-wrap">
        <div className="project-switcher">
          <span>
            <input
              className="project-name-input"
              aria-label={t('top.projectName')}
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
        {projectMenuOpen && <div id="project-menu" className="project-menu" role="menu" aria-label={t('top.recentProjects')} onClick={(event) => event.stopPropagation()}>
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
          <button type="button" role="menuitem" className="project-menu-view-switch" onClick={() => { onViewChange(view === 'workspace' ? 'visual-flow' : 'workspace'); setProjectMenuOpen(false) }}>
            {view === 'workspace' ? <Network size={15} /> : <PanelsTopLeft size={15} />}
            <span>{view === 'workspace' ? t('top.visualFlow') : t('top.workspace')}</span>
          </button>
        </div>}
      </div>

      <SegmentedControl className="product-view-switcher" label={t('top.productViews')}>
        <button className={view === 'workspace' ? 'is-active' : ''} aria-pressed={view === 'workspace'} onClick={() => onViewChange('workspace')}><PanelsTopLeft size={15} /><span>{t('top.workspace')}</span></button>
        <button className={view === 'visual-flow' ? 'is-active' : ''} aria-pressed={view === 'visual-flow'} onClick={() => onViewChange('visual-flow')}><Network size={15} /><span>{t('top.visualFlow')}</span></button>
      </SegmentedControl>

      <span className="topbar-mobile-target" title={t('workspace.primaryTarget')}>{targetLabel}</span>
      <span className="topbar-mobile-health" data-status={primaryHealth.status} role="status" aria-label={healthLabel} title={healthLabel} />

      <nav className="top-actions" aria-label={view === 'visual-flow' ? t('top.canvasActions') : t('top.workspaceActions')}>
        <div className="save-indicator" aria-live="polite">
          <span className={saveStatus === 'saving' ? 'saving-dot' : 'saved-dot'} />
          {saveStatus === 'saving' ? t('top.saving') : t('top.savedLocally')}
        </div>
        <RuntimeServicePanel />
        {actions.preview && <Button className="top-preview-action" variant="secondary" aria-label={t('top.preview')} onClick={() => setPreviewOpen(true)}><Eye size={16} /><span>{t('top.preview')}</span></Button>}
        {actions.export && <Button className="top-export-action" variant="primary" aria-label={t('top.exportConfig')} onClick={() => onOpenWorkspaceSection('export')}><Download size={16} /><span>{t('top.exportConfig')}</span></Button>}
        <div className="topbar-language-wrap">
          <button
            type="button"
            className="topbar-language-trigger"
            aria-label={t('top.chooseLanguage')}
            title={t('top.chooseLanguage')}
            aria-expanded={languageMenuOpen}
            onClick={(event) => { event.stopPropagation(); setLanguageMenuOpen((open) => !open) }}
          ><Globe2 size={17} /><span>{locale === 'zh-CN' ? '中文' : 'English'}</span><ChevronDown size={13} /></button>
          {languageMenuOpen && <div className="language-menu topbar-language-menu" role="menu" aria-label={t('top.language')} onClick={(event) => event.stopPropagation()}>
            <button type="button" role="menuitem" className={locale === 'zh-CN' ? 'is-active' : ''} onClick={() => { setLocale('zh-CN'); setLanguageMenuOpen(false) }}><span>简体中文</span>{locale === 'zh-CN' && <Check size={13} />}</button>
            <button type="button" role="menuitem" className={locale === 'en-US' ? 'is-active' : ''} onClick={() => { setLocale('en-US'); setLanguageMenuOpen(false) }}><span>English</span>{locale === 'en-US' && <Check size={13} />}</button>
          </div>}
        </div>
      </nav>
    </header>
  )
}
