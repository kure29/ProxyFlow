import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Download, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { getTargetCapabilities, PRIMARY_TARGETS, type PrimaryTarget } from '../../core/capabilities'
import type { StructuredDiagnostic } from '../../core/compiler'
import { outputDefinitions } from '../../data/demoProject'
import { useI18n } from '../../i18n'
import type { useProjectCompiles } from '../compiler/useProjectCompiles'
import type { TargetCompileState } from '../compiler/useTargetCompile'
import { AssetIcon } from '../icons/AssetIcon'

type ProjectCompiles = ReturnType<typeof useProjectCompiles>

interface TargetSwitchDialogProps {
  open: boolean
  current: PrimaryTarget | null
  compiles: ProjectCompiles
  onClose: () => void
  onSelect: (target: PrimaryTarget) => void
}

export function TargetSwitchDialog({ open, current, compiles, onClose, onSelect }: TargetSwitchDialogProps) {
  const { t } = useI18n()
  const [candidate, setCandidate] = useState<PrimaryTarget>(current ?? 'mihomo')
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    setCandidate(current ?? 'mihomo')
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      returnFocusRef.current?.focus()
    }
  }, [current, onClose, open])
  if (!open) return null

  return <div className="target-switch-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={panelRef} className="target-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="target-switch-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>{t('workspace.primaryTarget')}</span><h2 id="target-switch-title">{t('workspace.switchTarget')}</h2></div><button ref={closeRef} type="button" aria-label={t('workspace.closeTargetSwitch')} onClick={onClose}><X size={18} /></button></header>
      <p>{t('workspace.switchTargetDescription')}</p>
      <div className="target-switch-options">{PRIMARY_TARGETS.map((target) => <button type="button" className={candidate === target ? 'is-selected' : ''} aria-pressed={candidate === target} key={target} onClick={() => setCandidate(target)}>
        <TargetArtwork target={target} />
        <TargetStatus target={target} state={stateForTarget(compiles, target)} graphIssues={compiles.graphResult.issues} />
        <i>{candidate === target ? t('newProject.selected') : t('newProject.select')}</i>
      </button>)}</div>
      <aside><ShieldCheck size={16} /><span>{t('workspace.switchTargetPreserves')}</span></aside>
      <footer><button type="button" className="secondary-action" onClick={onClose}>{t('preview.close')}</button><button type="button" className="primary-action" onClick={() => onSelect(candidate)}>{candidate === current ? t('workspace.keepTarget') : t('workspace.useTarget', { target: getTargetCapabilities(candidate).label })}</button></footer>
    </section>
  </div>
}

export function WorkspaceExportPanel({ primaryTarget, compiles, onPreview }: {
  primaryTarget: PrimaryTarget | null
  compiles: ProjectCompiles
  onPreview: (target: PrimaryTarget) => void
}) {
  const { t } = useI18n()
  return <div className="workspace-target-exports">
    {PRIMARY_TARGETS.map((target) => {
      const primary = target === primaryTarget
      const state = stateForTarget(compiles, target)
      const status = targetStatus(state, compiles.graphResult.issues)
      return <article className={primary ? 'is-primary' : ''} key={target}>
        <TargetArtwork target={target} />
        <TargetStatus target={target} state={state} graphIssues={compiles.graphResult.issues} />
        <div className="workspace-target-export-actions">{primary && <span>{t('workspace.primaryTarget')}</span>}<button type="button" className={primary ? 'primary-action' : 'secondary-action'} onClick={() => onPreview(target)}>{status.kind === 'ready' ? <Download size={15} /> : <AlertTriangle size={15} />}{status.kind === 'ready' ? t('workspace.previewExport') : t('workspace.inspectBlockers')}</button></div>
      </article>
    })}
  </div>
}

function TargetArtwork({ target }: { target: PrimaryTarget }) {
  const definition = outputDefinitions.find((output) => output.target === target)!
  return <AssetIcon className="workspace-target-icon" src={definition.icon} darkSrc={definition.iconDark} fallback={definition.label.slice(0, 1)} />
}

function TargetStatus({ target, state, graphIssues }: { target: PrimaryTarget; state: TargetCompileState; graphIssues: StructuredDiagnostic[] }) {
  const { t } = useI18n()
  const capabilities = getTargetCapabilities(target)
  const status = targetStatus(state, graphIssues)
  const label = status.kind === 'ready'
    ? t('workspace.targetReady')
    : status.kind === 'loading'
      ? t('workspace.targetChecking')
      : t('workspace.targetBlockers', { count: status.errorCount || 1 })
  return <div className="workspace-target-status">
    <span><strong>{capabilities.label}</strong><small>{t('newProject.baseline', { version: capabilities.baselineVersion })}</small></span>
    <b className={`is-${status.kind}`}>{status.kind === 'loading' ? <LoaderCircle className="spin" size={13} /> : status.kind === 'ready' ? <Check size={13} /> : <AlertTriangle size={13} />}{label}</b>
    {status.warningCount > 0 && <small>{t(status.warningCount === 1 ? 'workspace.targetWarning' : 'workspace.targetWarnings', { count: status.warningCount })}</small>}
    {status.codes.length > 0 && <div>{status.codes.map((code) => <code key={code}>{code}</code>)}</div>}
  </div>
}

function stateForTarget(compiles: ProjectCompiles, target: PrimaryTarget) {
  return target === 'mihomo' ? compiles.mihomoState : compiles.singBoxState
}

function targetStatus(state: TargetCompileState, graphIssues: StructuredDiagnostic[]) {
  const graphErrors = graphIssues.filter((issue) => issue.severity === 'error')
  const issues = graphErrors.length ? graphErrors : state.result?.issues ?? []
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')
  const codes = [...new Set(errors.map((issue) => issue.code))].slice(0, 3)
  if (graphErrors.length || state.status === 'error' || state.status === 'unavailable') return {
    kind: 'blocked' as const,
    errorCount: errors.length,
    warningCount: warnings.length,
    codes,
  }
  if (state.status === 'success') return {
    kind: 'ready' as const,
    errorCount: 0,
    warningCount: warnings.length,
    codes: [] as string[],
  }
  return { kind: 'loading' as const, errorCount: 0, warningCount: 0, codes: [] as string[] }
}
