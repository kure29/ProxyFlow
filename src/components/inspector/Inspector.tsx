import { useMemo, useState, type ComponentType, type KeyboardEvent } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, Check, ChevronDown, ExternalLink,
  Eye, GripVertical, Link2, Plus, RefreshCw, ShieldCheck, Trash2, X,
} from 'lucide-react'
import { useBuilderStore } from '../../store/useBuilderStore'
import { validateGraph } from '../../core/validation/validateProject'
import { outputDefinitions } from '../../data/demoProject'
import type { BlockNodeData, GraphNode } from '../../types/project'
import { BlockIcon } from '../icons/BlockIcon'

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
  const setToast = useBuilderStore((state) => state.setToast)
  return <>
    <TextField node={node} field="title" label="名称" />
    <TextField node={node} field="subscriptionUrl" label="订阅地址" placeholder="https://…" />
    <label className="toggle-row"><span><strong>启用订阅</strong><small>参与节点更新与后续流程</small></span><input type="checkbox" checked={node.data.enabled ?? false} onChange={(event) => update(node.id, { enabled: event.target.checked })} /></label>
    <div className="metric-cards"><div><span>节点数量</span><strong>{node.data.nodeCount ?? 0}</strong></div><div><span>最后更新</span><strong>{node.data.updatedAt ?? '—'}</strong></div></div>
    <button className="inspector-secondary-button" onClick={() => { update(node.id, { updatedAt: '刚刚', subtitle: `${node.data.nodeCount ?? 0} 个可用节点` }); setToast('订阅已更新（Mock）') }}><RefreshCw size={14} /> 更新订阅</button>
    <div className="mock-note">Mock 数据：当前不会发送网络请求。</div>
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
  return <>
    <TextField node={node} field="title" label="名称" />
    <TokenField label="包含" values={node.data.include ?? []} onChange={(include) => update(node.id, { include })} />
    <TokenField label="排除" values={node.data.exclude ?? []} onChange={(exclude) => update(node.id, { exclude })} />
    <div className="filter-preview"><span>预计结果</span><strong>8</strong><small>/ 24 个节点</small><i style={{ width: '33%' }} /></div>
    <Advanced><Field label="匹配方式"><select defaultValue="contains"><option value="contains">包含任意关键词</option><option value="all">包含全部关键词</option><option value="regex">正则表达式</option></select></Field><label className="check-row"><input type="checkbox" defaultChecked /> 忽略大小写</label></Advanced>
  </>
}

function StrategyInspector({ node }: InspectorProps) {
  const update = useBuilderStore((state) => state.updateNodeData)
  const incoming = useBuilderStore((state) => state.edges.filter((edge) => edge.target === node.id).map((edge) => state.nodes.find((item) => item.id === edge.source)?.data.title).filter(Boolean))
  return <>
    <TextField node={node} field="title" label="名称" />
    <Field label="节点来源"><div className="source-reference"><Link2 size={14} /><span>{incoming.join('、') || '尚未连接来源'}</span></div></Field>
    <Field label="选择方式"><select value={node.data.strategyMode ?? '自动选择最快'} onChange={(event) => update(node.id, { strategyMode: event.target.value })}><option>自动选择最快</option><option>故障自动切换</option><option>手动选择</option><option>负载均衡</option></select></Field>
    <TextField node={node} field="testUrl" label="测试地址" />
    <div className="metric-cards"><div><span>当前节点</span><strong className="compact-metric">{node.data.title.includes('香港') ? 'HK-03' : 'LA-02'}</strong></div><div><span>延迟</span><strong className="good-metric">{node.data.title.includes('香港') ? '42 ms' : '126 ms'}</strong></div></div>
    <Advanced><Field label="测试间隔"><div className="input-with-unit"><input type="number" value={node.data.interval ?? 300} onChange={(event) => update(node.id, { interval: Number(event.target.value) })} /><span>秒</span></div></Field><Field label="切换容差"><div className="input-with-unit"><input type="number" value={node.data.tolerance ?? 50} onChange={(event) => update(node.id, { tolerance: Number(event.target.value) })} /><span>ms</span></div></Field></Advanced>
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
  const targets = nodes.filter((item) => ['strategy', 'chain', 'output'].includes(item.data.category))
  const [rulesOpen, setRulesOpen] = useState(false)
  const services = node.data.services ?? []
  return <>
    <TextField node={node} field="title" label="名称" />
    <div className="section-label"><span>服务</span><button><Plus size={12} /> 添加</button></div>
    <div className="service-list">{services.map((service) => <div className={activeService === service ? 'is-active' : ''} key={service}><span className="service-avatar">{service.slice(0, 1)}</span><span><strong>{service}</strong><small>Service definition</small></span><button onClick={() => update(node.id, { services: services.filter((item) => item !== service) })}><X size={13} /></button></div>)}</div>
    <Field label="目标策略"><select value={node.data.targetId ?? ''} onChange={(event) => setTarget(node.id, event.target.value)}><option value="" disabled>选择目标…</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.data.title}</option>)}</select></Field>
    <div className="route-preview"><span className="route-source">{node.data.title}</span><ArrowLeftRight size={14} /><span className="route-target">{node.data.targetLabel ?? '未设置'}</span></div>
    <div className="rule-source-card"><div><span>RULE SOURCE</span><strong>{node.data.ruleSource === 'builtin' ? 'ProxyFlow Built-in' : 'ios_rule_script'}</strong><small>{node.data.ruleSource === 'builtin' ? '通用地域元数据' : 'blackmatrix7 / ios_rule_script'}</small></div><a href="https://github.com/blackmatrix7/ios_rule_script" target="_blank" rel="noreferrer" aria-label="查看规则来源"><ExternalLink size={14} /></a></div>
    <button className="inspector-secondary-button" onClick={() => setRulesOpen((open) => !open)}><Eye size={14} /> {rulesOpen ? '收起实际规则' : '查看实际规则'}</button>
    {rulesOpen && <div className="actual-rules"><div><span>DOMAIN-SUFFIX</span><code>{services[0]?.toLowerCase().replace('+', '') || 'example'}.com</code></div><div><span>RULE-SET</span><code>{services[0] || 'Custom'}</code></div><div><span>IP-CIDR</span><code>Mock metadata</code></div><small>仅用于交互演示，不包含第三方规则内容。</small></div>}
  </>
}

