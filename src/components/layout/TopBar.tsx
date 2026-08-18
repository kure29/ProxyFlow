import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Download, Eye, Languages, LayoutTemplate, Network, PanelsTopLeft, Redo2, RefreshCw, Undo2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import proxyFlowMark from '../../assets/proxyflow-mark.svg'
import { useBuilderStore } from '../../store/useBuilderStore'
import { localizeProjectName, useI18n } from '../../i18n'
import { RuntimeServicePanel } from '../runtime/RuntimeServicePanel'
import { APP_VERSION_BADGE, APP_VERSION_LABEL } from '../../version'
import type { ProductView } from '../workspace/types'
import type { ProjectListItem } from '../../storage/projectStorage'

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className="icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>
}

interface TopBarProps {
  view: ProductView
  projects: ProjectListItem[]
  onViewChange: (view: ProductView) => void
  onProjectChange: (projectId: string) => Promise<void>
  onProjectNameCommit: () => Promise<void>
  onNewProject: () => void
}

export function TopBar({ view, projects, onViewChange, onProjectChange, onProjectNameCommit, onNewProject }: TopBarProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
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
  const refreshAll = useBuilderStore((state) => state.refreshAllSubscriptions)
  const refreshableCount = useBuilderStore((state) => state.nodes.filter((node) => node.data.blockType === 'subscription' && node.data.enabled !== false && node.data.subscriptionInputKind === 'url' && Boolean(node.data.subscriptionUrl?.trim())).length)
  const refreshing = useBuilderStore((state) => Object.values(state.subscriptionRuntimes).some((runtime) => runtime.refreshStatus === 'loading'))
  const visibleProjectName = localizeProjectName(projectName, locale)
  const [projectNameDraft, setProjectNameDraft] = useState(visibleProjectName)
  const editStartName = useRef(projectName)
  const cancelRename = useRef(false)

  useEffect(() => setProjectNameDraft(visibleProjectName), [projectId, visibleProjectName])

  useEffect(() => {
    if (!projectMenuOpen && !languageMenuOpen) return
    const close = () => { setProjectMenuOpen(false); setLanguageMenuOpen(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [languageMenuOpen, projectMenuOpen])

  const commitProjectName = (value: string) => {
    if (!renameProject(value)) {
      setProjectNameDraft(visibleProjectName)
      return
    }
    void onProjectNameCommit()
  }

  return (
    <header className="topbar">
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
        {projectMenuOpen && <div className="project-menu">
          <span>{t('top.recentProjects')}</span>
          {projects.map((project) => {
            const name = project.id === projectId ? visibleProjectName : localizeProjectName(project.name, locale)
            return <button className={project.id === projectId ? 'is-active' : ''} key={project.id} onClick={() => {
              setProjectMenuOpen(false)
              void onProjectChange(project.id)
            }}>
              {project.id === projectId ? <Check size={13} /> : <span className="project-menu-placeholder" />}
              <span>{name}</span>
            </button>
          })}
          <button onClick={() => { onNewProject(); setProjectMenuOpen(false) }}>{t('top.newProject')} <small>{APP_VERSION_LABEL}</small></button>
        </div>}
      </div>

      <div className="product-view-switcher" role="group" aria-label={t('top.productViews')}>
        <button className={view === 'workspace' ? 'is-active' : ''} aria-pressed={view === 'workspace'} onClick={() => onViewChange('workspace')}><PanelsTopLeft size={15} /><span>{t('top.workspace')}</span></button>
        <button className={view === 'visual-flow' ? 'is-active' : ''} aria-pressed={view === 'visual-flow'} onClick={() => onViewChange('visual-flow')}><Network size={15} /><span>{t('top.visualFlow')}</span></button>
      </div>

      <div className="save-indicator" aria-live="polite">
        <span className={saveStatus === 'saving' ? 'saving-dot' : 'saved-dot'} />
        {saveStatus === 'saving' ? t('top.saving') : t('top.savedLocally')}
      </div>

      <div className="language-switcher-wrap">
        <button className="language-switcher" aria-label={t('top.chooseLanguage')} aria-expanded={languageMenuOpen} onClick={(event) => { event.stopPropagation(); setLanguageMenuOpen((open) => !open) }}>
          <Languages size={16} /><span>{locale === 'zh-CN' ? '中文' : 'English'}</span><ChevronDown size={13} />
        </button>
        {languageMenuOpen && <div className="language-menu" role="menu" aria-label={t('top.language')}>
          <button className={locale === 'zh-CN' ? 'is-active' : ''} onClick={() => { setLocale('zh-CN'); setLanguageMenuOpen(false) }}><span>中文</span>{locale === 'zh-CN' && <Check size={13} />}</button>
          <button className={locale === 'en-US' ? 'is-active' : ''} onClick={() => { setLocale('en-US'); setLanguageMenuOpen(false) }}><span>English</span>{locale === 'en-US' && <Check size={13} />}</button>
        </div>}
      </div>

      <nav className="top-actions" aria-label={view === 'visual-flow' ? t('top.canvasActions') : t('top.workspaceActions')}>
        <RuntimeServicePanel />
        <div className="top-action-group">
          <IconButton label={t('top.undo')} disabled={!canUndo} onClick={undo}><Undo2 size={16} /></IconButton>
          <IconButton label={t('top.redo')} disabled={!canRedo} onClick={redo}><Redo2 size={16} /></IconButton>
          {view === 'visual-flow' && <IconButton label={t('top.autoLayout')} onClick={() => { autoLayout(); window.setTimeout(() => fitView({ padding: 0.15, duration: 450 }), 40) }}><LayoutTemplate size={16} /></IconButton>}
        </div>
        <button className="secondary-action refresh-all-action" aria-label={t('top.refreshAll')} title={t('top.refreshAll')} disabled={refreshableCount === 0} onClick={() => void refreshAll()}><RefreshCw className={refreshing ? 'spin' : ''} size={16} /><span>{t('top.refreshAll')}</span></button>
        <button className="secondary-action" onClick={() => setPreviewOpen(true)}><Eye size={16} /> {t('top.preview')}</button>
        <button className="primary-action" onClick={() => setPreviewOpen(true)}><Download size={16} /> {t('top.exportConfig')}</button>
      </nav>
    </header>
  )
}
