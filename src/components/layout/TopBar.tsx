import { useEffect, useState } from 'react'
import { Check, ChevronDown, Download, Eye, Languages, LayoutTemplate, Redo2, RefreshCw, Route, Undo2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useBuilderStore } from '../../store/useBuilderStore'
import { localizeProjectName, useI18n } from '../../i18n'

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className="icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>
}

export function TopBar() {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const { locale, setLocale, t } = useI18n()
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
  const refreshAll = useBuilderStore((state) => state.refreshAllSubscriptions)
  const refreshableCount = useBuilderStore((state) => state.nodes.filter((node) => node.data.blockType === 'subscription' && node.data.enabled !== false && node.data.subscriptionInputKind === 'url' && Boolean(node.data.subscriptionUrl?.trim())).length)
  const refreshing = useBuilderStore((state) => Object.values(state.subscriptionRuntimes).some((runtime) => runtime.refreshStatus === 'loading'))

  useEffect(() => {
    if (!projectMenuOpen && !languageMenuOpen) return
    const close = () => { setProjectMenuOpen(false); setLanguageMenuOpen(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [languageMenuOpen, projectMenuOpen])

  const visibleProjectName = localizeProjectName(projectName, locale)

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Route size={19} /></span>
        <strong>ProxyFlow</strong>
        <span className="version-pill">V0.6</span>
      </div>
      <div className="topbar-divider" />
      <div className="project-switcher-wrap">
        <button className="project-switcher" onClick={(event) => { event.stopPropagation(); setProjectMenuOpen((open) => !open) }}>
          <span><small>{t('top.currentProject')}</small><strong>{visibleProjectName}</strong></span><ChevronDown size={14} />
        </button>
        {projectMenuOpen && <div className="project-menu"><span>{t('top.recentProjects')}</span><button><Check size={13} /> {visibleProjectName}</button><button onClick={() => { createNewProject(); setProjectMenuOpen(false) }}>{t('top.newProject')} <small>V0.6</small></button></div>}
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

      <nav className="top-actions" aria-label={t('top.canvasActions')}>
        <div className="top-action-group">
          <IconButton label={t('top.undo')} disabled={!canUndo} onClick={undo}><Undo2 size={16} /></IconButton>
          <IconButton label={t('top.redo')} disabled={!canRedo} onClick={redo}><Redo2 size={16} /></IconButton>
          <IconButton label={t('top.autoLayout')} onClick={() => { autoLayout(); window.setTimeout(() => fitView({ padding: 0.15, duration: 450 }), 40) }}><LayoutTemplate size={16} /></IconButton>
        </div>
        <button className="secondary-action refresh-all-action" aria-label={t('top.refreshAll')} title={t('top.refreshAll')} disabled={refreshableCount === 0} onClick={() => void refreshAll()}><RefreshCw className={refreshing ? 'spin' : ''} size={16} /><span>{t('top.refreshAll')}</span></button>
        <button className="secondary-action" onClick={() => setPreviewOpen(true)}><Eye size={16} /> {t('top.preview')}</button>
        <button className="primary-action" onClick={() => setPreviewOpen(true)}><Download size={16} /> {t('top.exportConfig')}</button>
      </nav>
    </header>
  )
}
