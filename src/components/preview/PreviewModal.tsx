import { useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { AlertTriangle, Braces, Check, Clipboard, Download, FileCode2, Info, LoaderCircle, X } from 'lucide-react'
import { diagnosticNodeId, groupDiagnostics, type CompileResult, type StructuredDiagnostic } from '../../core/compiler'
import { useBuilderStore } from '../../store/useBuilderStore'
import { useProjectCompiles } from '../compiler/useProjectCompiles'
import type { TargetCompileState } from '../compiler/useTargetCompile'
import { localizeDiagnosticMessage, useI18n } from '../../i18n'
import { APP_VERSION_LABEL } from '../../version'
import { buildTargetExportArtifact, safeFilename } from '../compiler/exportFile'
import { outputDefinitions } from '../../data/demoProject'
import { SurgeProjectionSummary } from './SurgeProjectionSummary'

type PreviewMode = 'mihomo' | 'surge' | 'ir'
type DisplayIssue = StructuredDiagnostic

const targetMeta = {
  mihomo: { label: 'Mihomo', icon: '/third-party/mihomo-party/icon.png', descriptionKey: 'preview.yamlCompiler' as const },
  surge: { label: 'Surge', icon: outputDefinitions.find((output) => output.target === 'surge')!.icon, descriptionKey: 'preview.surgeCompiler' as const },
} as const

export function PreviewModal() {
  const { locale, t } = useI18n()
  const open = useBuilderStore((state) => state.previewOpen)
  const projectName = useBuilderStore((state) => state.projectName)
  const nodes = useBuilderStore((state) => state.nodes)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const previewTarget = useBuilderStore((state) => state.previewTarget)
  const setOpen = useBuilderStore((state) => state.setPreviewOpen)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const setToast = useBuilderStore((state) => state.setToast)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<PreviewMode>('mihomo')
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const { fitView } = useReactFlow()
  const targetCompileEnabled = open && mode !== 'ir'
  const { graphResult, mihomoState, surgeState } = useProjectCompiles(targetCompileEnabled, {
    mihomo: mode === 'mihomo', surge: mode === 'surge', singBox: false,
    validationTarget: mode === 'ir' ? undefined : mode,
  })
  const targetState = mode === 'surge' ? surgeState : mihomoState
  useEffect(() => {
    const requestedTarget = previewTarget ?? primaryTarget
    if (open) setMode(isPreviewTarget(requestedTarget) ? requestedTarget : 'mihomo')
  }, [open, previewTarget, primaryTarget])
  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])
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
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousRootOverflow
      window.requestAnimationFrame(() => returnFocusRef.current?.focus())
    }
  }, [open, setOpen])
  if (!open) return null

  const graphIssues: DisplayIssue[] = graphResult.issues.map((issue) => ({ ...issue, message: localizeDiagnosticMessage(issue.code, issue.message, locale) }))
  const targetIssues: DisplayIssue[] = (targetState.result?.issues ?? []).map((issue) => ({ ...issue, message: localizeDiagnosticMessage(issue.code, issue.message, locale) }))
  const loading = mode !== 'ir' && targetState.status === 'loading'
  const activeIssues = mode === 'ir' || !graphResult.success ? graphIssues : targetIssues
  const errors = activeIssues.filter((issue) => issue.severity === 'error')
  const warnings = activeIssues.filter((issue) => issue.severity === 'warning')
  const compileSuccess = mode === 'ir' ? graphResult.success : graphResult.success && targetState.status === 'success'
  const targetLabel = mode === 'ir' ? 'Universal IR' : targetMeta[mode].label
  const content = mode === 'ir'
    ? graphResult.ir ? `${JSON.stringify(graphResult.ir, null, 2)}\n` : issueLog(graphIssues)
    : targetState.result?.success ? targetState.result.content : issueLog(activeIssues)
  const artifact = mode === 'ir' ? undefined : buildTargetExportArtifact(projectName, mode, targetState.result)

  const copy = async () => {
    if (!compileSuccess) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  const download = () => {
    if (!compileSuccess) return
    const mimeType = mode === 'ir' ? 'application/json;charset=utf-8' : artifact?.mimeType
    if (!mimeType) return
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = mode === 'ir'
      ? `${safeFilename(projectName)}.ir.json`
      : artifact!.filename
    anchor.click()
    URL.revokeObjectURL(url)
    setToast(t('preview.exported', { target: targetLabel }))
  }

  const failedTitle = !graphResult.success ? t('preview.irFailed') : t('preview.targetFailed', { target: targetLabel })
  const loadError = targetState.error ? [{ code: 'TARGET_COMPILER_LOAD_FAILED', severity: 'error' as const, message: localizeDiagnosticMessage('TARGET_COMPILER_LOAD_FAILED', targetState.error, locale) }] : []
  const shownIssues = activeIssues.length > 0 ? activeIssues : loadError
  const availableNodeIds = new Set(nodes.map((node) => node.id))
  const locateIssue = (issue: DisplayIssue) => {
    const nodeId = diagnosticNodeId(issue, availableNodeIds)
    if (!nodeId) return
    setOpen(false)
    selectNode(nodeId)
    window.requestAnimationFrame(() => {
      void fitView({ nodes: [{ id: nodeId }], padding: 0.85, minZoom: 0.5, maxZoom: 1.25, duration: 450 })
    })
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
    <section ref={panelRef} className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div className="preview-icon">{mode === 'ir' ? <Braces size={19} /> : <FileCode2 size={19} />}</div>
        <div><span>{mode === 'ir' ? t('preview.developerPreview') : t('preview.realCompile')}</span><h2 id="preview-title">{targetLabel}</h2></div>
        <span className="preview-mock-pill">{mode === 'ir' ? 'IR V2' : APP_VERSION_LABEL}</span>
        <button ref={closeRef} onClick={() => setOpen(false)} aria-label={t('preview.closeAria')}><X size={18} /></button>
      </header>
      <div className="preview-status-region">
        <div className={`preview-notice${!compileSuccess && !loading ? ' is-error' : ''}`}>
          {loading ? <LoaderCircle className="spin" size={15} /> : !compileSuccess ? <AlertTriangle size={15} /> : <Info size={15} />}
          {loading
            ? <span><strong>{t('preview.loadingTitle')}</strong> {t('preview.loadingDescription', { target: targetLabel })}</span>
            : compileSuccess
              ? <span><strong>{mode === 'ir' ? t('preview.validIr') : t('preview.compiled')}</strong> {mode === 'ir' ? t('preview.irDerived') : t('preview.compileComplete', { target: targetLabel })}{warnings.length > 0 && ` ${t(warnings.length === 1 ? 'preview.compatWarning' : 'preview.compatWarnings', { count: warnings.length })}`}</span>
              : <span><strong>{failedTitle}</strong> {t('preview.failedCount', { count: Math.max(errors.length, loadError.length) })}</span>}
        </div>
        {mode === 'surge' && !loading && <SurgeProjectionSummary result={targetState.result} />}
      </div>
      <div className="preview-body">
        <aside>
          <span>{t('preview.mode')}</span>
          {(Object.keys(targetMeta) as Array<keyof typeof targetMeta>).map((target) => <button className={mode === target ? 'is-active' : ''} key={target} onClick={() => setMode(target)}><b><img src={targetMeta[target].icon} alt="" /></b><div><strong>{targetMeta[target].label}</strong><small>{t(targetMeta[target].descriptionKey)}</small></div>{mode === target && <Check size={13} />}</button>)}
          <button className={mode === 'ir' ? 'is-active' : ''} onClick={() => setMode('ir')}><b>{'{ }'}</b><div><strong><span className="preview-ir-short">IR</span><span className="preview-ir-long">Universal IR</span></strong><small>{t('preview.developerDebug')}</small></div>{mode === 'ir' && <Check size={13} />}</button>
          <span className="preview-subheading">{t('preview.targetCompilers')}</span>
          {targetCompileEnabled && graphResult.success && <CompatibilitySummary label={targetLabel} state={targetState} />}
          <div className="preview-stats"><span>{t('preview.blueprint')}</span><strong>{t('status.nodes', { count: nodes.length })}</strong><span>{mode === 'ir' ? t('preview.graphCompile') : t('preview.compatibility')}</span><strong className={compileSuccess ? 'good' : 'bad'}>{loading ? `… ${t('preview.loading')}` : compileSuccess ? warnings.length > 0 ? `⚠ ${t(warnings.length === 1 ? 'preview.warning' : 'preview.warnings', { count: warnings.length })}` : `✓ ${t('preview.compiled')}` : `× ${t('preview.errors', { count: Math.max(errors.length, loadError.length) })}`}</strong></div>
        </aside>
        <div className={`code-panel${!compileSuccess && !loading ? ' ir-failed' : ''}`}>
          <div className="code-toolbar"><span>{compileSuccess ? mode === 'ir' ? 'proxyflow.ir.json' : artifact?.filename : loading ? 'loading-compiler.log' : 'compile-issues.log'}</span><button onClick={copy} disabled={!compileSuccess}>{copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? t('preview.copied') : t('preview.copy')}</button></div>
          {loading
            ? <div className="ir-error-panel"><LoaderCircle className="spin" size={24} /><h3>{t('preview.loadingTitle')}</h3><p>{t('preview.loadingPanel')}</p></div>
            : !compileSuccess
              ? <IssuePanel title={failedTitle} issues={shownIssues} availableNodeIds={availableNodeIds} onLocate={locateIssue} />
              : <pre><code>{content}</code></pre>}
        </div>
      </div>
      <footer><span>{mode === 'ir' ? t('preview.irFooter') : t('preview.targetFooter', { target: targetLabel })}</span><div><button className="secondary-action" onClick={() => setOpen(false)}>{t('preview.close')}</button><button className="primary-action" onClick={download} disabled={!compileSuccess}><Download size={15} /> {mode === 'mihomo' ? t('preview.exportYaml') : mode === 'surge' ? t('preview.exportConf') : t('preview.exportJson')}</button></div></footer>
    </section>
  </div>
}

function isPreviewTarget(value: unknown): value is Exclude<PreviewMode, 'ir'> {
  return typeof value === 'string' && Object.hasOwn(targetMeta, value)
}

function CompatibilitySummary({ label, state }: { label: string; state: TargetCompileState }) {
  return <div className="preview-compatibility-summary">
    <span><CompatibilitySummaryLabel /></span>
    <CompatibilityRow label={label} state={state} />
  </div>
}

function CompatibilitySummaryLabel() {
  const { t } = useI18n()
  return <>{t('preview.compatibilitySummary')}</>
}

function CompatibilityRow({ label, state }: { label: string; state: TargetCompileState }) {
  const { t } = useI18n()
  const warningCount = state.result?.issues.filter((issue: CompileResult['issues'][number]) => issue.severity === 'warning').length ?? 0
  const status = state.status === 'success' && warningCount === 0
    ? 'supported'
    : state.status === 'success'
      ? 'warning'
      : state.status === 'loading'
        ? 'loading'
        : state.status === 'unavailable'
          ? 'unavailable'
          : 'blocked'
  const statusText = status === 'supported'
    ? t('preview.compatibility.supported')
    : status === 'warning'
      ? t(warningCount === 1 ? 'preview.compatibility.oneWarning' : 'preview.compatibility.warning', { count: warningCount })
      : status === 'loading'
        ? t('preview.compatibility.loading')
        : status === 'unavailable'
          ? t('preview.compatibility.unavailable')
          : t('preview.compatibility.blocked')
  return <div className="preview-compatibility-row"><strong>{label}</strong><span className={`compatibility-status is-${status}`}>{statusText}</span></div>
}

function IssuePanel({ title, issues, availableNodeIds, onLocate }: { title: string; issues: DisplayIssue[]; availableNodeIds: ReadonlySet<string>; onLocate: (issue: DisplayIssue) => void }) {
  const { t } = useI18n()
  const grouped = groupDiagnostics(issues)
  return <div className="ir-error-panel"><AlertTriangle size={24} /><h3>{title}</h3><p>{t('preview.fixIssues')}</p><div>{grouped.map(({ issue, count }, index) => {
    const locatable = Boolean(diagnosticNodeId(issue, availableNodeIds))
    return <article key={`${issue.code}-${issue.entityId ?? issue.nodeId ?? index}`}><span>{t(`issue.severity.${issue.severity}`)}{count > 1 && <em>× {count}</em>}</span><code>{issue.code}</code><p>{issue.message}</p>{locatable && <button type="button" onClick={() => onLocate(issue)}>{t('preview.locateNode')}</button>}</article>
  })}</div></div>
}

function issueLog(issues: DisplayIssue[]) {
  return issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.code}\n${issue.message}`).join('\n\n')
}
