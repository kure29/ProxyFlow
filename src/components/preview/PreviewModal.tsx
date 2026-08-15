import { useState } from 'react'
import { Check, Clipboard, Download, FileCode2, Info, X } from 'lucide-react'
import { mockMihomoPreview } from '../../data/demoProject'
import { useBuilderStore } from '../../store/useBuilderStore'

export function PreviewModal() {
  const open = useBuilderStore((state) => state.previewOpen)
  const setOpen = useBuilderStore((state) => state.setPreviewOpen)
  const setToast = useBuilderStore((state) => state.setToast)
  const [copied, setCopied] = useState(false)
  if (!open) return null

  const copy = async () => {
    await navigator.clipboard.writeText(mockMihomoPreview)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([mockMihomoPreview], { type: 'text/yaml;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'proxyflow-mihomo-mock.yaml'
    anchor.click()
    URL.revokeObjectURL(url)
    setToast('Mock Mihomo 配置已导出')
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
    <section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div className="preview-icon"><FileCode2 size={19} /></div><div><span>CONFIG PREVIEW</span><h2 id="preview-title">Mihomo Preview</h2></div><span className="preview-mock-pill">MOCK</span><button onClick={() => setOpen(false)} aria-label="关闭预览"><X size={18} /></button></header>
      <div className="preview-notice"><Info size={15} /><span><strong>原型预览</strong> 这份内容用于验证信息结构，并非完整编译结果。</span></div>
      <div className="preview-body">
        <aside><span>OUTPUT TARGET</span><button className="is-active"><b>M</b><div><strong>Mihomo</strong><small>Supported</small></div><Check size={13} /></button><button disabled><b>S</b><div><strong>sing-box</strong><small>Prototype</small></div></button><button disabled><b>↗</b><div><strong>Surge</strong><small>Coming soon</small></div></button><div className="preview-stats"><span>Blueprint</span><strong>14 Nodes</strong><span>Compatibility</span><strong className="good">✓ Supported</strong></div></aside>
        <div className="code-panel"><div className="code-toolbar"><span>proxyflow.yaml</span><button onClick={copy}>{copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? '已复制' : '复制'}</button></div><pre><code>{mockMihomoPreview}</code></pre></div>
      </div>
      <footer><span>由 ProxyFlow Mock Compiler 生成</span><div><button className="secondary-action" onClick={() => setOpen(false)}>关闭</button><button className="primary-action" onClick={download}><Download size={15} /> 导出 Mock</button></div></footer>
    </section>
  </div>
}
