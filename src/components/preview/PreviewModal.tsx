import { useMemo, useState } from 'react'
import { AlertTriangle, Braces, Check, Clipboard, Download, FileCode2, Info, X } from 'lucide-react'
import { compileGraph } from '../../core/graphCompiler'
import { mockMihomoPreview } from '../../data/demoProject'
import { useBuilderStore } from '../../store/useBuilderStore'

type PreviewMode = 'mock' | 'ir'

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
  const [mode, setMode] = useState<PreviewMode>('mock')
  const graphResult = useMemo(() => compileGraph(toProject()), [edges, nodes, projectId, projectName, toProject])
  if (!open) return null

  const errors = graphResult.issues.filter((issue) => issue.severity === 'error')
  const warnings = graphResult.issues.filter((issue) => issue.severity === 'warning')
  const irContent = graphResult.ir ? JSON.stringify(graphResult.ir, null, 2) : graphResult.issues
    .map((issue) => `${issue.severity.toUpperCase()} ${issue.code}\n${issue.message}`)
    .join('\n\n')
  const content = mode === 'mock' ? mockMihomoPreview : irContent

  const copy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  const download = () => {
    const type = mode === 'mock' ? 'text/yaml;charset=utf-8' : 'application/json;charset=utf-8'
    const url = URL.createObjectURL(new Blob([content], { type }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = mode === 'mock' ? 'proxyflow-mihomo-mock.yaml' : 'proxyflow-universal-ir.json'
    anchor.click()
    URL.revokeObjectURL(url)
    setToast(mode === 'mock' ? 'Mock Mihomo 配置已导出' : 'Universal IR 已导出')
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
    <section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div className="preview-icon">{mode === 'mock' ? <FileCode2 size={19} /> : <Braces size={19} />}</div>
        <div><span>{mode === 'mock' ? 'CONFIG PREVIEW' : 'DEVELOPER PREVIEW'}</span><h2 id="preview-title">{mode === 'mock' ? 'Mihomo Preview' : 'Universal IR'}</h2></div>
        <span className="preview-mock-pill">{mode === 'mock' ? 'MOCK' : 'IR V1'}</span>
        <button onClick={() => setOpen(false)} aria-label="关闭预览"><X size={18} /></button>
      </header>
      <div className={`preview-notice${mode === 'ir' && !graphResult.success ? ' is-error' : ''}`}>
        {mode === 'ir' && !graphResult.success ? <AlertTriangle size={15} /> : <Info size={15} />}
        {mode === 'mock'
          ? <span><strong>原型预览</strong> 这份内容用于验证信息结构，并非完整编译结果。</span>
          : graphResult.success
            ? <span><strong>Graph Compiler</strong> Visual Graph 已编译为客户端无关 IR。{warnings.length > 0 && `包含 ${warnings.length} 个 warning。`}</span>
            : <span><strong>IR compilation failed</strong> {errors.length} 个 semantic errors，未生成伪 IR。</span>}
      </div>
      <div className="preview-body">
        <aside>
          <span>PREVIEW MODE</span>
          <button className={mode === 'mock' ? 'is-active' : ''} onClick={() => setMode('mock')}><b>M</b><div><strong>Mihomo Mock</strong><small>Visual prototype</small></div>{mode === 'mock' && <Check size={13} />}</button>
          <button className={mode === 'ir' ? 'is-active' : ''} onClick={() => setMode('ir')}><b>{'{ }'}</b><div><strong>Universal IR</strong><small>Developer debug</small></div>{mode === 'ir' && <Check size={13} />}</button>
          <span className="preview-subheading">TARGET COMPILERS</span>
          <button disabled><b>S</b><div><strong>sing-box</strong><small>Not implemented</small></div></button>
          <button disabled><b>↗</b><div><strong>Surge</strong><small>Not implemented</small></div></button>
          <div className="preview-stats"><span>Blueprint</span><strong>{nodes.length} Nodes</strong><span>Graph compile</span><strong className={graphResult.success ? 'good' : 'bad'}>{graphResult.success ? '✓ Valid IR' : `× ${errors.length} Errors`}</strong></div>
        </aside>
        <div className={`code-panel${mode === 'ir' && !graphResult.success ? ' ir-failed' : ''}`}>
          <div className="code-toolbar"><span>{mode === 'mock' ? 'proxyflow.yaml' : graphResult.success ? 'proxyflow.ir.json' : 'semantic-issues.log'}</span><button onClick={copy}>{copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? '已复制' : '复制'}</button></div>
          {mode === 'ir' && !graphResult.success
            ? <div className="ir-error-panel"><AlertTriangle size={24} /><h3>IR compilation failed</h3><p>修复以下语义问题后才能生成 Universal IR。</p><div>{graphResult.issues.map((issue, index) => <article key={`${issue.code}-${index}`}><span>{issue.severity}</span><code>{issue.code}</code><p>{issue.message}</p></article>)}</div></div>
            : <pre><code>{content}</code></pre>}
        </div>
      </div>
      <footer><span>{mode === 'mock' ? '由 ProxyFlow Mock Compiler 生成' : '由 ProxyFlow Graph Compiler 实时派生 · 不写入项目存储'}</span><div><button className="secondary-action" onClick={() => setOpen(false)}>关闭</button><button className="primary-action" onClick={download} disabled={mode === 'ir' && !graphResult.success}><Download size={15} /> {mode === 'mock' ? '导出 Mock' : '导出 JSON'}</button></div></footer>
    </section>
  </div>
}
