import { useMemo, useState } from 'react'
import { AlertTriangle, Braces, Check, Clipboard, Download, FileCode2, Info, X } from 'lucide-react'
import { compileGraph } from '../../core/graphCompiler'
import { compileMihomo } from '../../targets/mihomo'
import { useBuilderStore } from '../../store/useBuilderStore'

type PreviewMode = 'mihomo' | 'ir'
type DisplayIssue = { code: string; severity: 'info' | 'warning' | 'error'; message: string }

export function PreviewModal() {
  const open = useBuilderStore((state) => state.previewOpen)
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const setOpen = useBuilderStore((state) => state.setPreviewOpen)
  const setToast = useBuilderStore((state) => state.setToast)
  const toProject = useBuilderStore((state) => state.toProject)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<PreviewMode>('mihomo')
  const graphResult = useMemo(() => compileGraph(toProject()), [edges, nodes, projectId, projectName, toProject])
  const mihomoResult = useMemo(() => graphResult.ir ? compileMihomo(graphResult.ir) : undefined, [graphResult])
  if (!open) return null

  const graphIssues: DisplayIssue[] = graphResult.issues.map(({ code, severity, message }) => ({ code, severity, message }))
  const targetIssues: DisplayIssue[] = mihomoResult?.issues ?? []
  const activeIssues = mode === 'ir' || !graphResult.success ? graphIssues : targetIssues
  const errors = activeIssues.filter((issue) => issue.severity === 'error')
  const warnings = activeIssues.filter((issue) => issue.severity === 'warning')
  const compileSuccess = mode === 'ir' ? graphResult.success : graphResult.success && Boolean(mihomoResult?.success)
  const content = mode === 'ir'
    ? graphResult.ir ? JSON.stringify(graphResult.ir, null, 2) : issueLog(graphIssues)
    : mihomoResult?.success ? mihomoResult.content : issueLog(activeIssues)

  const copy = async () => {
    if (!compileSuccess) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  const download = () => {
    if (!compileSuccess) return
    const isMihomo = mode === 'mihomo'
    const url = URL.createObjectURL(new Blob([content], { type: isMihomo ? 'text/yaml;charset=utf-8' : 'application/json;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = isMihomo ? `${safeFilename(projectName)}-mihomo.yaml` : `${safeFilename(projectName)}.ir.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setToast(isMihomo ? '真实 Mihomo YAML 已导出' : 'Universal IR 已导出')
  }

  const failedTitle = !graphResult.success ? 'IR compilation failed' : 'Cannot compile for Mihomo'
  return <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
    <section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div className="preview-icon">{mode === 'mihomo' ? <FileCode2 size={19} /> : <Braces size={19} />}</div>
        <div><span>{mode === 'mihomo' ? 'REAL TARGET COMPILE' : 'DEVELOPER PREVIEW'}</span><h2 id="preview-title">{mode === 'mihomo' ? 'Mihomo' : 'Universal IR'}</h2></div>
        <span className="preview-mock-pill">{mode === 'mihomo' ? 'MVP' : 'IR V2'}</span>
        <button onClick={() => setOpen(false)} aria-label="关闭预览"><X size={18} /></button>
      </header>
      <div className={`preview-notice${!compileSuccess ? ' is-error' : ''}`}>
        {!compileSuccess ? <AlertTriangle size={15} /> : <Info size={15} />}
        {compileSuccess
          ? <span><strong>{mode === 'mihomo' ? 'Compiled' : 'Valid IR'}</strong> {mode === 'mihomo' ? 'Graph → IR → Mihomo YAML 已真实完成。' : 'IR 由当前 Graph 实时派生。'}{warnings.length > 0 && ` ${warnings.length} 个 compatibility warnings。`}</span>
          : <span><strong>{failedTitle}</strong> {errors.length} 个 errors；不会生成或回退到 Mock 配置。</span>}
      </div>
      <div className="preview-body">
        <aside>
          <span>PREVIEW MODE</span>
          <button className={mode === 'mihomo' ? 'is-active' : ''} onClick={() => setMode('mihomo')}><b>M</b><div><strong>Mihomo</strong><small>Real compiler MVP</small></div>{mode === 'mihomo' && <Check size={13} />}</button>
          <button className={mode === 'ir' ? 'is-active' : ''} onClick={() => setMode('ir')}><b>{'{ }'}</b><div><strong>Universal IR</strong><small>Developer debug</small></div>{mode === 'ir' && <Check size={13} />}</button>
          <span className="preview-subheading">TARGET COMPILERS</span>
          <button disabled><b>S</b><div><strong>sing-box</strong><small>Not implemented</small></div></button>
          <button disabled><b>↗</b><div><strong>Surge</strong><small>Not implemented</small></div></button>
          <div className="preview-stats"><span>Blueprint</span><strong>{nodes.length} Nodes</strong><span>{mode === 'mihomo' ? 'Compatibility' : 'Graph compile'}</span><strong className={compileSuccess ? 'good' : 'bad'}>{compileSuccess ? warnings.length > 0 ? `⚠ ${warnings.length} Warnings` : '✓ Compiled' : `× ${errors.length} Errors`}</strong></div>
        </aside>
        <div className={`code-panel${!compileSuccess ? ' ir-failed' : ''}`}>
          <div className="code-toolbar"><span>{compileSuccess ? mode === 'mihomo' ? 'proxyflow-mihomo.yaml' : 'proxyflow.ir.json' : 'compile-issues.log'}</span><button onClick={copy} disabled={!compileSuccess}>{copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? '已复制' : '复制'}</button></div>
          {!compileSuccess
            ? <IssuePanel title={failedTitle} issues={activeIssues} />
            : <pre><code>{content}</code></pre>}
        </div>
      </div>
      <footer><span>{mode === 'mihomo' ? '由真实 Mihomo Compiler 生成 · mock=false' : '由 Graph Compiler 实时派生 · 不写入项目存储'}</span><div><button className="secondary-action" onClick={() => setOpen(false)}>关闭</button><button className="primary-action" onClick={download} disabled={!compileSuccess}><Download size={15} /> {mode === 'mihomo' ? '导出 YAML' : '导出 JSON'}</button></div></footer>
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
