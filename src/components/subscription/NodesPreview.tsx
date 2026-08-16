import { Fragment, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Search, X, XCircle } from 'lucide-react'
import { maskServer, proxyProtocolLabel, REGION_OPTIONS, type ResolvedProxyEndpointIR, type SupportedProxyProtocol } from '../../core/proxy'
import type { SubscriptionSnapshot } from '../../core/subscription'

export function NodesPreview({ snapshot, onClose, initialStatus = 'all' }: { snapshot?: SubscriptionSnapshot; onClose: () => void; initialStatus?: 'all' | 'issues' }) {
  const [search, setSearch] = useState('')
  const [protocol, setProtocol] = useState('all')
  const [region, setRegion] = useState('all')
  const [status, setStatus] = useState(initialStatus)
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  const nodes = snapshot?.result?.nodes ?? []
  const filtered = useMemo(() => nodes.filter((node) => {
    const query = search.trim().toLocaleLowerCase()
    const nodeRegion = node.endpoint?.metadata?.region?.code ?? 'UNKNOWN'
    return (!query || node.name.toLocaleLowerCase().includes(query) || node.server?.toLocaleLowerCase().includes(query))
      && (protocol === 'all' || node.protocol === protocol) && (region === 'all' || nodeRegion === region)
      && (status === 'all' || node.status !== 'ready')
  }), [nodes, protocol, region, search, status])
  const protocols = [...new Set(nodes.map((node) => node.protocol))].sort()

  return createPortal(<div className="nodes-preview-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="nodes-preview" role="dialog" aria-modal="true" aria-labelledby="nodes-preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>NODE POOL</span><h2 id="nodes-preview-title">Nodes Preview</h2><p>{nodes.length} detected · {snapshot?.result?.readyCount ?? 0} ready · {snapshot?.result?.partialCount ?? 0} warnings · {snapshot?.result?.unsupportedCount ?? 0} unsupported</p></div><button onClick={onClose} aria-label="关闭节点预览"><X size={18} /></button></header>
      <div className="nodes-preview-filters">
        <label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称或服务器…" /></label>
        <select value={protocol} onChange={(event) => setProtocol(event.target.value)}><option value="all">全部协议</option>{protocols.map((item) => <option key={item} value={item}>{protocolName(item)}</option>)}</select>
        <select value={region} onChange={(event) => setRegion(event.target.value)}><option value="all">全部地区</option>{REGION_OPTIONS.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.label}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | 'issues')}><option value="all">全部状态</option><option value="issues">仅问题节点</option></select>
      </div>
      <div className="nodes-preview-table" role="table">
        <div className="nodes-preview-row is-heading" role="row"><span>Name</span><span>Protocol</span><span>Region</span><span>Server</span><span>Port</span><span>Security / Transport</span><span>Status</span></div>
        {filtered.map((node) => <Fragment key={node.id}><div className={`nodes-preview-row${node.issues.length ? ' has-issues' : ''}`} role="row" tabIndex={node.issues.length ? 0 : undefined} aria-expanded={node.issues.length ? expandedNodeId === node.id : undefined} onClick={() => node.issues.length && setExpandedNodeId((current) => current === node.id ? null : node.id)} onKeyDown={(event) => { if (node.issues.length && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setExpandedNodeId((current) => current === node.id ? null : node.id) } }}>
          <span><strong>{node.name}</strong><small>{node.sourceName}</small></span>
          <span><code>{protocolName(node.protocol)}</code></span>
          <span>{node.endpoint?.metadata?.region?.code ?? 'UNKNOWN'}<small>{node.endpoint?.metadata?.region?.source ?? '—'} hint</small></span>
          <span><code>{node.server ? maskServer(node.server) : '—'}</code></span>
          <span>{node.port ?? '—'}</span>
          <span><small className="node-safe-summary">{safeEndpointSummary(node.endpoint)}</small></span>
          <span className={`node-parse-status is-${node.status}`}>{node.status === 'ready' ? <CheckCircle2 size={14} /> : node.status === 'partial' ? <AlertTriangle size={14} /> : <XCircle size={14} />}{node.status}</span>
        </div>{expandedNodeId === node.id && node.issues.length > 0 && <div className="node-issue-details">{node.issues.map((issue) => <div key={`${issue.code}-${issue.message}`}><code>{issue.code}</code><span>{issue.message}</span></div>)}</div>}</Fragment>)}
        {filtered.length === 0 && <div className="nodes-preview-empty">没有匹配当前筛选条件的节点。</div>}
      </div>
      <footer><span>服务器地址已适度隐藏；密码与 UUID 不在此视图显示。</span><button className="secondary-action" onClick={onClose}>关闭</button></footer>
    </section>
  </div>, document.body)
}

function protocolName(value: string) {
  return ['http', 'socks5', 'shadowsocks', 'trojan', 'vmess', 'vless', 'hysteria2', 'tuic'].includes(value)
    ? proxyProtocolLabel(value as SupportedProxyProtocol)
    : value.toUpperCase()
}

function safeEndpointSummary(endpoint?: ResolvedProxyEndpointIR) {
  if (!endpoint) return '—'
  if (endpoint.protocol === 'hysteria2') return [
    'TLS', endpoint.obfs?.type, endpoint.serverPorts?.length ? 'port hopping' : undefined,
    endpoint.upMbps || endpoint.downMbps ? 'bandwidth limits' : undefined,
  ].filter(Boolean).join(' · ')
  if (endpoint.protocol === 'tuic') return ['TLS', endpoint.congestionControl?.toUpperCase(), endpoint.udpRelayMode ? `UDP ${endpoint.udpRelayMode}` : undefined].filter(Boolean).join(' · ')
  const tls = 'tls' in endpoint && endpoint.tls?.enabled ? endpoint.tls.reality ? 'Reality' : 'TLS' : undefined
  const flow = endpoint.protocol === 'vless' && endpoint.flow ? 'Vision' : undefined
  const transport = 'transport' in endpoint && endpoint.transport ? endpoint.transport.kind === 'http' && endpoint.transport.variant === 'h2'
    ? 'HTTP/2' : endpoint.transport.kind === 'ws' ? `WebSocket${endpoint.transport.maxEarlyData ? ' + early data' : ''}`
      : endpoint.transport.kind === 'grpc' ? 'gRPC' : endpoint.transport.kind === 'httpupgrade' ? 'HTTPUpgrade'
        : endpoint.transport.kind === 'xhttp' ? 'XHTTP' : endpoint.transport.kind.toUpperCase() : undefined
  return [tls, flow, transport].filter(Boolean).join(' · ') || 'Standard'
}
