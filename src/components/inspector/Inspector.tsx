import { useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, Check, ChevronDown, ExternalLink,
  ClipboardPaste, Eye, FileUp, GripVertical, Link2, Plus, RefreshCw, ShieldCheck, Trash2, X,
} from 'lucide-react'
import { useBuilderStore } from '../../store/useBuilderStore'
import { validateGraph } from '../../core/validation/validateProject'
import { outputDefinitions } from '../../data/demoProject'
import { compileGraph } from '../../core/graphCompiler'
import type { BlockNodeData, GraphNode } from '../../types/project'
import { BlockIcon } from '../icons/BlockIcon'
import { useTargetCompile } from '../compiler/useTargetCompile'
import { NodesPreview } from '../subscription/NodesPreview'
import { proxyProtocolLabel, REGION_OPTIONS, type RegionCode, type SupportedProxyProtocol } from '../../core/proxy'
import { createMaterializationContext, deriveProjectRuntime, materializeProxySet } from '../../core/proxySet'

interface InspectorProps { node: GraphNode }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="inspector-field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>
}

function TextField({ node, field, label, placeholder }: { node: GraphNode; field: keyof BlockNodeData; label: string; placeholder?: string }) {
  const update = useBuilderStore((state) => state.updateNodeData)
  return <Field label={label}><input value={String(node.data[field] ?? '')} placeholder={placeholder} onChange={(event) => update(node.id, { [field]: event.target.value })} /></Field>
}

function Advanced({ children }: { children: React.ReactNode }) {
  return <details className="advanced-panel"><summary>高级设置 <ChevronDown size={14} /></summary><div>{children}</div></details>
}

function SubscriptionInspector({ node }: InspectorProps) {
  const update = useBuilderStore((state) => state.updateNodeData)
  const snapshot = useBuilderStore((state) => state.subscriptionSnapshots[node.id])
  const refresh = useBuilderStore((state) => state.refreshSubscription)
  const parseInput = useBuilderStore((state) => state.parseSubscriptionInput)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [paste, setPaste] = useState(node.data.subscriptionInputKind === 'paste' ? node.data.subscriptionContent ?? '' : '')
  const [nodesOpen, setNodesOpen] = useState(false)
  const [nodePreviewStatus, setNodePreviewStatus] = useState<'all' | 'issues'>('all')
  const fileRef = useRef<HTMLInputElement>(null)
  const result = snapshot?.result
  const protocols = summarize(result?.proxies.map((proxy) => proxy.protocol) ?? [])
  const regions = summarize(result?.proxies.map((proxy) => proxy.metadata?.region?.code ?? 'UNKNOWN') ?? [])
  const onFile = async (file?: File) => {
    if (!file) return
    await parseInput(node.id, await file.text(), 'file', file.name)
  }
  return <>
    <TextField node={node} field="title" label="名称" />
    <TextField node={node} field="subscriptionUrl" label="订阅地址" placeholder="https://…" />
    <label className="toggle-row"><span><strong>启用订阅</strong><small>参与节点更新与后续流程</small></span><input type="checkbox" checked={node.data.enabled ?? false} onChange={(event) => update(node.id, { enabled: event.target.checked })} /></label>
    <div className={`source-status-card is-${snapshot?.fetchStatus ?? 'idle'}`}><span>FETCH STATUS</span><strong>{sourceStatus(snapshot?.fetchStatus)}</strong><small>{snapshot?.latestErrorMessage ?? (result ? `Detected ${formatLabel(result.format)}` : '等待 URL、粘贴内容或本地文件')}</small></div>
    {snapshot && <div className="source-timestamps"><div><span>LAST SUCCESSFUL</span><strong>{formatSourceTimestamp(snapshot.lastSuccessfulAt)}</strong></div><div><span>LATEST ATTEMPT</span><strong>{formatSourceTimestamp(snapshot.latestAttemptAt)}</strong></div></div>}
    <div className="metric-cards"><div><span>Detected</span><strong>{result?.detectedCount ?? 0}</strong></div><div><span>Usable</span><strong>{result?.readyCount ?? 0}</strong></div></div>
    {result && <div className="import-summary"><div><span>READY</span><strong>{result.readyCount}</strong></div><div><span>WARNINGS</span><strong>{result.partialCount}</strong></div><div><span>UNSUPPORTED</span><strong>{result.unsupportedCount}</strong></div></div>}
    {protocols.length > 0 && <SummaryList label="Protocols" items={protocols} />}
    {regions.length > 0 && <SummaryList label="Regions" items={regions} />}
    <div className="subscription-actions"><button className="inspector-secondary-button" disabled={snapshot?.fetchStatus === 'loading'} onClick={() => void refresh(node.id)}><RefreshCw className={snapshot?.fetchStatus === 'loading' ? 'spin' : ''} size={14} /> Refresh</button><button className="inspector-secondary-button" onClick={() => setPasteOpen((open) => !open)}><ClipboardPaste size={14} /> Paste Content</button><button className="inspector-secondary-button" onClick={() => fileRef.current?.click()}><FileUp size={14} /> Import File</button><button className="inspector-secondary-button" disabled={!result?.nodes.length} onClick={() => { setNodePreviewStatus('all'); setNodesOpen(true) }}><Eye size={14} /> View Nodes</button><button className="inspector-secondary-button" disabled={!result || result.partialCount + result.unsupportedCount === 0} onClick={() => { setNodePreviewStatus('issues'); setNodesOpen(true) }}><AlertTriangle size={14} /> View Issues</button></div>
    <input ref={fileRef} className="visually-hidden" type="file" accept=".txt,.yaml,.yml,text/plain,text/yaml,application/yaml" onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = '' }} />
    {pasteOpen && <div className="subscription-paste"><textarea value={paste} onChange={(event) => setPaste(event.target.value)} placeholder={'vmess://…\nvless://…\nss://…'} /><button className="inspector-primary-button" disabled={!paste.trim()} onClick={() => { void parseInput(node.id, paste, 'paste'); setPasteOpen(false) }}>识别并导入</button></div>}
    {snapshot?.stale && <div className="validation-banner validation-banner--warning"><AlertTriangle size={15} /><span><strong>Refresh failed</strong>Using previous cached result</span></div>}
    {node.data.subscriptionInputKind === 'file' && !snapshot && <div className="mock-note">File needs re-import：浏览器重新打开后无法自动访问原本地文件。</div>}
    {nodesOpen && <NodesPreview snapshot={snapshot} initialStatus={nodePreviewStatus} onClose={() => setNodesOpen(false)} />}
  </>
}

