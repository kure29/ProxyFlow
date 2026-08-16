import { Fragment, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Search, X, XCircle } from 'lucide-react'
import { maskServer, proxyProtocolLabel, REGION_OPTIONS, type ResolvedProxyEndpointIR, type SupportedProxyProtocol } from '../../core/proxy'
import type { SubscriptionSnapshot } from '../../core/subscription'
import { localizeDiagnosticMessage, localizeKnownSystemText, regionLabel, useI18n } from '../../i18n'

export function NodesPreview({ snapshot, onClose, initialStatus = 'all' }: { snapshot?: SubscriptionSnapshot; onClose: () => void; initialStatus?: 'all' | 'issues' }) {
  const { locale, t } = useI18n()
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
      <header><div><span>{t('nodesPreview.pool')}</span><h2 id="nodes-preview-title">{t('nodesPreview.title')}</h2><p>{t('nodesPreview.summary', { detected: nodes.length, ready: snapshot?.result?.readyCount ?? 0, warnings: snapshot?.result?.partialCount ?? 0, unsupported: snapshot?.result?.unsupportedCount ?? 0 })}</p></div><button onClick={onClose} aria-label={t('nodesPreview.closeAria')}><X size={18} /></button></header>
      <div className="nodes-preview-filters">
        <label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('nodesPreview.search')} /></label>
        <select value={protocol} onChange={(event) => setProtocol(event.target.value)}><option value="all">{t('nodesPreview.allProtocols')}</option>{protocols.map((item) => <option key={item} value={item}>{protocolName(item)}</option>)}</select>
        <select value={region} onChange={(event) => setRegion(event.target.value)}><option value="all">{t('nodesPreview.allRegions')}</option>{REGION_OPTIONS.map((item) => <option key={item.code} value={item.code}>{item.code} · {regionLabel(item.code, locale)}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | 'issues')}><option value="all">{t('nodesPreview.allStatuses')}</option><option value="issues">{t('nodesPreview.issuesOnly')}</option></select>
      </div>
      <div className="nodes-preview-table" role="table">
        <div className="nodes-preview-row is-heading" role="row"><span>{t('nodesPreview.name')}</span><span>{t('nodesPreview.protocol')}</span><span>{t('nodesPreview.region')}</span><span>{t('nodesPreview.server')}</span><span>{t('nodesPreview.port')}</span><span>{t('nodesPreview.security')}</span><span>{t('nodesPreview.status')}</span></div>
        {filtered.map((node) => <Fragment key={node.id}><div className={`nodes-preview-row${node.issues.length ? ' has-issues' : ''}`} role="row" tabIndex={node.issues.length ? 0 : undefined} aria-expanded={node.issues.length ? expandedNodeId === node.id : undefined} onClick={() => node.issues.length && setExpandedNodeId((current) => current === node.id ? null : node.id)} onKeyDown={(event) => { if (node.issues.length && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setExpandedNodeId((current) => current === node.id ? null : node.id) } }}>
          <span><strong>{node.name}</strong><small>{localizeKnownSystemText(node.sourceName, locale)}</small></span>
          <span><code>{protocolName(node.protocol)}</code></span>
          <span>{node.endpoint?.metadata?.region?.code ?? 'UNKNOWN'}<small>{t('nodesPreview.hint', { source: node.endpoint?.metadata?.region?.source ?? '—' })}</small></span>
          <span><code>{node.server ? maskServer(node.server) : '—'}</code></span>
          <span>{node.port ?? '—'}</span>
          <span><small className="node-safe-summary">{safeEndpointSummary(node.endpoint, t)}</small></span>
          <span className={`node-parse-status is-${node.status}`}>{node.status === 'ready' ? <CheckCircle2 size={14} /> : node.status === 'partial' ? <AlertTriangle size={14} /> : <XCircle size={14} />}{t(`nodesPreview.status.${node.status}`)}</span>
        </div>{expandedNodeId === node.id && node.issues.length > 0 && <div className="node-issue-details">{node.issues.map((issue) => <div key={`${issue.code}-${issue.message}`}><code>{issue.code}</code><span>{localizeDiagnosticMessage(issue.code, issue.message, locale)}</span></div>)}</div>}</Fragment>)}
        {filtered.length === 0 && <div className="nodes-preview-empty">{t('nodesPreview.empty')}</div>}
      </div>
      <footer><span>{t('nodesPreview.privacy')}</span><button className="secondary-action" onClick={onClose}>{t('nodesPreview.close')}</button></footer>
    </section>
  </div>, document.body)
}

function protocolName(value: string) {
  return ['http', 'socks5', 'shadowsocks', 'trojan', 'vmess', 'vless', 'hysteria2', 'tuic'].includes(value)
    ? proxyProtocolLabel(value as SupportedProxyProtocol)
    : value.toUpperCase()
}

function safeEndpointSummary(endpoint: ResolvedProxyEndpointIR | undefined, t: ReturnType<typeof useI18n>['t']) {
  if (!endpoint) return '—'
  if (endpoint.protocol === 'hysteria2') return [
    'TLS', endpoint.obfs?.type, endpoint.serverPorts?.length ? t('nodesPreview.portHopping') : undefined,
    endpoint.upMbps || endpoint.downMbps ? t('nodesPreview.bandwidthLimits') : undefined,
  ].filter(Boolean).join(' · ')
  if (endpoint.protocol === 'tuic') return ['TLS', endpoint.congestionControl?.toUpperCase(), endpoint.udpRelayMode ? `UDP ${endpoint.udpRelayMode}` : undefined].filter(Boolean).join(' · ')
  const tls = 'tls' in endpoint && endpoint.tls?.enabled ? endpoint.tls.reality ? 'Reality' : 'TLS' : undefined
  const flow = endpoint.protocol === 'vless' && endpoint.flow ? 'Vision' : undefined
  const transport = 'transport' in endpoint && endpoint.transport ? endpoint.transport.kind === 'http' && endpoint.transport.variant === 'h2'
    ? 'HTTP/2' : endpoint.transport.kind === 'ws' ? `WebSocket${endpoint.transport.maxEarlyData ? ` + ${t('nodesPreview.earlyData')}` : ''}`
      : endpoint.transport.kind === 'grpc' ? 'gRPC' : endpoint.transport.kind === 'httpupgrade' ? 'HTTPUpgrade'
        : endpoint.transport.kind === 'xhttp' ? 'XHTTP' : endpoint.transport.kind.toUpperCase() : undefined
  return [tls, flow, transport].filter(Boolean).join(' · ') || t('nodesPreview.standard')
}
