import { useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { AlertTriangle, Braces, Check, Clipboard, Download, FileCode2, Info, LoaderCircle, X } from 'lucide-react'
import { diagnosticNodeId, groupDiagnostics, type CompileResult, type StructuredDiagnostic } from '../../core/compiler'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { TargetClient } from '../../types/project'
import { useProjectCompiles } from '../compiler/useProjectCompiles'
import type { TargetCompileState } from '../compiler/useTargetCompile'
import { localizeDiagnosticMessage, useI18n } from '../../i18n'
import { APP_VERSION_LABEL } from '../../version'

type PreviewMode = 'mihomo' | 'sing-box' | 'ir'
type DisplayIssue = StructuredDiagnostic

const targetMeta = {
  mihomo: { label: 'Mihomo', icon: '/third-party/mihomo-party/icon.png', descriptionKey: 'preview.yamlCompiler' as const, extension: 'yaml' },
  'sing-box': { label: 'sing-box', icon: '/third-party/sing-box/icon.svg', descriptionKey: 'preview.jsonCompiler' as const, extension: 'json' },
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
  const { fitView } = useReactFlow()
  const targetCompileEnabled = open && mode !== 'ir'
  const { graphResult, mihomoState, singBoxState } = useProjectCompiles(targetCompileEnabled)
  const activeTarget: TargetClient | undefined = mode === 'ir' ? undefined : mode
  const targetState = activeTarget === 'sing-box' ? singBoxState : mihomoState
  useEffect(() => {
    if (open) setMode(previewTarget ?? primaryTarget ?? 'mihomo')
  }, [open, previewTarget, primaryTarget])
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

  const copy = async () => {
    if (!compileSuccess) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  const download = () => {
    if (!compileSuccess) return
    const isYaml = mode === 'mihomo'
    const url = URL.createObjectURL(new Blob([content], { type: isYaml ? 'text/yaml;charset=utf-8' : 'application/json;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = mode === 'ir'
      ? `${safeFilename(projectName)}.ir.json`
      : `${safeFilename(projectName)}-${mode}.${targetMeta[mode].extension}`
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
    <section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div className="preview-icon">{mode === 'ir' ? <Braces size={19} /> : <FileCode2 size={19} />}</div>
        <div><span>{mode === 'ir' ? t('preview.developerPreview') : t('preview.realCompile')}</span><h2 id="preview-title">{targetLabel}</h2></div>
        <span className="preview-mock-pill">{mode === 'ir' ? 'IR V2' : APP_VERSION_LABEL}</span>
        <button onClick={() => setOpen(false)} aria-label={t('preview.closeAria')}><X size={18} /></button>
      </header>
      <div className={`preview-notice${!compileSuccess && !loading ? ' is-error' : ''}`}>
        {loading ? <LoaderCircle className="spin" size={15} /> : !compileSuccess ? <AlertTriangle size={15} /> : <Info size={15} />}
        {loading
          ? <span><strong>{t('preview.loadingTitle')}</strong> {t('preview.loadingDescription', { target: targetLabel })}</span>
          : compileSuccess
            ? <span><strong>{mode === 'ir' ? t('preview.validIr') : t('preview.compiled')}</strong> {mode === 'ir' ? t('preview.irDerived') : t('preview.compileComplete', { target: targetLabel })}{warnings.length > 0 && ` ${t(warnings.length === 1 ? 'preview.compatWarning' : 'preview.compatWarnings', { count: warnings.length })}`}</span>
            : <span><strong>{failedTitle}</strong> {t('preview.failedCount', { count: Math.max(errors.length, loadError.length) })}</span>}
      </div>
      <div className="preview-body">
        <aside>
          <span>{t('preview.mode')}</span>
          {(Object.keys(targetMeta) as Array<keyof typeof targetMeta>).map((target) => <button className={mode === target ? 'is-active' : ''} key={target} onClick={() => setMode(target)}><b><img src={targetMeta[target].icon} alt="" /></b><div><strong>{targetMeta[target].label}</strong><small>{t(targetMeta[target].descriptionKey)}</small></div>{mode === target && <Check size={13} />}</button>)}
          <button className={mode === 'ir' ? 'is-active' : ''} onClick={() => setMode('ir')}><b>{'{ }'}</b><div><strong>Universal IR</strong><small>{t('preview.developerDebug')}</small></div>{mode === 'ir' && <Check size={13} />}</button>
          <span className="preview-subheading">{t('preview.targetCompilers')}</span>
          <button disabled><b>↗</b><div><strong>Surge</strong><small>{t('preview.notImplemented')}</small></div></button>
          {targetCompileEnabled && graphResult.success && <CompatibilitySummary mihomo={mihomoState} singBox={singBoxState} />}
          <div className="preview-stats"><span>{t('preview.blueprint')}</span><strong>{t('status.nodes', { count: nodes.length })}</strong><span>{mode === 'ir' ? t('preview.graphCompile') : t('preview.compatibility')}</span><strong className={compileSuccess ? 'good' : 'bad'}>{loading ? `… ${t('preview.loading')}` : compileSuccess ? warnings.length > 0 ? `⚠ ${t(warnings.length === 1 ? 'preview.warning' : 'preview.warnings', { count: warnings.length })}` : `✓ ${t('preview.compiled')}` : `× ${t('preview.errors', { count: Math.max(errors.length, loadError.length) })}`}</strong></div>
        </aside>
        <div className={`code-panel${!compileSuccess && !loading ? ' ir-failed' : ''}`}>
          <div className="code-toolbar"><span>{compileSuccess ? mode === 'ir' ? 'proxyflow.ir.json' : `proxyflow-${mode}.${targetMeta[mode].extension}` : loading ? 'loading-compiler.log' : 'compile-issues.log'}</span><button onClick={copy} disabled={!compileSuccess}>{copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? t('preview.copied') : t('preview.copy')}</button></div>
          {loading
            ? <div className="ir-error-panel"><LoaderCircle className="spin" size={24} /><h3>{t('preview.loadingTitle')}</h3><p>{t('preview.loadingPanel')}</p></div>
            : !compileSuccess
              ? <IssuePanel title={failedTitle} issues={shownIssues} availableNodeIds={availableNodeIds} onLocate={locateIssue} />
              : <pre><code>{content}</code></pre>}
        </div>
      </div>
      <footer><span>{mode === 'ir' ? t('preview.irFooter') : t('preview.targetFooter', { target: targetLabel })}</span><div><button className="secondary-action" onClick={() => setOpen(false)}>{t('preview.close')}</button><button className="primary-action" onClick={download} disabled={!compileSuccess}><Download size={15} /> {mode === 'mihomo' ? t('preview.exportYaml') : t('preview.exportJson')}</button></div></footer>
    </section>
  </div>
}

function CompatibilitySummary({ mihomo, singBox }: { mihomo: TargetCompileState; singBox: TargetCompileState }) {
  return <div className="preview-compatibility-summary">
    <span><CompatibilitySummaryLabel /></span>
    <CompatibilityRow label="Mihomo" state={mihomo} />
    <CompatibilityRow label="sing-box" state={singBox} />
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

function safeFilename(value: string) {
  return value.trim().replaceAll(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replaceAll(/\s+/g, '-').slice(0, 72) || 'proxyflow'
}
