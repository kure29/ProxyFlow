import { useEffect, useRef, useState } from 'react'
import {
  Check, CheckCircle2, CircleAlert, FileOutput, MoreHorizontal, Plus, SearchCheck, Trash2, X,
} from 'lucide-react'
import { getTargetCapabilities } from '../../core/capabilities'
import {
  countProjectNameGraphemes, PROJECT_NAME_MAX_GRAPHEMES, validateProjectName,
} from '../../core/project/projectName'
import type { WorkspaceSectionId } from '../../core/workspace'
import { localizeProjectName, useI18n } from '../../i18n'
import type { ProjectListItem } from '../../storage/projectStorage'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'
import { summarizeDiagnosticCounts } from '../compiler/diagnosticPresentation'

interface ProjectOverviewProps {
  projectName: string
  projectId: string
  projects: ProjectListItem[]
  targetLabel: string
  canExport: boolean
  health: PrimaryTargetHealth
  proxyCount: number
  strategyCount: number
  routingCount: number
  dnsEnabled: boolean
  onOpenSection: (section: WorkspaceSectionId) => void
  onAddSubscription: () => void
  onAddStrategy: () => void
  onNewProject: () => void
  onSwitchProject: (projectId: string) => Promise<void>
  onRenameProject: (projectId: string, name: string) => Promise<boolean>
  onDeleteProject: (projectId: string) => Promise<void>
}

type ProjectAction = { type: 'rename' | 'delete'; project: ProjectListItem }