function SummaryList({ label, items }: { label: string; items: Array<[string, number]> }) {
  return <div className="source-summary-list"><span>{label}</span>{items.slice(0, 6).map(([name, count]) => <div key={name}><strong>{name}</strong><b>{count}</b></div>)}</div>
}

function summarize(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
}

function sourceStatus(status?: string) {
  if (status === 'ready') return 'Ready'
  if (status === 'loading') return 'Refreshing…'
  if (status === 'cors') return 'CORS blocked'
  if (status === 'failed') return 'Failed'
  return 'Not parsed'
}

function formatLabel(format: string) {
  return ({ base64: 'Base64', 'share-links': 'Share Links', 'clash-yaml': 'Clash YAML', unsupported: 'Unsupported' } as Record<string, string>)[format] ?? format
}

function formatSourceTimestamp(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value))
}

function ManualProxyInspector({ node }: InspectorProps) {
  const update = useBuilderStore((state) => state.updateNodeData)
  const protocol = node.data.proxyProtocol === 'socks' ? 'socks5' : node.data.proxyProtocol ?? 'socks5'
  const usesPassword = ['shadowsocks', 'trojan'].includes(protocol)
  const usesUuid = ['vmess', 'vless'].includes(protocol)
  const usesTls = ['http', 'trojan', 'vmess', 'vless'].includes(protocol)
  const usesTransport = ['trojan', 'vmess', 'vless'].includes(protocol)
  return <>
    <TextField node={node} field="title" label="名称" />
    <Field label="协议"><select value={protocol} onChange={(event) => update(node.id, { proxyProtocol: event.target.value as BlockNodeData['proxyProtocol'] })}>{(['http', 'socks5', 'shadowsocks', 'trojan', 'vmess', 'vless'] as SupportedProxyProtocol[]).map((value) => <option key={value} value={value}>{proxyProtocolLabel(value)}</option>)}</select></Field>
    <TextField node={node} field="proxyServer" label="服务器" placeholder="proxy.example.com" />
    <Field label="端口"><input type="number" min="1" max="65535" value={node.data.proxyPort ?? 1080} onChange={(event) => update(node.id, { proxyPort: Number(event.target.value) })} /></Field>
    {['http', 'socks5'].includes(protocol) && <><TextField node={node} field="proxyUsername" label="用户名" /><Field label="密码"><input type="password" value={node.data.proxyPassword ?? ''} onChange={(event) => update(node.id, { proxyPassword: event.target.value })} /></Field></>}
    {usesPassword && <Field label="密码"><input type="password" value={node.data.proxyPassword ?? ''} onChange={(event) => update(node.id, { proxyPassword: event.target.value })} /></Field>}
    {protocol === 'shadowsocks' && <TextField node={node} field="proxyMethod" label="加密方法" placeholder="aes-128-gcm" />}
    {usesUuid && <TextField node={node} field="proxyUuid" label="UUID" placeholder="00000000-0000-4000-8000-000000000000" />}
    {protocol === 'vmess' && <><TextField node={node} field="proxySecurity" label="Security" placeholder="auto" /><Field label="Alter ID"><input type="number" min="0" value={node.data.proxyAlterId ?? 0} onChange={(event) => update(node.id, { proxyAlterId: Number(event.target.value) })} /></Field></>}
    {usesTls && <Advanced><label className="toggle-row compact"><span><strong>TLS</strong></span><input type="checkbox" checked={node.data.proxyTls ?? protocol === 'trojan'} onChange={(event) => update(node.id, { proxyTls: event.target.checked })} /></label>{(node.data.proxyTls || protocol === 'trojan') && <><TextField node={node} field="proxyServerName" label="SNI / Server Name" /><label className="check-row"><input type="checkbox" checked={node.data.proxyAllowInsecure ?? false} onChange={(event) => update(node.id, { proxyAllowInsecure: event.target.checked })} /> Allow insecure certificate</label></>}{usesTransport && <><Field label="Transport"><select value={node.data.proxyTransport ?? 'tcp'} onChange={(event) => update(node.id, { proxyTransport: event.target.value as BlockNodeData['proxyTransport'] })}><option value="tcp">TCP</option><option value="ws">WebSocket</option><option value="http">HTTP</option><option value="grpc">gRPC</option></select></Field>{['ws', 'http'].includes(node.data.proxyTransport ?? 'tcp') && <><TextField node={node} field="proxyTransportPath" label="Path" /><TextField node={node} field="proxyTransportHost" label="Host" /></>}{node.data.proxyTransport === 'grpc' && <TextField node={node} field="proxyGrpcServiceName" label="Service Name" />}</>}</Advanced>}
    <div className="mock-note">该标准化节点可同时编译到 Mihomo 与 sing-box；只显示当前协议需要的字段。</div>
  </>
}

