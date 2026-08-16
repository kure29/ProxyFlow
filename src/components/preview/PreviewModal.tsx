import { useMemo, useState } from 'react'
import { AlertTriangle, Braces, Check, Clipboard, Download, FileCode2, Info, LoaderCircle, X } from 'lucide-react'
import { compileGraph } from '../../core/graphCompiler'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { TargetClient } from '../../types/project'
import { useTargetCompile } from '../compiler/useTargetCompile'

type PreviewMode = 'mihomo' | 'sing-box' | 'ir'
type DisplayIssue = { code: string; severity: 'info' | 'warning' | 'error'; message: string }

const targetMeta = {
  mihomo: { label: 'Mihomo', badge: 'M', description: 'YAML compiler', extension: 'yaml' },
  'sing-box': { label: 'sing-box', badge: 'S', description: 'JSON compiler', extension: 'json' },
} as const

export function PreviewModal() {
  const open = useBuilderStore((state) => state.previewOpen)
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const setOpen = useBuilderStore((state) => state.setPreviewOpen)
  const setToast = useBuilderStore((state) => state.setToast)
  const toProject = useBuilderStore((state) => state.toProject)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<PreviewMode>('mihomo')
  const graphResult = useMemo(() => compileGraph(toProject(), { subscriptionSnapshots }), [edges, nodes, projectId, projectName, subscriptionSnapshots, toProject])
  const activeTarget: TargetClient | undefined = mode === 'ir' ? undefined : mode
  const targetState = useTargetCompile(graphResult.ir, activeTarget, open && graphResult.success && mode !== 'ir')
  if (!open) return null

  const graphIssues: DisplayIssue[] = graphResult.issues.map(({ code, severity, message }) => ({ code, severity, message }))
  const targetIssues: DisplayIssue[] = targetState.result?.issues ?? []
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
    setToast(`${targetLabel} 已导出`)
  }

  const failedTitle = !graphResult.success ? 'IR compilation failed' : `Cannot compile for ${targetLabel}`
  const loadError = targetState.error ? [{ code: 'TARGET_COMPILER_LOAD_FAILED', severity: 'error' as const, message: targetState.error }] : []
  const shownIssues = activeIssues.length > 0 ? activeIssues : loadError
  return <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
    <section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div className="preview-icon">{mode === 'ir' ? <Braces size={19} /> : <FileCode2 size={19} />}</div>
        <div><span>{mode === 'ir' ? 'DEVELOPER PREVIEW' : 'REAL TARGET COMPILE'}</span><h2 id="preview-title">{targetLabel}</h2></div>
        <span className="preview-mock-pill">{mode === 'ir' ? 'IR V2' : 'V0.5'}</span>
        <button onClick={() => setOpen(false)} aria-label="关闭预览"><X size={18} /></button>
      </header>
      <div className={`preview-notice${!compileSuccess && !loading ? ' is-error' : ''}`}>
        {loading ? <LoaderCircle className="spin" size={15} /> : !compileSuccess ? <AlertTriangle size={15} /> : <Info size={15} />}
        {loading
          ? <span><strong>Loading compiler…</strong> 正在按需加载 {targetLabel} Compiler。</span>
          : compileSuccess
            ? <span><strong>{mode === 'ir' ? 'Valid IR' : 'Compiled'}</strong> {mode === 'ir' ? 'IR 由当前 Graph 实时派生。' : `Graph → IR → ${targetLabel} 已真实完成。`}{warnings.length > 0 && ` ${warnings.length} 个 compatibility warnings。`}</span>
            : <span><strong>{failedTitle}</strong> {Math.max(errors.length, loadError.length)} 个 errors；不会生成或回退到 Mock 配置。</span>}
      </div>
      <div className="preview-body">
        <aside>
          <span>PREVIEW MODE</span>
          {(Object.keys(targetMeta) as Array<keyof typeof targetMeta>).map((target) => <button className={mode === target ? 'is-active' : ''} key={target} onClick={() => setMode(target)}><b>{targetMeta[target].badge}</b><div><strong>{targetMeta[target].label}</strong><small>{targetMeta[target].description}</small></div>{mode === target && <Check size={13} />}</button>)}
          <button className={mode === 'ir' ? 'is-active' : ''} onClick={() => setMode('ir')}><b>{'{ }'}</b><div><strong>Universal IR</strong><small>Developer debug</small></div>{mode === 'ir' && <Check size={13} />}</button>
          <span className="preview-subheading">TARGET COMPILERS</span>
          <button disabled><b>↗</b><div><strong>Surge</strong><small>Not implemented</small></div></button>
          <div className="preview-stats"><span>Blueprint</span><strong>{nodes.length} Nodes</strong><span>{mode === 'ir' ? 'Graph compile' : 'Compatibility'}</span><strong className={compileSuccess ? 'good' : 'bad'}>{loading ? '… Loading' : compileSuccess ? warnings.length > 0 ? `⚠ ${warnings.length} Warnings` : '✓ Compiled' : `× ${Math.max(errors.length, loadError.length)} Errors`}</strong></div>
        </aside>
        <div className={`code-panel${!compileSuccess && !loading ? ' ir-failed' : ''}`}>
          <div className="code-toolbar"><span>{compileSuccess ? mode === 'ir' ? 'proxyflow.ir.json' : `proxyflow-${mode}.${targetMeta[mode].extension}` : loading ? 'loading-compiler.log' : 'compile-issues.log'}</span><button onClick={copy} disabled={!compileSuccess}>{copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? '已复制' : '复制'}</button></div>
          {loading
            ? <div className="ir-error-panel"><LoaderCircle className="spin" size={24} /><h3>Loading compiler…</h3><p>目标代码正在进入当前会话。</p></div>
            : !compileSuccess
              ? <IssuePanel title={failedTitle} issues={shownIssues} />
              : <pre><code>{content}</code></pre>}
        </div>
      </div>
      <footer><span>{mode === 'ir' ? '由 Graph Compiler 实时派生 · 不写入项目存储' : `由真实 ${targetLabel} Compiler 生成 · mock=false`}</span><div><button className="secondary-action" onClick={() => setOpen(false)}>关闭</button><button className="primary-action" onClick={download} disabled={!compileSuccess}><Download size={15} /> {mode === 'mihomo' ? '导出 YAML' : '导出 JSON'}</button></div></footer>
    </section>
  </div>
}

function IssuePanel({ title, issues }: { title: string; issues: DisplayIssue[] }) {
  return <div className="ir-error-panel"><AlertTriangle size={24} /><h3>{title}</h3><p>修复以下问题后才能生成目标配置。</p><div>{issues.map((issue, index) => <article key={`${issue.code}-${index}`}><span>{issue.severity}</span><code>{issue.code}</code><p>{issue.message}</p></article>)}</div></div>
}

function issueLog(issues: DisplayIssue[]) {
  return issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.code}\n${issue.message}`).join('\n\n')
}

function safeFilename(value: string) {
  return value.trim().replaceAll(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replaceAll(/\s+/g, '-').slice(0, 72) || 'proxyflow'
}