export function ProjectOverview({
  projectName, projectId, projects, targetLabel, canExport, health, proxyCount, strategyCount, routingCount, dnsEnabled,
  onOpenSection, onAddSubscription, onAddStrategy, onNewProject, onSwitchProject, onRenameProject, onDeleteProject,
}: ProjectOverviewProps) {
  const { locale, t } = useI18n()
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null)
  const [action, setAction] = useState<ProjectAction | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const managerRef = useRef<HTMLElement>(null)
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const diagnosticCounts = summarizeDiagnosticCounts(health.diagnostics)
  const errorCount = diagnosticCounts.blockerCount
  const warningCount = diagnosticCounts.warningGroupCount
  const facts = [
    { label: t('workspace.overview.target'), value: targetLabel },
    { label: t('workspace.overview.exportable'), value: canExport ? t('workspace.overview.yes') : t('workspace.overview.no'), status: canExport ? 'ready' : 'blocked' },
    { label: t('workspace.overview.nodes'), value: String(proxyCount) },
    { label: t('workspace.overview.strategies'), value: String(strategyCount) },
    { label: t('workspace.overview.routing'), value: String(routingCount) },
    { label: t('workspace.overview.dns'), value: dnsEnabled ? t('workspace.overview.enabled') : t('workspace.overview.disabled') },
  ]

  useEffect(() => {
    if (!menuProjectId) return
    const closeOutside = (event: PointerEvent) => {
      if (!managerRef.current?.contains(event.target as Node)) setMenuProjectId(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuProjectId(null)
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuProjectId])

  useEffect(() => {
    if (!action) return
    const focusFrame = window.requestAnimationFrame(() => {
      if (action.type === 'rename') dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus()
      else headingRef.current?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); closeAction() }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [action, busy])

  const closeAction = () => {
    setAction(null)
    setNameError(null)
    window.requestAnimationFrame(() => actionTriggerRef.current?.focus())
  }
  const openAction = (nextAction: ProjectAction, trigger: HTMLButtonElement) => {
    actionTriggerRef.current = trigger
    setMenuProjectId(null)
    setAction(nextAction)
    setNameDraft(localizeProjectName(nextAction.project.name, locale))
    setNameError(null)
  }
  const submitRename = async () => {
    if (!action || action.type !== 'rename' || busy) return
    const validation = validateProjectName(nameDraft)
    if (validation !== 'valid') {
      setNameError(validation === 'empty' ? t('project.nameRequired') : t('project.nameTooLong', { count: PROJECT_NAME_MAX_GRAPHEMES }))
      return
    }
    setBusy(true)
    try {
      if (await onRenameProject(action.project.id, nameDraft)) closeAction()
      else setNameError(t('project.nameInvalid'))
    } finally {
      setBusy(false)
    }
  }
  const submitDelete = async () => {
    if (!action || action.type !== 'delete' || busy) return
    setBusy(true)
    try {
      await onDeleteProject(action.project.id)
      closeAction()
    } finally {
      setBusy(false)
    }
  }

  return <div className="project-overview">
    <section className="project-overview-summary" aria-labelledby="project-overview-name">
      <div>
        <span>{t('workspace.overview.project')}</span>
        <h2 id="project-overview-name">{projectName}</h2>
      </div>
      <div className="project-overview-health" data-ready={errorCount === 0 || undefined}>
        {errorCount === 0 ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}
        <span><strong>{errorCount === 0 ? t('workspace.overview.clear') : t('workspace.overview.needsAttention')}</strong><small>{t('workspace.overview.issueSummary', { errors: errorCount, warnings: warningCount })}</small></span>
      </div>
    </section>

    <dl className="project-overview-facts">
      {facts.map(({ label, value, status }) => <div key={label} data-status={status}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div><dt>{t('workspace.overview.errors')}</dt><dd><button type="button" onClick={() => onOpenSection('inspect')}>{errorCount}</button></dd></div>
      <div><dt>{t('workspace.overview.warnings')}</dt><dd><button type="button" onClick={() => onOpenSection('inspect')}>{warningCount}</button></dd></div>
    </dl>

    <section ref={managerRef} className="project-manager" aria-labelledby="project-manager-title">
      <header><h3 id="project-manager-title">{t('project.projects')}</h3><button type="button" className="secondary-action" onClick={onNewProject}><Plus size={16} />{t('project.new')}</button></header>
      <div className="project-manager-list">
        {projects.map((project) => {
          const active = project.id === projectId
          const visibleName = localizeProjectName(project.name, locale)
          const itemTarget = project.primaryTarget ? getTargetCapabilities(project.primaryTarget).label : t('workspace.targetRequired')
          return <article className={active ? 'is-active' : ''} key={project.id}>
            <button type="button" className="project-manager-select" disabled={active} onClick={() => void onSwitchProject(project.id)}>
              <span className="project-manager-status">{active && <Check size={16} />}</span>
              <span><strong>{visibleName}</strong><small>{itemTarget}{active ? ` · ${t('project.current')}` : ''}</small></span>
            </button>
            <div className="project-manager-menu-wrap">
              <button type="button" className="project-manager-menu-trigger" aria-label={t('project.actions', { name: visibleName })} aria-haspopup="menu" aria-expanded={menuProjectId === project.id} onClick={() => setMenuProjectId((current) => current === project.id ? null : project.id)}><MoreHorizontal size={18} /></button>
              {menuProjectId === project.id && <div className="project-manager-menu" role="menu">
                <button type="button" role="menuitem" onClick={(event) => openAction({ type: 'rename', project }, event.currentTarget)}>{t('project.rename')}</button>
                <button type="button" role="menuitem" className="danger" onClick={(event) => openAction({ type: 'delete', project }, event.currentTarget)}>{t('project.delete')}</button>
              </div>}
            </div>
          </article>
        })}
      </div>
    </section>

    <section className="project-overview-shortcuts" aria-labelledby="project-overview-shortcuts">
      <h3 id="project-overview-shortcuts">{t('workspace.overview.shortcuts')}</h3>
      <div>
        <button type="button" className="secondary-action" onClick={() => onOpenSection('inspect')}><SearchCheck size={16} />{t('workspace.inspect')}</button>
        <button type="button" className="primary-action" onClick={() => onOpenSection('export')}><FileOutput size={16} />{t('workspace.export')}</button>
        <button type="button" className="secondary-action" onClick={onAddSubscription}><Plus size={16} />{t('workspace.addSubscription')}</button>
        <button type="button" className="secondary-action" onClick={onAddStrategy}><Plus size={16} />{t('workspace.addStrategy')}</button>
      </div>
    </section>

    {action && <div className="project-action-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) closeAction() }}>
      <section ref={dialogRef} className="project-action-dialog" role="dialog" aria-modal="true" aria-labelledby="project-action-title" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <h2 id="project-action-title" ref={headingRef} tabIndex={-1}>{action.type === 'rename' ? t('project.rename') : t('project.deleteTitle')}</h2>
          <button type="button" disabled={busy} aria-label={t('project.closeAction')} onClick={closeAction}><X size={18} /></button>
        </header>
        {action.type === 'rename' ? <div className="project-rename-form">
          <label htmlFor="project-rename-input">{t('project.name')}</label>
          <input id="project-rename-input" value={nameDraft} aria-invalid={Boolean(nameError)} aria-describedby="project-name-help project-name-error" onChange={(event) => { setNameDraft(event.target.value); setNameError(null) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submitRename() } }} />
          <div id="project-name-help"><span>{t('project.nameLimit', { count: PROJECT_NAME_MAX_GRAPHEMES })}</span><span>{countProjectNameGraphemes(nameDraft)} / {PROJECT_NAME_MAX_GRAPHEMES}</span></div>
          {nameError && <p id="project-name-error" role="alert">{nameError}</p>}
        </div> : <p>{t('project.deleteConfirmation', { name: localizeProjectName(action.project.name, locale) })}</p>}
        <footer>
          <button type="button" className="secondary-action" disabled={busy} onClick={closeAction}>{t('workspace.cancel')}</button>
          <button type="button" className={action.type === 'delete' ? 'danger-action' : 'primary-action'} disabled={busy} onClick={() => void (action.type === 'rename' ? submitRename() : submitDelete())}>{action.type === 'rename' ? t('project.save') : <><Trash2 size={16} />{t('project.delete')}</>}</button>
        </footer>
      </section>
    </div>}
  </div>
}