function TokenField({ label, values, onChange }: { label: string; values: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && draft.trim()) {
      event.preventDefault()
      if (!values.includes(draft.trim())) onChange([...values, draft.trim()])
      setDraft('')
    }
  }
  return <Field label={label} hint="回车添加"><div className="token-input">
    <div className="token-list">{values.map((value) => <span key={value}>{value}<button onClick={() => onChange(values.filter((item) => item !== value))}><X size={11} /></button></span>)}</div>
    <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="输入关键词…" />
  </div></Field>
}

function FilterInspector({ node }: InspectorProps) {
  const update = useBuilderStore((state) => state.updateNodeData)
  const materialized = useNodeMaterialization(node.id)
  return <>
    <TextField node={node} field="title" label="名称" />
    <TokenField label="Include name contains" values={node.data.include ?? []} onChange={(include) => update(node.id, { include })} />
    <TokenField label="Exclude name contains" values={node.data.exclude ?? []} onChange={(exclude) => update(node.id, { exclude })} />
    <Field label="Include region"><select value={node.data.includeRegions?.[0] ?? ''} onChange={(event) => update(node.id, { includeRegions: event.target.value ? [event.target.value as RegionCode] : [] })}><option value="">All regions</option>{REGION_OPTIONS.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.label}</option>)}</select></Field>
    <Field label="Exclude region"><select value={node.data.excludeRegions?.[0] ?? ''} onChange={(event) => update(node.id, { excludeRegions: event.target.value ? [event.target.value as RegionCode] : [] })}><option value="">None</option>{REGION_OPTIONS.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.label}</option>)}</select></Field>
    <Field label="Include protocol"><select value={node.data.includeProtocols?.[0] ?? ''} onChange={(event) => update(node.id, { includeProtocols: event.target.value ? [event.target.value as SupportedProxyProtocol] : [] })}><option value="">All protocols</option>{PROTOCOL_OPTIONS.map((value) => <option key={value} value={value}>{proxyProtocolLabel(value)}</option>)}</select></Field>
    <Field label="Exclude protocol"><select value={node.data.excludeProtocols?.[0] ?? ''} onChange={(event) => update(node.id, { excludeProtocols: event.target.value ? [event.target.value as SupportedProxyProtocol] : [] })}><option value="">None</option>{PROTOCOL_OPTIONS.map((value) => <option key={value} value={value}>{proxyProtocolLabel(value)}</option>)}</select></Field>
    <Advanced><TextField node={node} field="includeRegex" label="Include name regex" /><TextField node={node} field="excludeRegex" label="Exclude name regex" /></Advanced>
    <ProcessingDebug materialized={materialized} />
  </>
}