function OutputInspector({ node }: InspectorProps) {
  const setOutputClient = useBuilderStore((state) => state.setOutputClient)
  const setPreviewOpen = useBuilderStore((state) => state.setPreviewOpen)
  return <>
    <Field label="目标客户端"><div className="client-grid">{outputDefinitions.map((output) => <button className={node.data.client === output.target ? 'is-selected' : ''} key={output.id} onClick={() => setOutputClient(node.id, output.target)}><span>{output.label.slice(0, 1)}</span><strong>{output.label}</strong><small>{output.status === 'supported' ? 'SUPPORTED' : output.status === 'prototype' ? 'PROTOTYPE' : 'SOON'}</small>{node.data.client === output.target && <Check size={13} />}</button>)}</div></Field>
    <div className="compat-card"><ShieldCheck size={18} /><div><strong>Compatibility</strong><span>{node.data.client === 'mihomo' ? '当前 Blueprint 可完整预览' : '当前客户端仅提供原型映射'}</span></div><b>{node.data.client === 'mihomo' ? 'Supported' : 'Mock'}</b></div>
    <button className="inspector-primary-button" onClick={() => setPreviewOpen(true)}><Eye size={15} /> 预览配置</button>
    <div className="mock-note">V0.1 仅生成 Mock 预览，不代表真实编译结果。</div>
  </>
}

function DnsInspector({ node }: InspectorProps) {
  return <><TextField node={node} field="title" label="名称" /><TextField node={node} field="resolver" label="远程 DNS" /><Field label="解析模式"><select defaultValue="fake-ip"><option value="fake-ip">Fake IP</option><option value="redir-host">真实 IP</option></select></Field><Advanced><Field label="本地 DNS"><input defaultValue="223.5.5.5" /></Field><label className="toggle-row compact"><span><strong>遵循分流策略</strong></span><input type="checkbox" defaultChecked /></label></Advanced><div className="mock-note">DNS 行为仅做界面演示，暂未编译。</div></>
}

function GenericInspector({ node }: InspectorProps) {
  const update = useBuilderStore((state) => state.updateNodeData)
  return <><TextField node={node} field="title" label="名称" /><TextField node={node} field="subtitle" label="说明" /><label className="toggle-row"><span><strong>启用模块</strong><small>禁用后保留节点但跳过处理</small></span><input type="checkbox" checked={!node.data.disabled} onChange={(event) => update(node.id, { disabled: !event.target.checked })} /></label><Advanced><div className="mock-note">更多参数将在对应业务能力实现后开放。</div></Advanced></>
}

const inspectorRegistry: Partial<Record<BlockNodeData['blockType'], ComponentType<InspectorProps>>> = {
  subscription: SubscriptionInspector,
  filter: FilterInspector,
  'auto-select': StrategyInspector,
  'manual-select': StrategyInspector,
  fallback: StrategyInspector,
  'load-balance': StrategyInspector,
  'fixed-proxy': StrategyInspector,
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
