import { useEffect, useState } from 'react'
import { Check, ChevronDown, Download, Globe2, MoreHorizontal } from 'lucide-react'
import proxyFlowLogo from '../../assets/brand/proxyflow-logo.png'
import { useBuilderStore } from '../../store/useBuilderStore'
import { localizeProjectName, useI18n } from '../../i18n'
import { RuntimeServicePanel } from '../runtime/RuntimeServicePanel'
import { Button, SegmentedControl } from '../ui/Primitives'
import { APP_VERSION_BADGE, APP_VERSION_LABEL } from '../../version'
import { resolveTopBarActions } from './shellState'
import type { ProductView } from '../workspace/types'
import type { WorkspaceSectionId } from '../../core/workspace'
import { getTargetCapabilities } from '../../core/capabilities'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'

interface TopBarProps {
  view: ProductView
  onViewChange: (view: ProductView) => void
  onOpenWorkspaceSection: (section: WorkspaceSectionId) => void
  primaryHealth: PrimaryTargetHealth
}

export function TopBar({ view, onViewChange, onOpenWorkspaceSection, primaryHealth }: TopBarProps) {
  const [globalMenuOpen, setGlobalMenuOpen] = useState(false)
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

  return <header className="topbar" data-view={view}>
    <button className="brand" type="button" aria-label={t('workspace.overview')} onClick={() => onOpenWorkspaceSection('overview')}>
      <img className="brand-mark" src={proxyFlowLogo} alt="" aria-hidden="true" />
      <strong>ProxyFlow</strong>
      <small className="version-mark" title={APP_VERSION_LABEL}>{APP_VERSION_BADGE}</small>
    </button>

    <div className="topbar-project" title={visibleProjectName}>
      <small>{t('top.currentProject')}</small>
      <span className="current-project-separator" aria-hidden="true">·</span>
      <strong>{visibleProjectName}</strong>
    </div>

    <SegmentedControl className="product-view-switcher" label={t('top.productViews')}>
      <button type="button" className={view === 'workspace' ? 'is-active' : ''} aria-pressed={view === 'workspace'} onClick={() => onViewChange('workspace')}><span>{t('top.configuration')}</span></button>
      <button type="button" className={view === 'visual-flow' ? 'is-active' : ''} aria-pressed={view === 'visual-flow'} onClick={() => onViewChange('visual-flow')}><span>{t('top.blueprint')}</span></button>
    </SegmentedControl>

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