function RenameInspector({ node }: InspectorProps) {
  const materialized = useNodeMaterialization(node.id)
  return <><TextField node={node} field="title" label="名称" /><TextField node={node} field="renamePattern" label="Regex pattern" /><TextField node={node} field="renameReplacement" label="Replacement" />
    <div className="rename-preview"><span>BEFORE → AFTER</span>{materialized.input.slice(0, 3).map((proxy, index) => <div key={proxy.id}><code>{proxy.name}</code><b>→</b><code>{materialized.output[index]?.name ?? proxy.name}</code></div>)}</div><ProcessingDebug materialized={materialized} /></>
}

function SortInspector({ node }: InspectorProps) {
  const update = useBuilderStore((state) => state.updateNodeData)
  const materialized = useNodeMaterialization(node.id)
  return <><TextField node={node} field="title" label="名称" /><Field label="Sort by"><select value={node.data.sortBy ?? 'name'} onChange={(event) => update(node.id, { sortBy: event.target.value as BlockNodeData['sortBy'] })}><option value="name">Name</option><option value="region">Region</option><option value="protocol">Protocol</option><option value="latency" disabled>Latency · Requires Speed Test</option></select></Field><Field label="Direction"><select value={node.data.sortDirection ?? 'ascending'} onChange={(event) => update(node.id, { sortDirection: event.target.value as BlockNodeData['sortDirection'] })}><option value="ascending">Ascending</option><option value="descending">Descending</option></select></Field><ProcessingDebug materialized={materialized} /></>
}

function DedupeInspector({ node }: InspectorProps) {
  return <><TextField node={node} field="title" label="名称" /><div className="mock-note">按协议、地址、认证身份与 transport identity 去重；名称不参与判定，fingerprint 不向 UI 暴露。</div><ProcessingDebug materialized={useNodeMaterialization(node.id)} /></>
}

function LimitInspector({ node }: InspectorProps) {
  const update = useBuilderStore((state) => state.updateNodeData)
  return <><TextField node={node} field="title" label="名称" /><Field label="First N"><input type="number" min="1" value={node.data.limit ?? 10} onChange={(event) => update(node.id, { limit: Number(event.target.value) })} /></Field><ProcessingDebug materialized={useNodeMaterialization(node.id)} /></>
}

function MergeInspector({ node }: InspectorProps) {
  return <><TextField node={node} field="title" label="名称" /><div className="mock-note">按画布输入顺序合并多个 Node Pool；不会自动去重。</div><ProcessingDebug materialized={useNodeMaterialization(node.id)} /></>
}

interface NodeMaterializationView {
  input: import('../../core/ir').ResolvedProxyEndpointIR[]
  output: import('../../core/ir').ResolvedProxyEndpointIR[]
  status: 'ready' | 'error'
  issues: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }>
  inputCount: number
  outputCount: number
  removedCount: number
}

function useNodeMaterialization(nodeId: string): NodeMaterializationView {
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const snapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const toProject = useBuilderStore((state) => state.toProject)
  return useMemo(() => {
    const graph = compileGraph(toProject(), { subscriptionSnapshots: snapshots })
    if (!graph.ir) return { input: [], output: [], status: 'error' as const, issues: graph.issues, inputCount: 0, outputCount: 0, removedCount: 0 }
    const transform = graph.ir.transforms.find((item) => item.id === nodeId)
    if (!transform) return { input: [], output: [], status: 'ready' as const, issues: [], inputCount: 0, outputCount: 0, removedCount: 0 }
    const context = createMaterializationContext()
    const output = materializeProxySet(graph.ir, { kind: 'transform', id: nodeId }, context)
    const inputs = transform.kind === 'merge' ? transform.inputs : [transform.input]
    const input = inputs.flatMap((ref) => materializeProxySet(graph.ir!, ref, context).proxies)
    return { input, output: output.proxies, status: output.status, issues: output.issues, inputCount: input.length, outputCount: output.outputCount, removedCount: input.length - output.outputCount }
  }, [edges, nodeId, nodes, snapshots, toProject])
}

function ProcessingDebug({ materialized }: { materialized: NodeMaterializationView }) {
  const [preview, setPreview] = useState<'input' | 'output' | null>(null)
  const proxies = preview === 'input' ? materialized.input : materialized.output
  return <><div className={`processing-debug${materialized.status === 'error' ? ' is-error' : ''}`}><div><span>INPUT</span><strong>{materialized.inputCount}</strong></div><div><span>OUTPUT</span><strong>{materialized.outputCount}</strong></div><div><span>REMOVED</span><strong>{materialized.removedCount}</strong></div></div>{materialized.issues.map((issue) => <div className={`processing-issue is-${issue.severity}`} key={`${issue.code}-${issue.message}`}><code>{issue.code}</code><span>{issue.message}</span></div>)}<div className="processing-preview-actions"><button disabled={!materialized.input.length} onClick={() => setPreview('input')}>View Input</button><button disabled={!materialized.output.length} onClick={() => setPreview('output')}>View Output</button></div>{preview && <NodesPreview snapshot={snapshotFromProxies(proxies)} onClose={() => setPreview(null)} />}</>
}

function snapshotFromProxies(proxies: import('../../core/ir').ResolvedProxyEndpointIR[]) {
  return {
    inputKind: 'paste' as const, fetchStatus: 'ready' as const,
    result: { format: 'share-links' as const, proxies, issues: [], nodes: proxies.map((endpoint) => ({ id: endpoint.id, name: endpoint.name, protocol: endpoint.protocol, server: endpoint.server, port: endpoint.port, sourceId: endpoint.metadata?.sourceId ?? 'pipeline', sourceName: endpoint.metadata?.sourceName ?? 'Pipeline', status: endpoint.metadata?.compatibility?.status === 'partial' ? 'partial' as const : 'ready' as const, endpoint, issues: [] })), detectedCount: proxies.length, readyCount: proxies.filter((proxy) => proxy.metadata?.compatibility?.status !== 'partial').length, partialCount: proxies.filter((proxy) => proxy.metadata?.compatibility?.status === 'partial').length, unsupportedCount: 0 },
  }
}

const PROTOCOL_OPTIONS: SupportedProxyProtocol[] = ['http', 'socks5', 'shadowsocks', 'trojan', 'vmess', 'vless', 'hysteria2', 'tuic']

function StrategyInspector({ node }: InspectorProps) {
  const update = useBuilderStore((state) => state.updateNodeData)
  const incoming = useBuilderStore((state) => state.edges.filter((edge) => edge.target === node.id).map((edge) => state.nodes.find((item) => item.id === edge.source)?.data.title).filter(Boolean))
  const runtime = usePipelineNodeRuntime(node.id)
  return <>
    <TextField node={node} field="title" label="名称" />
    <Field label="节点来源"><div className="source-reference"><Link2 size={14} /><span>{incoming.join('、') || '尚未连接来源'}</span></div></Field>
    <Field label="选择方式"><select value={node.data.strategyMode ?? '自动选择最快'} onChange={(event) => update(node.id, { strategyMode: event.target.value })}><option>自动选择最快</option><option>故障自动切换</option><option>手动选择</option><option>负载均衡</option></select></Field>
    <TextField node={node} field="testUrl" label="测试地址" />
    <div className="metric-cards"><div><span>Candidates</span><strong className="compact-metric">{runtime?.outputCount ?? 0}</strong></div><div><span>Status</span><strong className={runtime?.status === 'error' ? '' : 'good-metric'}>{runtime?.status === 'error' ? 'Blocked' : 'Ready'}</strong></div></div>
    <Advanced><Field label="测试间隔"><div className="input-with-unit"><input type="number" value={node.data.interval ?? 300} onChange={(event) => update(node.id, { interval: Number(event.target.value) })} /><span>秒</span></div></Field><Field label="切换容差"><div className="input-with-unit"><input type="number" value={node.data.tolerance ?? 50} onChange={(event) => update(node.id, { tolerance: Number(event.target.value) })} /><span>ms</span></div></Field></Advanced>
  </>
}

function usePipelineNodeRuntime(nodeId: string) {
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const snapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const toProject = useBuilderStore((state) => state.toProject)
  return useMemo(() => deriveProjectRuntime(toProject(), snapshots).get(nodeId), [edges, nodeId, nodes, snapshots, toProject])
}

function FixedStrategyInspector({ node }: InspectorProps) {
  const nodes = useBuilderStore((state) => state.nodes)
  const update = useBuilderStore((state) => state.updateNodeData)
  const proxies = nodes.filter((item) => item.data.blockType === 'manual-proxy')
  return <>
    <TextField node={node} field="title" label="名称" />
    <Field label="固定代理"><select value={node.data.proxyId ?? ''} onChange={(event) => update(node.id, { proxyId: event.target.value })}><option value="" disabled>选择手动节点…</option>{proxies.map((proxy) => <option key={proxy.id} value={proxy.id}>{proxy.data.title}</option>)}</select></Field>
    <div className="mock-note">Fixed 只引用已经建模且可安全编译的标准代理 endpoint。</div>
  </>
}

function ChainInspector({ node }: InspectorProps) {
  const nodes = useBuilderStore((state) => state.nodes)
  const addHop = useBuilderStore((state) => state.addHop)
  const removeHop = useBuilderStore((state) => state.removeHop)
  const moveHop = useBuilderStore((state) => state.moveHop)
  return <>
    <TextField node={node} field="title" label="名称" />
    <div className="section-label"><span>链路</span><small>{node.data.hopIds?.length ?? 0} HOPS</small></div>
    <div className="hop-list">
      {(node.data.hopIds ?? []).map((hopId, index, all) => {
        const hop = nodes.find((item) => item.id === hopId)
        if (!hop) return null
        return <div className="hop-wrap" key={hopId}>
          <div className="hop-card"><GripVertical size={14} /><span className="hop-index">{index + 1}</span><div><strong>{hop.data.title}</strong><small>{hop.data.subtitle}</small></div><div className="hop-actions"><button disabled={index === 0} onClick={() => moveHop(node.id, index, index - 1)}><ArrowUp size={12} /></button><button disabled={index === all.length - 1} onClick={() => moveHop(node.id, index, index + 1)}><ArrowDown size={12} /></button><button onClick={() => removeHop(node.id, hopId)}><Trash2 size={12} /></button></div></div>
          {index < all.length - 1 && <div className="hop-connector"><ArrowDown size={12} /></div>}
        </div>
      })}
    </div>
    <button className="dashed-button" onClick={() => addHop(node.id)}><Plus size={14} /> 添加一跳</button>
    <div className="chain-summary"><span>流量路径</span><strong>{(node.data.hopIds ?? []).map((id) => nodes.find((item) => item.id === id)?.data.title.replace('自动选择', '')).filter(Boolean).join(' → ') || '尚未配置'}</strong></div>
    <Advanced><Field label="连接超时"><div className="input-with-unit"><input defaultValue="10" /><span>秒</span></div></Field><Field label="失败重试"><select defaultValue="2"><option>1</option><option>2</option><option>3</option></select></Field><label className="toggle-row compact"><span><strong>UDP 中继</strong></span><input type="checkbox" defaultChecked /></label></Advanced>
  </>
}

function RoutingInspector({ node }: InspectorProps) {
  const nodes = useBuilderStore((state) => state.nodes)
  const activeService = useBuilderStore((state) => state.activeService)
  const update = useBuilderStore((state) => state.updateNodeData)
  const setTarget = useBuilderStore((state) => state.setRoutingTarget)
  const targets = nodes.filter((item) => ['strategy', 'chain'].includes(item.data.category))
  const [rulesOpen, setRulesOpen] = useState(false)
  const services = node.data.services ?? []
  return <>
    <TextField node={node} field="title" label="名称" />
    <div className="section-label"><span>服务</span><button><Plus size={12} /> 添加</button></div>
    <div className="service-list">{services.map((service) => <div className={activeService === service ? 'is-active' : ''} key={service}><span className="service-avatar">{service.slice(0, 1)}</span><span><strong>{service}</strong><small>Service definition</small></span><button onClick={() => update(node.id, { services: services.filter((item) => item !== service) })}><X size={13} /></button></div>)}</div>
    <Field label="目标策略"><select value={node.data.targetKind === 'direct' ? '__direct__' : node.data.targetKind === 'reject' ? '__reject__' : node.data.targetId ?? ''} onChange={(event) => setTarget(node.id, event.target.value)}><option value="" disabled>选择目标…</option><option value="__direct__">DIRECT</option><option value="__reject__">REJECT</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.data.title}</option>)}</select></Field>
    <div className="route-preview"><span className="route-source">{node.data.title}</span><ArrowLeftRight size={14} /><span className="route-target">{node.data.targetLabel ?? '未设置'}</span></div>
    <div className="rule-source-card"><div><span>RULE SOURCE</span><strong>{node.data.ruleSource === 'builtin' ? 'ProxyFlow Built-in' : 'ios_rule_script'}</strong><small>{node.data.ruleSource === 'builtin' ? '通用地域元数据' : 'blackmatrix7 / ios_rule_script'}</small></div><a href="https://github.com/blackmatrix7/ios_rule_script" target="_blank" rel="noreferrer" aria-label="查看规则来源"><ExternalLink size={14} /></a></div>
    <button className="inspector-secondary-button" onClick={() => setRulesOpen((open) => !open)}><Eye size={14} /> {rulesOpen ? '收起实际规则' : '查看实际规则'}</button>
    {rulesOpen && <div className="actual-rules"><div><span>DOMAIN-SUFFIX</span><code>{services[0]?.toLowerCase().replace('+', '') || 'example'}.com</code></div><div><span>RULE-SET</span><code>{services[0] || 'Custom'}</code></div><div><span>IP-CIDR</span><code>Mock metadata</code></div><small>仅用于交互演示，不包含第三方规则内容。</small></div>}
  </>
}

function OutputInspector({ node }: InspectorProps) {
  const setOutputClient = useBuilderStore((state) => state.setOutputClient)
  const setPreviewOpen = useBuilderStore((state) => state.setPreviewOpen)
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const toProject = useBuilderStore((state) => state.toProject)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const graph = useMemo(() => compileGraph(toProject(), { subscriptionSnapshots }), [edges, nodes, projectId, projectName, subscriptionSnapshots, toProject])
  const supported = node.data.client === 'mihomo' || node.data.client === 'sing-box'
  const target = useTargetCompile(graph.ir, supported ? node.data.client : undefined, graph.success)
  const errors = graph.success ? target.result?.issues.filter((issue) => issue.severity === 'error').length ?? 0 : graph.issues.filter((issue) => issue.severity === 'error').length
  const warnings = graph.success ? target.result?.issues.filter((issue) => issue.severity === 'warning').length ?? 0 : graph.issues.filter((issue) => issue.severity === 'warning').length
  const info = target.result?.issues.filter((issue) => issue.severity === 'info').length ?? 0
  const compiled = supported && graph.success && target.status === 'success'
  return <>
    <Field label="目标客户端"><div className="client-grid">{outputDefinitions.map((output) => <button className={node.data.client === output.target ? 'is-selected' : ''} key={output.id} onClick={() => setOutputClient(node.id, output.target)}><span>{output.label.slice(0, 1)}</span><strong>{output.label}</strong><small>{output.status === 'supported' ? 'SUPPORTED' : output.status === 'prototype' ? 'PROTOTYPE' : 'SOON'}</small>{node.data.client === output.target && <Check size={13} />}</button>)}</div></Field>
    <div className="compat-card"><ShieldCheck size={18} /><div><strong>Compatibility</strong><span>{!supported ? '当前客户端尚未实现' : target.status === 'loading' ? 'Loading compiler…' : compiled ? `${warnings} warnings · ${info} info` : `${errors} errors · 无配置输出`}</span></div><b>{!supported ? 'Unavailable' : target.status === 'loading' ? 'Loading' : compiled ? 'Compiled' : 'Blocked'}</b></div>
    <button className="inspector-primary-button" onClick={() => setPreviewOpen(true)}><Eye size={15} /> 预览配置</button>
    <div className="mock-note">Mihomo 与 sing-box 都使用真实 Compiler；失败时不会回退到 Mock 配置。</div>
  </>
}

function DnsInspector({ node }: InspectorProps) {
  return <><TextField node={node} field="title" label="名称" /><TextField node={node} field="resolver" label="远程 DNS" /><Field label="解析模式"><select value="basic" disabled><option value="basic">基础 DNS MVP</option></select></Field><Advanced><Field label="Bootstrap DNS"><input value="223.5.5.5" disabled /></Field></Advanced><div className="mock-note">Mihomo 与 sing-box 会各自 lower 基础 resolver；高级 DNS 语义留待后续。</div></>
}

function GenericInspector({ node }: InspectorProps) {
  const update = useBuilderStore((state) => state.updateNodeData)
  return <><TextField node={node} field="title" label="名称" /><TextField node={node} field="subtitle" label="说明" /><label className="toggle-row"><span><strong>启用模块</strong><small>禁用后保留节点但跳过处理</small></span><input type="checkbox" checked={!node.data.disabled} onChange={(event) => update(node.id, { disabled: !event.target.checked })} /></label><Advanced><div className="mock-note">更多参数将在对应业务能力实现后开放。</div></Advanced></>
}

const inspectorRegistry: Partial<Record<BlockNodeData['blockType'], ComponentType<InspectorProps>>> = {
  subscription: SubscriptionInspector,
  'manual-proxy': ManualProxyInspector,
  filter: FilterInspector,
  rename: RenameInspector,
  sort: SortInspector,
  deduplicate: DedupeInspector,
  merge: MergeInspector,
  limit: LimitInspector,
  'auto-select': StrategyInspector,
  'manual-select': StrategyInspector,
  fallback: StrategyInspector,
  'load-balance': StrategyInspector,
  'fixed-proxy': FixedStrategyInspector,
  'proxy-chain': ChainInspector,
  'routing-group': RoutingInspector,
  'service-rule': RoutingInspector,
  'custom-rule': RoutingInspector,
  final: RoutingInspector,
  dns: DnsInspector,
  output: OutputInspector,
}

export function Inspector() {
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId)
  const selectedEdgeId = useBuilderStore((state) => state.selectedEdgeId)
  const deleteSelected = useBuilderStore((state) => state.deleteSelected)
  const selected = nodes.find((node) => node.id === selectedNodeId)
  const edge = edges.find((item) => item.id === selectedEdgeId)
  const issues = useMemo(() => validateGraph(nodes, edges), [nodes, edges])
  const issue = issues.find((item) => item.nodeId === selectedNodeId)

  if (!selected && edge) return <aside className="inspector"><div className="panel-heading inspector-heading"><div><span>CONNECTION</span><h2>连接属性</h2></div></div><div className="inspector-scroll"><div className="edge-inspector-visual"><span /><Link2 size={18} /><span /></div><Field label="语义"><input value={String(edge.data?.semantic ?? 'data')} readOnly /></Field><div className="edge-endpoints"><div><span>FROM</span><strong>{nodes.find((node) => node.id === edge.source)?.data.title}</strong></div><ArrowLeftRight size={15} /><div><span>TO</span><strong>{nodes.find((node) => node.id === edge.target)?.data.title}</strong></div></div><button className="danger-button" onClick={deleteSelected}><Trash2 size={14} /> 删除连接</button></div></aside>

  if (!selected) return <aside className="inspector"><div className="panel-heading inspector-heading"><div><span>INSPECTOR</span><h2>属性检查器</h2></div></div><div className="inspector-empty"><div className="inspector-empty-graphic"><span /><span /><span /><Link2 size={18} /></div><h3>选择一个节点</h3><p>点击画布上的任意节点，查看并编辑它的详细属性。</p><div><kbd>⌘</kbd><span>+</span><kbd>K</kbd><small>快速搜索模块</small></div></div></aside>

  const Content = inspectorRegistry[selected.data.blockType] ?? GenericInspector
  return <aside className="inspector">
    <div className="inspector-node-header">
      <div className={`node-icon node-icon--${selected.data.category}`}><BlockIcon name={selected.data.icon} size={18} /></div>
      <div><span>{selected.data.category.toUpperCase()}</span><h2>{selected.data.title}</h2></div>
      {!selected.data.protected && <button onClick={deleteSelected} aria-label="删除节点"><Trash2 size={15} /></button>}
    </div>
    {issue && <div className={`validation-banner validation-banner--${issue.severity}`}><AlertTriangle size={15} /><span><strong>需要配置</strong>{issue.message}</span></div>}
    <div className="inspector-scroll"><Content node={selected} /></div>
  </aside>
}
