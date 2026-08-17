import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, CalendarClock, Check, ChevronDown, ChevronUp, ExternalLink,
  ClipboardPaste, Database, Eye, FileUp, GitCompareArrows, GripVertical, LayoutTemplate, Link2, Plus, RefreshCw, Search, ShieldCheck, Trash2, X,
  History,
} from 'lucide-react'
import { useBuilderStore } from '../../store/useBuilderStore'
import { validateGraph } from '../../core/validation/validateProject'
import { outputDefinitions } from '../../data/demoProject'
import { serviceCatalog } from '../../data/serviceCatalog'
import { compileGraph } from '../../core/graphCompiler'
import type { BlockNodeData, GraphEdge, GraphNode } from '../../types/project'
import { BlockIcon } from '../icons/BlockIcon'
import { AssetIcon } from '../icons/AssetIcon'
import { useTargetCompile } from '../compiler/useTargetCompile'
import { NodesPreview } from '../subscription/NodesPreview'
import { ChangesPreview } from '../subscription/ChangesPreview'
import { proxyProtocolLabel, REGION_CATALOG, searchRegions, type RegionCode, type SupportedProxyProtocol } from '../../core/proxy'
import { snapshotFreshness, type SubscriptionFreshness, type SubscriptionRuntimeRecord } from '../../core/subscription'
import { ADVANCED_ROUTE_MATCHERS, BASIC_ROUTE_MATCHERS, isRoutingRuleType, resolveRouteMatcherKind, routeOrder } from '../../core/routing/routeProductModel'
import { inspectRoute, type RouteInspectionResult, type RouteQuery } from '../../core/routing/routeInspector'
import { ServerRuntimeProvider, type RuntimeHistoryEntry, type RuntimeSchedule } from '../../core/runtime'
import { createMaterializationContext, deriveProjectRuntime, explainProcessing, materializeProxySet, parseLimitDraft, type ProcessingExplanation } from '../../core/proxySet'
import { isStarterProject } from './starterState'
import {
  blockTitleKey, categoryKey, localizeDataValue, localizeDiagnosticMessage, localizeKnownSystemText, localizeNodeTitle,
  localizeSubscriptionSnapshots, regionLabel, useI18n,
} from '../../i18n'

interface InspectorProps { node: GraphNode }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="inspector-field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>
}

function TextField({ node, field, label, placeholder }: { node: GraphNode; field: keyof BlockNodeData; label: string; placeholder?: string }) {
  const update = useBuilderStore((state) => state.updateNodeData)
  const { locale } = useI18n()
  const keyField = field === 'title' ? 'titleKey' : field === 'subtitle' ? 'subtitleKey' : undefined
  const value = keyField ? localizeDataValue(node.data[field], node.data[keyField], locale) : String(node.data[field] ?? '')
  return <Field label={label}><input value={value} placeholder={placeholder} onChange={(event) => update(node.id, { [field]: event.target.value, ...(keyField ? { [keyField]: undefined } : {}) })} /></Field>
}

function Advanced({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  return <details className="advanced-panel"><summary>{t('inspector.advanced')} <ChevronDown size={14} /></summary><div>{children}</div></details>
}

function SubscriptionInspector({ node }: InspectorProps) {
  const { locale, t, formatDateTime } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const snapshot = useBuilderStore((state) => state.subscriptionSnapshots[node.id])
  const runtime = useBuilderStore((state) => state.subscriptionRuntimes[node.id])
  const refresh = useBuilderStore((state) => state.refreshSubscription)
  const parseInput = useBuilderStore((state) => state.parseSubscriptionInput)
  const clearCache = useBuilderStore((state) => state.clearCachedSubscription)
  const runtimeService = useBuilderStore((state) => state.runtimeService)
  const projectId = useBuilderStore((state) => state.projectId)
  const adoptSnapshot = useBuilderStore((state) => state.adoptSubscriptionSnapshot)
  const [paste, setPaste] = useState(node.data.subscriptionInputKind === 'paste' ? node.data.subscriptionContent ?? '' : '')
  const [nodesOpen, setNodesOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [nodePreviewStatus, setNodePreviewStatus] = useState<'all' | 'issues'>('all')
  const fileRef = useRef<HTMLInputElement>(null)
  const clearCancelRef = useRef<HTMLButtonElement>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<RuntimeHistoryEntry[]>([])
  const [schedule, setSchedule] = useState<RuntimeSchedule | null>(null)
  const [scheduleInterval, setScheduleInterval] = useState(900)
  const [serviceMessage, setServiceMessage] = useState<string | null>(null)
  const inputKind = node.data.subscriptionInputKind ?? 'url'
  useEffect(() => { if (clearConfirmOpen) clearCancelRef.current?.focus() }, [clearConfirmOpen])
  useEffect(() => {
    if (inputKind === 'paste') setPaste(node.data.subscriptionContent ?? '')
  }, [inputKind, node.data.subscriptionContent, node.id])
  const localizedSnapshot = snapshot ? localizeSubscriptionSnapshots({ [node.id]: snapshot }, locale)[node.id] : undefined
  const result = localizedSnapshot?.result
  const freshness = snapshot ? snapshotFreshness(snapshot.committedAt) : runtime?.freshness ?? 'fresh'
  const protocols = summarize(result?.proxies.map((proxy) => proxy.protocol) ?? [])
  const regions = summarize(result?.proxies.map((proxy) => proxy.metadata?.region?.code ?? 'UNKNOWN') ?? [])
  const runtimeProvider = useMemo(() => inputKind === 'url' && runtimeService ? new ServerRuntimeProvider(runtimeService, {
    projectId, sourceId: node.id,
    sourceName: localizeDataValue(node.data.title, node.data.titleKey, locale),
  }) : null, [inputKind, locale, node.data.title, node.data.titleKey, node.id, projectId, runtimeService])
  useEffect(() => {
    if (!runtimeProvider) { setHistory([]); setSchedule(null); return }
    void Promise.all([runtimeProvider.history(), runtimeProvider.getSchedule()]).then(([nextHistory, nextSchedule]) => {
      setHistory(nextHistory); setSchedule(nextSchedule); if (nextSchedule) setScheduleInterval(nextSchedule.intervalSeconds)
    }).catch(() => setServiceMessage(t('runtime.sourceUnavailable')))
  }, [runtimeProvider, t])
  const toggleSchedule = async () => {
    if (!runtimeProvider) return
    try {
      if (schedule?.enabled) { await runtimeProvider.clearSchedule(); setSchedule(null) }
      else { const next = await runtimeProvider.saveSchedule(node.data.subscriptionUrl ?? '', scheduleInterval, true); setSchedule(next) }
      setServiceMessage(null)
    } catch { setServiceMessage(t('runtime.sourceUnavailable')) }
  }
  const restore = async (snapshotId: string) => {
    if (!runtimeProvider) return
    try {
      const restored = await runtimeProvider.restoreSnapshot(snapshotId)
      await adoptSnapshot(node.id, restored)
      setServiceMessage(null)
    } catch { setServiceMessage(t('runtime.sourceUnavailable')) }
  }
  const onFile = async (file?: File) => {
    if (!file) return
    await parseInput(node.id, await file.text(), 'file', file.name)
  }
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    {inputKind === 'url' && <TextField node={node} field="subscriptionUrl" label={t('inspector.subscriptionUrl')} placeholder="https://…" />}
    {inputKind === 'paste' && <div className="source-input-panel"><Field label={t('inspector.nodeLinks')} hint={t('inspector.nodeLinksHint')}><textarea className="node-links-input" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder={'vmess://…\nvless://…\nss://…'} /></Field><button className="inspector-primary-button" disabled={!paste.trim()} onClick={() => void parseInput(node.id, paste, 'paste')}><ClipboardPaste size={15} /> {t('inspector.parseImport')}</button></div>}
    {inputKind === 'file' && <button type="button" className="config-file-picker" onClick={() => fileRef.current?.click()}><FileUp size={20} /><span><strong>{node.data.subscriptionFileName ?? t('inspector.noFileSelected')}</strong><small>{node.data.subscriptionFileName ? t('inspector.replaceConfigFile') : t('inspector.chooseConfigFile')}</small></span></button>}
    <label className="toggle-row"><span><strong>{t('inspector.enableSubscription')}</strong><small>{t('inspector.enableSubscriptionHint')}</small></span><input type="checkbox" checked={node.data.enabled ?? false} onChange={(event) => update(node.id, { enabled: event.target.checked })} /></label>
    <div className={`source-status-card is-${statusClass(runtime)}`}><span>{t('inspector.fetchStatus')}</span><strong>{sourceStatus(runtime, freshness, t)}</strong><small>{runtime?.refreshStatus === 'failed' && runtime.latestError ? localizeDiagnosticMessage(runtime.latestError.code, runtime.latestError.message, locale) : runtime?.cacheError ? localizeDiagnosticMessage(runtime.cacheError.code, runtime.cacheError.message, locale) : result ? t('inspector.detectedFormat', { format: formatLabel(result.format, locale) }) : t('inspector.waitingInput')}</small></div>
    {runtime && <div className="source-timestamps"><div><span>{t('inspector.lastSuccessful')}</span><strong>{formatSourceTimestamp(runtime.lastSuccessfulAt, formatDateTime)}</strong></div><div><span>{t('inspector.latestAttempt')}</span><strong>{formatSourceTimestamp(runtime.lastAttemptAt, formatDateTime)}</strong></div><div><span>{t('inspector.snapshotAge')}</span><strong>{formatSnapshotAge(snapshot?.committedAt, t)}</strong></div></div>}
    <div className="metric-cards"><div><span>{t('inspector.detected')}</span><strong>{result?.detectedCount ?? 0}</strong></div><div><span>{t('inspector.usable')}</span><strong>{result?.readyCount ?? 0}</strong></div></div>
    {result && <div className="import-summary"><div><span>{t('inspector.ready')}</span><strong>{result.readyCount}</strong></div><div><span>{t('inspector.warnings')}</span><strong>{result.partialCount}</strong></div><div><span>{t('inspector.unsupported')}</span><strong>{result.unsupportedCount}</strong></div></div>}
    {runtime?.refreshStatus === 'failed' && runtime.activeSnapshot && <div className="validation-banner validation-banner--warning"><AlertTriangle size={15} /><span><strong>{t('inspector.refreshFailed')}</strong>{t('inspector.cachedResult')}</span></div>}
    {freshness === 'stale' && runtime?.activeSnapshot && <div className="runtime-inline-status"><span className="status-dot-label status-stale"><i /> {t('inspector.sourceStatus.stale')}</span></div>}
    {runtime?.latestDiff && <button className="diff-summary-button" onClick={() => setChangesOpen(true)}><GitCompareArrows size={14} /><span>{runtime.latestDiff.isInitialBaseline ? t('subscription.diff.initial', { count: result?.detectedCount ?? 0 }) : `+${runtime.latestDiff.added}  -${runtime.latestDiff.removed}  ~${runtime.latestDiff.changed}  =${runtime.latestDiff.unchanged}`}</span></button>}
    {protocols.length > 0 && <SummaryList label={t('inspector.protocols')} items={protocols} />}
    {regions.length > 0 && <SummaryList label={t('inspector.regions')} items={regions.map(([code, count]) => [`${code} · ${regionLabel(code, locale)}`, count])} />}
    <div className="subscription-actions">{inputKind === 'url' && <button className="inspector-secondary-button" onClick={() => void refresh(node.id)}><RefreshCw className={runtime?.refreshStatus === 'loading' ? 'spin' : ''} size={14} /> {runtime?.refreshStatus === 'failed' ? t('inspector.retry') : t('inspector.refresh')}</button>}<button className="inspector-secondary-button" disabled={!result?.nodes.length} onClick={() => { setNodePreviewStatus('all'); setNodesOpen(true) }}><Eye size={14} /> {t('inspector.viewNodes')}</button><button className="inspector-secondary-button" disabled={!result || result.partialCount + result.unsupportedCount === 0} onClick={() => { setNodePreviewStatus('issues'); setNodesOpen(true) }}><AlertTriangle size={14} /> {t('inspector.viewIssues')}</button><button className="inspector-secondary-button" disabled={!runtime?.latestDiff} onClick={() => setChangesOpen(true)}><GitCompareArrows size={14} /> {t('inspector.viewChanges')}</button>{inputKind === 'url' && <button className="inspector-secondary-button" disabled={!snapshot} onClick={() => setClearConfirmOpen(true)}><Database size={14} /> {t('inspector.clearCachedSnapshot')}</button>}</div>
    {runtimeProvider && <section className="runtime-source-panel"><div className="runtime-source-heading"><div><span>{t('runtime.sourceKicker')}</span><strong>{t('runtime.sourceTitle')}</strong></div><span>{schedule?.enabled ? t('runtime.scheduleOn') : t('runtime.scheduleOff')}</span></div><div className="runtime-source-actions"><button className="inspector-secondary-button" onClick={() => setHistoryOpen((value) => !value)}><History size={14} /> {t('runtime.history')}</button><button className="inspector-secondary-button" onClick={() => void toggleSchedule()}><CalendarClock size={14} /> {schedule?.enabled ? t('runtime.disableSchedule') : t('runtime.enableSchedule')}</button></div><label className="runtime-source-interval">{t('runtime.interval')}<select value={scheduleInterval} onChange={(event) => setScheduleInterval(Number(event.target.value))}><option value={300}>{t('runtime.interval5m')}</option><option value={900}>{t('runtime.interval15m')}</option><option value={3600}>{t('runtime.interval1h')}</option></select></label>{serviceMessage && <small className="runtime-source-error">{serviceMessage}</small>}{historyOpen && <div className="runtime-history-list">{history.length === 0 ? <small>{t('runtime.noHistory')}</small> : history.slice(0, 10).map((entry) => <div key={entry.snapshotId}><span><strong>{entry.readyCount} / {entry.detectedCount}</strong><small>{formatDateShort(entry.committedAt, formatDateTime)}</small></span><button className="icon-button" onClick={() => void restore(entry.snapshotId)} aria-label={t('runtime.restore')} title={t('runtime.restore')}><History size={13} /></button></div>)}</div>}</section>}
    <input ref={fileRef} className="visually-hidden" type="file" accept=".yaml,.yml,.json,.txt,.conf,.config,text/plain,text/yaml,application/yaml,application/json" onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = '' }} />
    <p className="cache-privacy-note">{t('inspector.cachePrivacy')}</p>
    {node.data.subscriptionInputKind === 'file' && !snapshot && <div className="mock-note">{t('inspector.fileReimport')}</div>}
    {nodesOpen && <NodesPreview snapshot={localizedSnapshot} initialStatus={nodePreviewStatus} onClose={() => setNodesOpen(false)} />}
    {changesOpen && runtime?.latestDiff && <ChangesPreview diff={runtime.latestDiff} nodeCount={result?.detectedCount ?? 0} onClose={() => setChangesOpen(false)} />}
    {clearConfirmOpen && <div className="subscription-dialog-backdrop" role="presentation" onMouseDown={() => setClearConfirmOpen(false)}><section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-cache-title" onMouseDown={(event) => event.stopPropagation()}><span className="confirmation-icon"><Database size={20} /></span><h2 id="clear-cache-title">{t('subscription.cache.clearTitle')}</h2><p>{t('subscription.cache.clearDescription')}</p><footer><button ref={clearCancelRef} className="secondary-action" onClick={() => setClearConfirmOpen(false)}>{t('subscription.cache.cancel')}</button><button className="danger-action" onClick={() => { setClearConfirmOpen(false); void clearCache(node.id) }}>{t('subscription.cache.confirm')}</button></footer></section></div>}
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

function sourceStatus(runtime: SubscriptionRuntimeRecord | undefined, freshness: SubscriptionFreshness, t: ReturnType<typeof useI18n>['t']) {
  if (runtime?.refreshStatus === 'loading') return t('inspector.sourceStatus.loading')
  if (runtime?.refreshStatus === 'failed' && runtime.latestError?.code === 'SUBSCRIPTION_CORS_BLOCKED') return t('inspector.sourceStatus.cors')
  if (runtime?.refreshStatus === 'failed' && runtime.latestError && ['SUBSCRIPTION_UNSUPPORTED_FORMAT', 'SUBSCRIPTION_PARSE_FAILED', 'SUBSCRIPTION_NO_USABLE_NODES'].includes(runtime.latestError.code)) return t('inspector.sourceStatus.parseFailed')
  if (runtime?.refreshStatus === 'failed' && runtime.activeSnapshot) return t('inspector.sourceStatus.usingLkg')
  if (runtime?.refreshStatus === 'failed') return t('inspector.sourceStatus.failed')
  if (runtime?.activeState === 'empty') return t('inspector.sourceStatus.empty')
  if (runtime?.activeSnapshot && freshness === 'stale') return t('inspector.sourceStatus.stale')
  if (runtime?.activeSnapshot) return t('inspector.sourceStatus.ready')
  return t('inspector.sourceStatus.idle')
}

function statusClass(runtime: SubscriptionRuntimeRecord | undefined) {
  if (runtime?.refreshStatus === 'loading') return 'loading'
  if (runtime?.refreshStatus === 'failed') return 'failed'
  if (runtime?.activeSnapshot) return 'ready'
  return 'idle'
}

function formatLabel(format: string, locale: 'en-US' | 'zh-CN') {
  const labels = locale === 'zh-CN'
    ? { base64: 'Base64 URI 列表', 'share-links': 'URI 列表', 'clash-yaml': 'Mihomo / Clash YAML', 'clash-json': 'Mihomo / Clash JSON', 'sub-store-json': 'Sub-Store JSON', 'sing-box-json': 'sing-box JSON', 'v2ray-json': 'V2Ray JSON', surge: 'Surge', surfboard: 'Surfboard', loon: 'Loon', 'quantumult-x': 'Quantumult X', egern: 'Egern', stash: 'Stash', unsupported: '不支持的格式' }
    : { base64: 'Base64 URI List', 'share-links': 'URI List', 'clash-yaml': 'Mihomo / Clash YAML', 'clash-json': 'Mihomo / Clash JSON', 'sub-store-json': 'Sub-Store JSON', 'sing-box-json': 'sing-box JSON', 'v2ray-json': 'V2Ray JSON', surge: 'Surge', surfboard: 'Surfboard', loon: 'Loon', 'quantumult-x': 'Quantumult X', egern: 'Egern', stash: 'Stash', unsupported: 'Unsupported format' }
  return labels[format as keyof typeof labels] ?? format
}

function formatSourceTimestamp(value: string | undefined, format: ReturnType<typeof useI18n>['formatDateTime']) {
  if (!value) return '—'
  return format(value, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function formatDateShort(value: string, format: ReturnType<typeof useI18n>['formatDateTime']) {
  return format(value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatSnapshotAge(value: string | undefined, t: ReturnType<typeof useI18n>['t']) {
  if (!value) return t('inspector.notAvailable')
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000))
  if (minutes < 60) return t('inspector.ageMinutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return t('inspector.ageHours', { count: hours })
  return t('inspector.ageDays', { count: Math.floor(hours / 24) })
}

function ManualProxyInspector({ node }: InspectorProps) {
  const { t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const protocol = node.data.proxyProtocol === 'socks' ? 'socks5' : node.data.proxyProtocol ?? 'socks5'
  const usesPassword = ['shadowsocks', 'trojan', 'anytls'].includes(protocol)
  const usesUuid = ['vmess', 'vless'].includes(protocol)
  const usesTls = ['http', 'trojan', 'vmess', 'vless', 'anytls'].includes(protocol)
  const usesTransport = ['trojan', 'vmess', 'vless'].includes(protocol)
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    <Field label={t('inspector.protocol')}><select value={protocol} onChange={(event) => {
      const proxyProtocol = event.target.value as BlockNodeData['proxyProtocol']
      update(node.id, { proxyProtocol, ...(proxyProtocol === 'anytls' && node.data.proxyPort === 1080 ? { proxyPort: 443 } : {}) })
    }}>{(['http', 'socks5', 'shadowsocks', 'trojan', 'vmess', 'vless', 'anytls'] as SupportedProxyProtocol[]).map((value) => <option key={value} value={value}>{proxyProtocolLabel(value)}</option>)}</select></Field>
    <TextField node={node} field="proxyServer" label={t('inspector.server')} placeholder="proxy.example.com" />
    <Field label={t('inspector.port')}><input type="number" min="1" max="65535" value={node.data.proxyPort ?? 1080} onChange={(event) => update(node.id, { proxyPort: Number(event.target.value) })} /></Field>
    {['http', 'socks5'].includes(protocol) && <><TextField node={node} field="proxyUsername" label={t('inspector.username')} /><Field label={t('inspector.password')}><input type="password" value={node.data.proxyPassword ?? ''} onChange={(event) => update(node.id, { proxyPassword: event.target.value })} /></Field></>}
    {usesPassword && <Field label={t('inspector.password')}><input type="password" value={node.data.proxyPassword ?? ''} onChange={(event) => update(node.id, { proxyPassword: event.target.value })} /></Field>}
    {protocol === 'shadowsocks' && <TextField node={node} field="proxyMethod" label={t('inspector.cipher')} placeholder="aes-128-gcm" />}
    {usesUuid && <TextField node={node} field="proxyUuid" label="UUID" placeholder="00000000-0000-4000-8000-000000000000" />}
    {protocol === 'vmess' && <><TextField node={node} field="proxySecurity" label={t('inspector.security')} placeholder="auto" /><Field label={t('inspector.alterId')}><input type="number" min="0" value={node.data.proxyAlterId ?? 0} onChange={(event) => update(node.id, { proxyAlterId: Number(event.target.value) })} /></Field></>}
    {usesTls && <Advanced><label className="toggle-row compact"><span><strong>TLS</strong></span><input type="checkbox" disabled={protocol === 'anytls'} checked={protocol === 'anytls' || node.data.proxyTls || protocol === 'trojan'} onChange={(event) => update(node.id, { proxyTls: event.target.checked })} /></label>{(node.data.proxyTls || protocol === 'trojan' || protocol === 'anytls') && <><TextField node={node} field="proxyServerName" label={t('inspector.serverName')} /><label className="check-row"><input type="checkbox" checked={node.data.proxyAllowInsecure ?? false} onChange={(event) => update(node.id, { proxyAllowInsecure: event.target.checked })} /> {t('inspector.allowInsecure')}</label></>}{protocol === 'anytls' && <><TextField node={node} field="proxyClientFingerprint" label={t('inspector.clientFingerprint')} placeholder="chrome" /><Field label={t('inspector.idleCheckInterval')}><input type="number" min="1" value={node.data.proxyIdleSessionCheckInterval ?? 30} onChange={(event) => update(node.id, { proxyIdleSessionCheckInterval: Number(event.target.value) })} /></Field><Field label={t('inspector.idleTimeout')}><input type="number" min="1" value={node.data.proxyIdleSessionTimeout ?? 30} onChange={(event) => update(node.id, { proxyIdleSessionTimeout: Number(event.target.value) })} /></Field><Field label={t('inspector.minIdleSession')}><input type="number" min="0" value={node.data.proxyMinIdleSession ?? 0} onChange={(event) => update(node.id, { proxyMinIdleSession: Number(event.target.value) })} /></Field></>}{usesTransport && <><Field label={t('inspector.transport')}><select value={node.data.proxyTransport ?? 'tcp'} onChange={(event) => update(node.id, { proxyTransport: event.target.value as BlockNodeData['proxyTransport'] })}><option value="tcp">TCP</option><option value="ws">WebSocket</option><option value="http">HTTP</option><option value="grpc">gRPC</option></select></Field>{['ws', 'http'].includes(node.data.proxyTransport ?? 'tcp') && <><TextField node={node} field="proxyTransportPath" label={t('inspector.path')} /><TextField node={node} field="proxyTransportHost" label={t('inspector.host')} /></>}{node.data.proxyTransport === 'grpc' && <TextField node={node} field="proxyGrpcServiceName" label={t('inspector.serviceName')} />}</>}</Advanced>}
    <div className="mock-note">{t('inspector.manualProxyNote')}</div>
  </>
}

function FilterInspector({ node }: InspectorProps) {
  const { locale, t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const materialized = useNodeMaterialization(node.id)
  const mode = node.data.filterMode ?? inferLegacyFilterMode(node.data)
  const operation = node.data.filterOperation ?? inferLegacyFilterOperation(node.data)
  const regions = node.data.filterMode === 'region'
    ? node.data.filterRegions ?? []
    : operation === 'exclude' ? node.data.excludeRegions ?? [] : node.data.includeRegions ?? []
  const regexPattern = node.data.filterMode === 'regex'
    ? node.data.filterRegexPattern ?? ''
    : operation === 'exclude' ? node.data.excludeRegex ?? '' : node.data.includeRegex ?? ''
  const regexError = mode === 'regex' ? invalidRegex(regexPattern) : false
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    <Field label={t('inspector.filterMode')}><div className="segmented-control" role="group" aria-label={t('inspector.filterMode')}>
      {(['keyword', 'region', 'regex'] as const).map((value) => <button type="button" className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} key={value} onClick={() => update(node.id, { filterMode: value, filterOperation: operation })}>{t(`inspector.filterMode.${value}`)}</button>)}
    </div></Field>
    <Field label={t('inspector.filterOperation')}><div className="segmented-control segmented-control--two" role="group" aria-label={t('inspector.filterOperation')}>
      {(['include', 'exclude'] as const).map((value) => <button type="button" className={operation === value ? 'is-active' : ''} aria-pressed={operation === value} key={value} onClick={() => update(node.id, { filterMode: mode, filterOperation: value })}>{t(`inspector.filterOperation.${value}`)}</button>)}
    </div></Field>
    {mode === 'keyword' && <Field label={t('inspector.filterKeyword')} hint={t('inspector.filterKeywordHint')}><input value={node.data.filterMode === 'keyword' ? node.data.filterKeyword ?? '' : legacyKeyword(node.data, operation)} placeholder={t('inspector.filterKeywordPlaceholder')} onChange={(event) => update(node.id, { filterMode: 'keyword', filterOperation: operation, filterKeyword: event.target.value })} /></Field>}
    {mode === 'region' && <RegionMultiSelect values={regions} onChange={(filterRegions) => update(node.id, { filterMode: 'region', filterOperation: operation, filterRegions })} />}
    {mode === 'regex' && <>
      <Field label={t('inspector.filterRegexPattern')} hint={t('inspector.filterRegexHint')}><textarea className={regexError ? 'is-invalid' : ''} value={regexPattern} placeholder="^(HK|SG)-" onChange={(event) => update(node.id, { filterMode: 'regex', filterOperation: operation, filterRegexPattern: event.target.value })} aria-invalid={regexError} /></Field>
      <label className="toggle-row compact"><span><strong>{t('inspector.filterIgnoreCase')}</strong><small>{t('inspector.filterIgnoreCaseHint')}</small></span><input type="checkbox" checked={node.data.filterRegexIgnoreCase ?? true} onChange={(event) => update(node.id, { filterMode: 'regex', filterOperation: operation, filterRegexIgnoreCase: event.target.checked })} /></label>
      {regexError && <div className="field-validation is-error"><AlertTriangle size={14} /><span>{localizeDiagnosticMessage('FILTER_INVALID_REGEX', 'Filter regular expression is invalid.', locale)}</span></div>}
    </>}
    <ProcessingDebug materialized={materialized} />
  </>
}

function RegionMultiSelect({ values, onChange }: { values: RegionCode[]; onChange: (values: RegionCode[]) => void }) {
  const { locale, t } = useI18n()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const canonicalValues = [...new Set(values.map((value) => value === 'UK' ? 'GB' : value))]
  const options = searchRegions(query, locale).filter((entry) => !canonicalValues.includes(entry.code))
  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])
  const select = (code: RegionCode) => {
    onChange([...canonicalValues, code])
    setQuery('')
    setActiveIndex(0)
    setOpen(true)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => options.length ? (index + 1) % options.length : 0); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex((index) => options.length ? (index - 1 + options.length) % options.length : 0); return }
    if (event.key === 'Enter' && open && options[activeIndex]) { event.preventDefault(); select(options[activeIndex].code) }
  }
  return <Field label={t('inspector.filterRegions')} hint={t('inspector.filterRegionsHint')}><div ref={rootRef} className="region-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    {canonicalValues.length > 0 && <div className="region-chip-list">{canonicalValues.map((code) => {
      const item = REGION_CATALOG.find((entry) => entry.code === code)
      return <span key={code}>{item?.flag ?? '🌐'} {regionLabel(code, locale)}<button type="button" onClick={() => onChange(canonicalValues.filter((value) => value !== code))} aria-label={t('inspector.removeRegion', { region: regionLabel(code, locale) })}><X size={12} /></button></span>
    })}</div>}
    <div className="region-combobox-input"><input role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && options[activeIndex] ? `${listId}-${options[activeIndex].code}` : undefined} value={query} placeholder={t('inspector.filterRegionSearch')} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0) }} onKeyDown={onKeyDown} /><ChevronDown size={15} /></div>
    {open && <div className="region-options" id={listId} role="listbox">{options.map((item, index) => <button type="button" id={`${listId}-${item.code}`} role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'is-active' : ''} key={item.code} onPointerDown={(event) => event.preventDefault()} onClick={() => select(item.code)}><span>{item.flag}</span><strong>{locale === 'zh-CN' ? item.zh : item.en}</strong><code>{item.code}</code></button>)}{options.length === 0 && <span className="region-options-empty">{t('inspector.filterNoRegions')}</span>}</div>}
  </div></Field>
}

function inferLegacyFilterMode(data: BlockNodeData): NonNullable<BlockNodeData['filterMode']> {
  if (data.includeRegions?.length || data.excludeRegions?.length) return 'region'
  if (data.includeRegex || data.excludeRegex) return 'regex'
  return 'keyword'
}

function inferLegacyFilterOperation(data: BlockNodeData): NonNullable<BlockNodeData['filterOperation']> {
  return data.exclude?.length || data.excludeRegions?.length || data.excludeRegex ? 'exclude' : 'include'
}

function legacyKeyword(data: BlockNodeData, operation: NonNullable<BlockNodeData['filterOperation']>) {
  return (operation === 'exclude' ? data.exclude : data.include)?.[0] ?? ''
}

function invalidRegex(pattern: string) {
  if (!pattern.trim()) return false
  try { new RegExp(pattern); return false } catch { return true }
}

function RenameInspector({ node }: InspectorProps) {
  const { locale, t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const materialized = useNodeMaterialization(node.id)
  const mode = node.data.renameMode ?? 'regex'
  const regexError = mode === 'regex' && invalidRegex(node.data.renamePattern ?? '')
  const modified = materialized.input.filter((proxy, index) => proxy.name !== materialized.output[index]?.name).length
  return <><TextField node={node} field="title" label={t('inspector.name')} />
    <Field label={t('inspector.renameMode')}><div className="segmented-control segmented-control--two" role="group" aria-label={t('inspector.renameMode')}>
      {(['simple', 'regex'] as const).map((value) => <button type="button" className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} key={value} onClick={() => update(node.id, { renameMode: value })}>{t(`inspector.renameMode.${value}`)}</button>)}
    </div></Field>
    <Field label={mode === 'regex' ? t('inspector.regexPattern') : t('inspector.renameFind')}><input className={regexError ? 'is-invalid' : ''} value={node.data.renamePattern ?? ''} aria-invalid={regexError} onChange={(event) => update(node.id, { renamePattern: event.target.value })} /></Field>
    {regexError && <div className="field-validation is-error"><AlertTriangle size={14} /><span>{localizeDiagnosticMessage('INVALID_RENAME_REGEX', 'The rename regular expression is invalid. Processing was blocked.', locale)}</span></div>}
    <TextField node={node} field="renameReplacement" label={t('inspector.replacement')} />
    {mode === 'regex' && <>
      <label className="toggle-row compact"><span><strong>{t('inspector.renameIgnoreCase')}</strong><small>{t('inspector.renameIgnoreCaseHint')}</small></span><input type="checkbox" checked={node.data.renameIgnoreCase ?? false} onChange={(event) => update(node.id, { renameIgnoreCase: event.target.checked })} /></label>
      <label className="toggle-row compact"><span><strong>{t('inspector.renameGlobal')}</strong><small>{t('inspector.renameGlobalHint')}</small></span><input type="checkbox" checked={node.data.renameGlobal ?? true} onChange={(event) => update(node.id, { renameGlobal: event.target.checked })} /></label>
    </>}
    <div className="rename-preview"><span>{t('inspector.beforeAfter')}</span>{materialized.input.slice(0, 3).map((proxy, index) => <div key={proxy.id}><code>{proxy.name}</code><b>→</b><code>{materialized.output[index]?.name ?? proxy.name}</code></div>)}<small>{t('inspector.renameModified', { count: modified })}</small></div><ProcessingDebug materialized={materialized} /></>
}

function SortInspector({ node }: InspectorProps) {
  const { t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const materialized = useNodeMaterialization(node.id)
  return <><TextField node={node} field="title" label={t('inspector.name')} /><Field label={t('inspector.sortBy')}><select value={node.data.sortBy ?? 'name'} onChange={(event) => update(node.id, { sortBy: event.target.value as BlockNodeData['sortBy'] })}><option value="name">{t('inspector.sort.name')}</option><option value="region">{t('inspector.sort.region')}</option><option value="protocol">{t('inspector.sort.protocol')}</option><option value="latency" disabled>{t('inspector.sort.latency')}</option></select></Field><Field label={t('inspector.direction')}><select value={node.data.sortDirection ?? 'ascending'} onChange={(event) => update(node.id, { sortDirection: event.target.value as BlockNodeData['sortDirection'] })}><option value="ascending">{t('inspector.ascending')}</option><option value="descending">{t('inspector.descending')}</option></select></Field><ProcessingDebug materialized={materialized} /></>
}

function DedupeInspector({ node }: InspectorProps) {
  const { t } = useI18n()
  return <><TextField node={node} field="title" label={t('inspector.name')} /><div className="mock-note">{t('inspector.dedupeNote')}</div><ProcessingDebug materialized={useNodeMaterialization(node.id)} /></>
}

function LimitInspector({ node }: InspectorProps) {
  const { t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const [draft, setDraft] = useState(() => String(node.data.limit ?? 10))
  useEffect(() => setDraft(String(node.data.limit ?? 10)), [node.id, node.data.limit])
  const parsed = parseLimitDraft(draft)
  const invalid = parsed.status !== 'number' || !parsed.valid
  return <><TextField node={node} field="title" label={t('inspector.name')} /><Field label={t('inspector.firstN')}><input type="number" min="1" step="1" value={draft} aria-invalid={invalid} onChange={(event) => {
    const nextDraft = event.target.value
    setDraft(nextDraft)
    const next = parseLimitDraft(nextDraft)
    if (next.status === 'number' && next.valid) update(node.id, { limit: next.value })
  }} /></Field>{invalid && <div className="field-validation is-error"><AlertTriangle size={14} /><span>{t('inspector.limitInvalid')}</span></div>}<ProcessingDebug materialized={useNodeMaterialization(node.id)} /></>
}

function MergeInspector({ node }: InspectorProps) {
  const { t } = useI18n()
  return <><TextField node={node} field="title" label={t('inspector.name')} /><div className="mock-note">{t('inspector.mergeNote')}</div><ProcessingDebug materialized={useNodeMaterialization(node.id)} /></>
}

interface NodeMaterializationView {
  transform?: import('../../core/ir').TransformIR
  input: import('../../core/ir').ResolvedProxyEndpointIR[]
  output: import('../../core/ir').ResolvedProxyEndpointIR[]
  status: 'ready' | 'error'
  issues: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error'; entityId?: string }>
  inputCount: number
  outputCount: number
  removedCount: number
}

function useNodeMaterialization(nodeId: string): NodeMaterializationView {
  const { locale } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const snapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const toProject = useBuilderStore((state) => state.toProject)
  return useMemo(() => {
    const graph = compileGraph(toProject(), {
      subscriptionSnapshots: localizeSubscriptionSnapshots(snapshots, locale),
      retainDraftOnErrorForDiagnostics: true,
    })
    if (!graph.ir) return { input: [], output: [], status: 'error' as const, issues: [], inputCount: 0, outputCount: 0, removedCount: 0 }
    const transform = graph.ir.transforms.find((item) => item.id === nodeId)
    if (!transform) {
      const issues = graph.issues.filter((issue) => issue.nodeId === nodeId).map((issue) => ({
        code: issue.code, message: issue.message, severity: issue.severity, entityId: issue.nodeId,
      }))
      return { input: [], output: [], status: issues.some((issue) => issue.severity === 'error') ? 'error' as const : 'ready' as const, issues, inputCount: 0, outputCount: 0, removedCount: 0 }
    }
    const context = createMaterializationContext()
    const output = materializeProxySet(graph.ir, { kind: 'transform', id: nodeId }, context)
    const inputs = transform.kind === 'merge' ? transform.inputs : [transform.input]
    const input = inputs.flatMap((ref) => materializeProxySet(graph.ir!, ref, context).proxies)
    const relevantNodeIds = upstreamNodeIds(nodeId, edges)
    const compileIssues = graph.issues.filter((issue) => issue.nodeId && relevantNodeIds.has(issue.nodeId)).map((issue) => ({
      code: issue.code, message: issue.message, severity: issue.severity, entityId: issue.nodeId,
    }))
    const issues = deduplicateRuntimeIssues([...compileIssues, ...output.issues])
    return {
      transform, input, output: output.proxies, status: output.status === 'error' || issues.some((issue) => issue.severity === 'error') ? 'error' : 'ready',
      issues, inputCount: input.length, outputCount: output.outputCount, removedCount: input.length - output.outputCount,
    }
  }, [edges, locale, nodeId, nodes, snapshots, toProject])
}

function upstreamNodeIds(nodeId: string, edges: GraphEdge[]) {
  const ids = new Set([nodeId])
  const pending = [nodeId]
  while (pending.length) {
    const current = pending.pop()!
    for (const edge of edges) {
      if (edge.target !== current || edge.data?.semantic !== 'data' || ids.has(edge.source)) continue
      ids.add(edge.source)
      pending.push(edge.source)
    }
  }
  return ids
}

function deduplicateRuntimeIssues(issues: NodeMaterializationView['issues']) {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.code}\u0000${issue.entityId ?? ''}\u0000${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function ProcessingDebug({ materialized }: { materialized: NodeMaterializationView }) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const [preview, setPreview] = useState<'input' | 'output' | null>(null)
  const proxies = preview === 'input' ? materialized.input : materialized.output
  const explanation = explainProcessing(materialized.transform, materialized.input, materialized.output)
  return <><div className={`processing-debug${materialized.status === 'error' ? ' is-error' : ''}`}><div><span>{t('inspector.input')}</span><strong>{materialized.inputCount}</strong></div><div><span>{t('inspector.output')}</span><strong>{materialized.outputCount}</strong></div><div><span>{t('inspector.removed')}</span><strong>{materialized.removedCount}</strong></div></div>{explanation && <ProcessingExplanationView explanation={explanation} />}{materialized.issues.map((issue) => {
    const issueNode = issue.entityId ? nodes.find((node) => node.id === issue.entityId) : undefined
    const upstream = issueNode && issueNode.id !== selectedNodeId
    return <div className={`processing-issue is-${issue.severity}`} key={`${issue.code}-${issue.entityId ?? ''}-${issue.message}`}><code>{issue.code}</code><span>{upstream && <strong>{t('inspector.upstreamIssue', { node: localizeNodeTitle(issueNode, locale) })}</strong>}{localizeDiagnosticMessage(issue.code, issue.message, locale)}</span>{upstream && <button type="button" onClick={() => selectNode(issueNode.id)}>{t('inspector.locateIssue')}</button>}</div>
  })}<div className="processing-preview-actions"><button disabled={!materialized.input.length} onClick={() => setPreview('input')}>{t('inspector.viewInput')}</button><button disabled={!materialized.output.length} onClick={() => setPreview('output')}>{t('inspector.viewOutput')}</button></div>{preview && <NodesPreview snapshot={snapshotFromProxies(proxies)} onClose={() => setPreview(null)} />}</>
}

function ProcessingExplanationView({ explanation }: { explanation: ProcessingExplanation }) {
  const { t } = useI18n()
  const text = explanation.kind === 'filter'
    ? t(explanation.mode === 'criterion' ? 'inspector.processingExplanation.filterCriterion' : 'inspector.processingExplanation.filterConditions', { input: explanation.inputCount, output: explanation.outputCount, removed: explanation.removedCount })
    : explanation.kind === 'rename'
      ? t('inspector.processingExplanation.rename', { mode: explanation.mode === 'simple' ? t('inspector.renameMode.simple') : t('inspector.renameMode.regex'), changed: explanation.changedCount })
      : explanation.kind === 'sort'
        ? t('inspector.processingExplanation.sort', { by: explanation.by === 'name' ? t('inspector.sort.name') : explanation.by === 'region' ? t('inspector.sort.region') : explanation.by === 'protocol' ? t('inspector.sort.protocol') : t('inspector.sort.latency'), direction: explanation.direction === 'ascending' ? t('inspector.ascending') : t('inspector.descending'), reordered: explanation.reorderedCount })
        : explanation.kind === 'deduplicate'
          ? t('inspector.processingExplanation.deduplicate', { removed: explanation.removedCount })
          : explanation.kind === 'merge'
            ? t('inspector.processingExplanation.merge', { sources: explanation.sourceCount, output: explanation.outputCount })
            : t('inspector.processingExplanation.limit', { max: explanation.max ?? '—', input: explanation.inputCount, output: explanation.outputCount, removed: explanation.removedCount })
  return <div className="processing-explanation"><span>{t('inspector.processingExplanation.label')}</span><p>{text}</p></div>
}

function snapshotFromProxies(proxies: import('../../core/ir').ResolvedProxyEndpointIR[]) {
  const timestamp = new Date(0).toISOString()
  const result = { format: 'share-links' as const, proxies, issues: [], nodes: proxies.map((endpoint) => ({ id: endpoint.id, name: endpoint.name, protocol: endpoint.protocol, server: endpoint.server, port: endpoint.port, sourceId: endpoint.metadata?.sourceId ?? 'pipeline', sourceName: endpoint.metadata?.sourceName ?? 'Pipeline', status: endpoint.metadata?.compatibility?.status === 'partial' ? 'partial' as const : 'ready' as const, endpoint, issues: [] })), detectedCount: proxies.length, readyCount: proxies.filter((proxy) => proxy.metadata?.compatibility?.status !== 'partial').length, partialCount: proxies.filter((proxy) => proxy.metadata?.compatibility?.status === 'partial').length, unsupportedCount: 0 }
  return {
    snapshotId: 'pipeline-preview', sourceId: 'pipeline', snapshotSchemaVersion: 1 as const, identityAlgorithmVersion: 1 as const,
    inputKind: 'paste' as const, createdAt: timestamp, fetchedAt: timestamp, parsedAt: timestamp, committedAt: timestamp,
    contentHash: 'pipeline-preview', sourceConfigFingerprint: 'pipeline-preview', format: 'share-links' as const,
    result, readyCount: result.readyCount, partialCount: result.partialCount, unsupportedCount: 0, issues: [], quality: proxies.length ? 'usable' as const : 'empty' as const,
  }
}

function StrategyInspector({ node }: InspectorProps) {
  const { locale, t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const incoming = useMemo(() => edges.filter((edge) => edge.target === node.id && ['data', 'strategy'].includes(String(edge.data?.semantic))).map((edge) => nodes.find((item) => item.id === edge.source)).filter((item): item is GraphNode => Boolean(item)), [edges, node.id, nodes])
  const runtime = usePipelineNodeRuntime(node.id)
  const materializedCandidates = incoming.filter((item) => item.data.blockType !== 'proxy-chain')
  const emptyCandidates = runtime !== undefined && runtime.outputCount === 0
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    <Field label={t('inspector.nodeSource')}><div className="source-reference"><Link2 size={14} /><span>{incoming.map((item) => localizeNodeTitle(item, locale)).join(locale === 'zh-CN' ? '、' : ', ') || t('inspector.sourceMissing')}</span></div></Field>
    <div className="strategy-kind-card"><span>{t('inspector.strategyType')}</span><strong>{localizeDataValue(node.data.blockType, blockTitleKey(node.data.blockType), locale)}</strong></div>
    {(node.data.blockType === 'auto-select' || node.data.blockType === 'fallback') && <TextField node={node} field="testUrl" label={t('inspector.testUrl')} />}
    <div className="metric-cards"><div><span>{t('inspector.candidates')}</span><strong className="compact-metric">{runtime?.outputCount ?? 0}</strong></div><div><span>{t('inspector.status')}</span><strong className={runtime?.status === 'error' ? '' : 'good-metric'}>{runtime?.status === 'error' ? t('inspector.blocked') : t('inspector.ready')}</strong></div></div>
    {(node.data.blockType === 'auto-select' || node.data.blockType === 'fallback') && <Advanced><Field label={t('inspector.testInterval')}><div className="input-with-unit"><input type="number" min="5" step="5" value={node.data.interval ?? 300} onChange={(event) => update(node.id, { interval: Math.max(1, Number(event.target.value)) })} /><span>{t('inspector.seconds')}</span></div></Field><Field label={t('inspector.tolerance')}><div className="input-with-unit"><input type="number" min="0" step="10" value={node.data.tolerance ?? 50} onChange={(event) => update(node.id, { tolerance: Math.max(0, Number(event.target.value)) })} /><span>ms</span></div></Field></Advanced>}
    {node.data.blockType === 'load-balance' && <Advanced><div className="strategy-advanced-note">{t('inspector.loadBalanceAdvancedHint')}</div><Field label={t('inspector.loadBalanceMode')}><select value={node.data.loadBalanceMode ?? 'round-robin'} onChange={(event) => update(node.id, { loadBalanceMode: event.target.value as BlockNodeData['loadBalanceMode'] })}><option value="round-robin">{t('inspector.loadBalance.roundRobin')}</option><option value="consistent-hash">{t('inspector.loadBalance.consistentHash')}</option></select></Field></Advanced>}
    {node.data.blockType !== 'fixed-proxy' && <div className="candidate-list"><span>{t('inspector.incomingCandidates')}</span>{materializedCandidates.length ? materializedCandidates.map((item) => <code key={item.id}>{localizeNodeTitle(item, locale)}</code>) : <small>{t('inspector.sourceMissing')}</small>}</div>}
    {emptyCandidates
      ? <div className="strategy-explanation is-warning"><AlertTriangle size={14} /><span><strong>{t('inspector.emptyCandidates')}</strong><small>{incoming.length ? t('inspector.emptyCandidatesHint') : t('inspector.connectStrategySource')}</small></span></div>
      : runtime && <div className="strategy-explanation is-ready"><Check size={14} /><span><strong>{strategyExplanationTitle(node.data.blockType, t)}</strong><small>{strategyExplanation(node, runtime.outputCount, t)}</small></span></div>}
  </>
}

function strategyExplanationTitle(blockType: BlockNodeData['blockType'], t: ReturnType<typeof useI18n>['t']) {
  if (blockType === 'manual-select') return t('inspector.strategyExplanation.manualTitle')
  if (blockType === 'auto-select') return t('inspector.strategyExplanation.autoTitle')
  if (blockType === 'fallback') return t('inspector.strategyExplanation.fallbackTitle')
  if (blockType === 'load-balance') return t('inspector.strategyExplanation.loadBalanceTitle')
  return t('inspector.strategyExplanation.readyTitle')
}

function strategyExplanation(node: GraphNode, count: number, t: ReturnType<typeof useI18n>['t']) {
  if (node.data.blockType === 'auto-select') return t('inspector.strategyExplanation.auto', { count, url: node.data.testUrl ?? '—', interval: node.data.interval ?? 300 })
  if (node.data.blockType === 'fallback') return t('inspector.strategyExplanation.fallback', { count, url: node.data.testUrl ?? '—', interval: node.data.interval ?? 300 })
  if (node.data.blockType === 'load-balance') return t('inspector.strategyExplanation.loadBalance', { count, mode: node.data.loadBalanceMode === 'consistent-hash' ? t('inspector.loadBalance.consistentHash') : t('inspector.loadBalance.roundRobin') })
  return t('inspector.strategyExplanation.manual', { count })
}

function usePipelineNodeRuntime(nodeId: string) {
  const { locale } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const snapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const toProject = useBuilderStore((state) => state.toProject)
  return useMemo(() => deriveProjectRuntime(toProject(), localizeSubscriptionSnapshots(snapshots, locale)).get(nodeId), [edges, locale, nodeId, nodes, snapshots, toProject])
}

function FixedStrategyInspector({ node }: InspectorProps) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const update = useBuilderStore((state) => state.updateNodeData)
  const proxies = nodes.filter((item) => item.data.blockType === 'manual-proxy')
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    <Field label={t('inspector.fixedProxy')}><select value={node.data.proxyId ?? ''} onChange={(event) => update(node.id, { proxyId: event.target.value })}><option value="" disabled>{t('inspector.selectManualProxy')}</option>{proxies.map((proxy) => <option key={proxy.id} value={proxy.id}>{localizeNodeTitle(proxy, locale)}</option>)}</select></Field>
    <div className="mock-note">{t('inspector.fixedNote')}</div>
  </>
}

function ChainInspector({ node }: InspectorProps) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const addHop = useBuilderStore((state) => state.addHop)
  const removeHop = useBuilderStore((state) => state.removeHop)
  const moveHop = useBuilderStore((state) => state.moveHop)
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    <div className="section-label"><span>{t('inspector.chain')}</span><small>{t('inspector.hops', { count: node.data.hopIds?.length ?? 0 })}</small></div>
    <div className="hop-list">
      {(node.data.hopIds ?? []).map((hopId, index, all) => {
        const hop = nodes.find((item) => item.id === hopId)
        if (!hop) return null
        return <div className="hop-wrap" key={hopId}>
          <div className="hop-card"><GripVertical size={14} /><span className="hop-index">{index + 1}</span><div><strong>{localizeDataValue(hop.data.title, hop.data.titleKey, locale)}</strong><small>{localizeDataValue(hop.data.subtitle, hop.data.subtitleKey, locale)}</small></div><div className="hop-actions"><button disabled={index === 0} onClick={() => moveHop(node.id, index, index - 1)}><ArrowUp size={12} /></button><button disabled={index === all.length - 1} onClick={() => moveHop(node.id, index, index + 1)}><ArrowDown size={12} /></button><button onClick={() => removeHop(node.id, hopId)}><Trash2 size={12} /></button></div></div>
          {index < all.length - 1 && <div className="hop-connector"><ArrowDown size={12} /></div>}
        </div>
      })}
    </div>
    <button className="dashed-button" onClick={() => addHop(node.id)}><Plus size={14} /> {t('inspector.addHop')}</button>
    <div className="chain-summary"><span>{t('inspector.trafficPath')}</span><strong>{(node.data.hopIds ?? []).map((id) => { const item = nodes.find((candidate) => candidate.id === id); return item ? localizeNodeTitle(item, locale) : undefined }).filter(Boolean).join(' → ') || t('inspector.notConfigured')}</strong></div>
    <Advanced><Field label={t('inspector.connectionTimeout')}><div className="input-with-unit"><input defaultValue="10" /><span>{t('inspector.seconds')}</span></div></Field><Field label={t('inspector.retryCount')}><select defaultValue="2"><option>1</option><option>2</option><option>3</option></select></Field><label className="toggle-row compact"><span><strong>{t('inspector.udpRelay')}</strong></span><input type="checkbox" defaultChecked /></label></Advanced>
  </>
}

function RoutingInspector({ node }: InspectorProps) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const activeService = useBuilderStore((state) => state.activeService)
  const update = useBuilderStore((state) => state.updateNodeData)
  const setTarget = useBuilderStore((state) => state.setRoutingTarget)
  const moveRoutingRule = useBuilderStore((state) => state.moveRoutingRule)
  const targets = nodes.filter((item) => ['strategy', 'chain'].includes(item.data.category))
  const [rulesOpen, setRulesOpen] = useState(false)
  const [servicePickerOpen, setServicePickerOpen] = useState(false)
  const [serviceQuery, setServiceQuery] = useState('')
  const services = node.data.services ?? []
  const matcherKind = resolveRouteMatcherKind(node.data)
  const isRouteRule = isRoutingRuleType(node.data.blockType)
  const isServiceRoute = matcherKind === 'service'
  const isAdvancedMatcher = Boolean(matcherKind && ADVANCED_ROUTE_MATCHERS.includes(matcherKind))
  const selectedServices = services.map((value) => serviceCatalog.find((service) => service.id === value || service.name === value)).filter(Boolean)
  const availableServices = serviceCatalog.filter((service) => !services.includes(service.id) && !services.includes(service.name) && `${service.name} ${service.description ?? ''}`.toLowerCase().includes(serviceQuery.trim().toLowerCase()))
  const matcherValue = node.data.routeMatcherValue ?? ''
  const order = routeOrder(node.id, nodes)
  const setMatcher = (value: BlockNodeData['routeMatcherKind']) => update(node.id, {
    routeMatcherKind: value,
    ...(value === 'service' ? { routeMatcherValue: undefined, routeMatcherPort: undefined } : { services: [] }),
    ...(value !== 'port' ? { routeMatcherPort: undefined } : {}),
    ...(value === 'service' ? { ruleSource: node.data.ruleSource ?? 'ios_rule_script' } : {}),
  })
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    {isRouteRule && <Field label={t('inspector.matcherType')}>
      <select value={isAdvancedMatcher ? '' : matcherKind ?? ''} onChange={(event) => setMatcher(event.target.value as BlockNodeData['routeMatcherKind'])}>
        <option value="" disabled>{t('inspector.selectBasicMatcher')}</option>
        {BASIC_ROUTE_MATCHERS.map((value) => <option key={value} value={value}>{matcherLabel(value, t)}</option>)}
      </select>
    </Field>}
    {isRouteRule && isServiceRoute && <><div className="section-label"><span>{t('inspector.services')}</span><button type="button" aria-expanded={servicePickerOpen} onClick={() => setServicePickerOpen((open) => !open)}>{servicePickerOpen ? <ChevronUp size={13} /> : <Plus size={13} />} {servicePickerOpen ? t('inspector.collapse') : t('inspector.add')}</button></div>
    <div className="service-list">{services.map((service) => { const definition = serviceCatalog.find((item) => item.id === service || item.name === service); const label = definition?.name ?? service; return <div className={activeService === service || activeService === definition?.name ? 'is-active' : ''} key={service}><AssetIcon className="service-avatar" src={definition?.icon} darkSrc={definition?.iconDark} fallback={label.slice(0, 1)} /><span><strong>{localizeKnownSystemText(label, locale)}</strong><small>{definition?.description ?? t('inspector.serviceDefinition')}</small></span><button type="button" aria-label={`${t('inspector.removeService')} ${label}`} onClick={() => update(node.id, { services: services.filter((item) => item !== service) })}><X size={15} /></button></div> })}</div>
    {servicePickerOpen && <div className="service-picker"><div className="service-picker-heading"><div className="service-search"><Search size={15} /><input autoFocus value={serviceQuery} placeholder={t('inspector.searchServices')} onChange={(event) => setServiceQuery(event.target.value)} /></div><button type="button" className="service-picker-collapse" onClick={() => setServicePickerOpen(false)} aria-label={t('inspector.collapse')} title={t('inspector.collapse')}><ChevronUp size={16} /></button></div><div className="service-picker-options">{availableServices.map((service) => <button type="button" key={service.id} onClick={() => { update(node.id, { services: [...services, service.id] }); setServiceQuery('') }}><AssetIcon className="service-avatar" src={service.icon} darkSrc={service.iconDark} fallback={service.name.slice(0, 1)} /><span><strong>{localizeKnownSystemText(service.name, locale)}</strong><small>{service.description}</small></span><Plus size={15} /></button>)}{availableServices.length === 0 && <small>{t('inspector.noServices')}</small>}</div></div>}</>}
    {isRouteRule && !isServiceRoute && !isAdvancedMatcher && matcherKind && <MatcherValueField node={node} kind={matcherKind} matcherValue={matcherValue} update={update} t={t} />}
    <Field label={t('inspector.targetStrategy')}><select value={node.data.targetKind === 'direct' ? '__direct__' : node.data.targetKind === 'reject' ? '__reject__' : node.data.targetId ?? ''} onChange={(event) => setTarget(node.id, event.target.value)}><option value="" disabled>{t('inspector.selectTarget')}</option><option value="__direct__">DIRECT</option><option value="__reject__">REJECT</option>{targets.map((target) => <option key={target.id} value={target.id}>{localizeNodeTitle(target, locale)}</option>)}</select></Field>
    {isRouteRule && order && <div className="route-order"><span><strong>{t('inspector.routeOrder', { index: order.index + 1, count: order.count })}</strong><small>{t('inspector.routeOrderHint')}</small></span><div><button type="button" disabled={!order.canMoveUp} aria-label={t('inspector.moveRuleUp')} onClick={() => moveRoutingRule(node.id, 'up')}><ArrowUp size={14} /></button><button type="button" disabled={!order.canMoveDown} aria-label={t('inspector.moveRuleDown')} onClick={() => moveRoutingRule(node.id, 'down')}><ArrowDown size={14} /></button></div></div>}
    <div className="route-preview"><span className="route-source">{localizeNodeTitle(node, locale)}</span><ArrowLeftRight size={14} /><span className="route-target">{node.data.targetLabel ? localizeKnownSystemText(node.data.targetLabel, locale) : t('inspector.notConfigured')}</span></div>
    {isRouteRule && isServiceRoute && <><div className="rule-source-card"><div><span>{t('inspector.ruleSource')}</span><strong>{node.data.ruleSource === 'builtin' ? 'ProxyFlow' : 'ios_rule_script'}</strong><small>{node.data.ruleSource === 'builtin' ? t('inspector.builtinMetadata') : 'blackmatrix7 / ios_rule_script'}</small></div><a href="https://github.com/blackmatrix7/ios_rule_script" target="_blank" rel="noreferrer" aria-label={t('inspector.viewRuleSource')}><ExternalLink size={14} /></a></div>
    <button className="inspector-secondary-button" onClick={() => setRulesOpen((open) => !open)}><Eye size={14} /> {rulesOpen ? t('inspector.hideRules') : t('inspector.showRules')}</button>
    {rulesOpen && <div className="actual-rules"><div><span>{t('inspector.generatedServiceRules')}</span><code>{selectedServices.map((service) => service?.id).join(', ') || '—'}</code></div><small>{t('inspector.rulesDemoNote')}</small></div>}</>}
    {isRouteRule && <Advanced>
      <Field label={t('inspector.advancedMatcher')}>
        <select value={isAdvancedMatcher ? matcherKind : '__none__'} onChange={(event) => setMatcher(event.target.value === '__none__' ? 'domain-suffix' : event.target.value as BlockNodeData['routeMatcherKind'])}>
          <option value="__none__">{t('inspector.noAdvancedMatcher')}</option>
          {ADVANCED_ROUTE_MATCHERS.map((value) => <option key={value} value={value}>{matcherLabel(value, t)}</option>)}
        </select>
      </Field>
      {isAdvancedMatcher && matcherKind && <MatcherValueField node={node} kind={matcherKind} matcherValue={matcherValue} update={update} t={t} />}
      <Field label={t('inspector.routePriority')} hint={t('inspector.routePriorityHint')}><input type="number" min="0" step="1" value={node.data.routePriority ?? ''} placeholder="10" onChange={(event) => update(node.id, { routePriority: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)) })} /></Field>
      {matcherKind && <div className="actual-rules"><div><span>{t('inspector.matcherPreview')}</span><code>{formatMatcherPreview(matcherKind, matcherKind === 'port' ? node.data.routeMatcherPort : matcherKind === 'service' ? services.join(', ') : matcherValue)}</code></div></div>}
    </Advanced>}
  </>
}

function MatcherValueField({ node, kind, matcherValue, update, t }: { node: GraphNode; kind: NonNullable<BlockNodeData['routeMatcherKind']>; matcherValue: string; update: ReturnType<typeof useBuilderStore.getState>['updateNodeData']; t: ReturnType<typeof useI18n>['t'] }) {
  if (kind === 'service') return null
  return kind === 'port'
    ? <Field label={t('inspector.matcherValue')}><input type="number" min="1" max="65535" value={node.data.routeMatcherPort ?? ''} placeholder="443" onChange={(event) => update(node.id, { routeMatcherPort: Number(event.target.value) })} /></Field>
    : <Field label={t('inspector.matcherValue')} hint={kind === 'geo-ip' ? 'ISO 3166-1 alpha-2' : undefined}><input value={matcherValue} placeholder={matcherPlaceholder(kind)} onChange={(event) => update(node.id, { routeMatcherValue: event.target.value })} /></Field>
}

function matcherLabel(kind: NonNullable<BlockNodeData['routeMatcherKind']>, t: ReturnType<typeof useI18n>['t']) {
  if (kind === 'service') return t('inspector.matcher.service')
  if (kind === 'domain') return t('inspector.matcher.domain')
  if (kind === 'domain-suffix') return t('inspector.matcher.domainSuffix')
  if (kind === 'domain-keyword') return t('inspector.matcher.domainKeyword')
  if (kind === 'ip-cidr') return t('inspector.matcher.ipCidr')
  if (kind === 'ip-cidr6') return t('inspector.matcher.ipCidr6')
  if (kind === 'port') return t('inspector.matcher.port')
  if (kind === 'asn') return t('inspector.matcher.asn')
  if (kind === 'geo-ip') return t('inspector.matcher.geoIp')
  if (kind === 'geo-site') return t('inspector.matcher.geoSite')
  return t('inspector.matcher.ruleSet')
}

function matcherPlaceholder(kind: NonNullable<BlockNodeData['routeMatcherKind']>) {
  if (kind === 'service') return ''
  if (kind === 'domain' || kind === 'domain-suffix' || kind === 'domain-keyword') return 'example.com'
  if (kind === 'ip-cidr' || kind === 'ip-cidr6') return kind === 'ip-cidr6' ? '2001:db8::/32' : '192.0.2.0/24'
  if (kind === 'asn') return 'AS15169'
  if (kind === 'geo-ip') return 'US'
  if (kind === 'geo-site') return 'geolocation-!cn'
  return 'rule-set-id'
}

function formatMatcherPreview(kind: NonNullable<BlockNodeData['routeMatcherKind']>, value: string | number | undefined) {
  const normalized = String(value ?? '').trim() || '—'
  return `${kind.toUpperCase()} ${normalized}`
}

function OutputInspector({ node }: InspectorProps) {
  const { locale, t } = useI18n()
  const setOutputClient = useBuilderStore((state) => state.setOutputClient)
  const setPreviewOpen = useBuilderStore((state) => state.setPreviewOpen)
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const toProject = useBuilderStore((state) => state.toProject)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const graph = useMemo(() => compileGraph(toProject(), { subscriptionSnapshots: localizeSubscriptionSnapshots(subscriptionSnapshots, locale) }), [edges, locale, nodes, projectId, projectName, subscriptionSnapshots, toProject])
  const supported = node.data.client === 'mihomo' || node.data.client === 'sing-box'
  const target = useTargetCompile(graph.ir, supported ? node.data.client : undefined, graph.success)
  const errors = graph.success ? target.result?.issues.filter((issue) => issue.severity === 'error').length ?? 0 : graph.issues.filter((issue) => issue.severity === 'error').length
  const warnings = graph.success ? target.result?.issues.filter((issue) => issue.severity === 'warning').length ?? 0 : graph.issues.filter((issue) => issue.severity === 'warning').length
  const info = target.result?.issues.filter((issue) => issue.severity === 'info').length ?? 0
  const compiled = supported && graph.success && target.status === 'success'
  return <>
    <Field label={t('inspector.targetClient')}><div className="client-grid">{outputDefinitions.map((output) => <button className={node.data.client === output.target ? 'is-selected' : ''} key={output.id} onClick={() => setOutputClient(node.id, output.target)}><AssetIcon className="client-icon" src={output.icon} darkSrc={output.iconDark} fallback={output.label.slice(0, 1)} /><strong>{output.label}</strong><small>{output.status === 'supported' ? t('node.compatibility.supported') : output.status === 'prototype' ? t('node.compatibility.prototype') : t('preview.notImplemented')}</small>{node.data.client === output.target && <Check className="client-check" size={15} />}</button>)}</div></Field>
    <div className="compat-card"><ShieldCheck size={18} /><div><strong>{t('inspector.compatibility')}</strong><span>{!supported ? t('inspector.clientUnavailable') : target.status === 'loading' ? t('inspector.loadingCompiler') : compiled ? t('inspector.warningInfo', { warnings, info }) : t('inspector.errorNoOutput', { errors })}</span></div><b>{!supported ? t('inspector.unsupported') : target.status === 'loading' ? t('preview.loading') : compiled ? t('preview.compiled') : t('inspector.blocked')}</b></div>
    <button className="inspector-primary-button" onClick={() => setPreviewOpen(true)}><Eye size={15} /> {t('inspector.previewConfig')}</button>
    <div className="mock-note">{t('inspector.realCompilerNote')}</div>
  </>
}

function DnsInspector({ node }: InspectorProps) {
  const { t } = useI18n()
  return <><TextField node={node} field="title" label={t('inspector.name')} /><TextField node={node} field="resolver" label={t('inspector.remoteDns')} /><Field label={t('inspector.resolutionMode')}><select value="basic" disabled><option value="basic">{t('inspector.basicDns')}</option></select></Field><Advanced><Field label="Bootstrap DNS"><input value="223.5.5.5" readOnly /></Field></Advanced><div className="mock-note">{t('inspector.dnsNote')}</div></>
}

function GenericInspector({ node }: InspectorProps) {
  const { t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  return <><TextField node={node} field="title" label={t('inspector.name')} /><TextField node={node} field="subtitle" label={t('inspector.description')} /><label className="toggle-row"><span><strong>{t('inspector.enableBlock')}</strong><small>{t('inspector.enableBlockHint')}</small></span><input type="checkbox" checked={!node.data.disabled} onChange={(event) => update(node.id, { disabled: !event.target.checked })} /></label><Advanced><div className="mock-note">{t('inspector.moreSettingsNote')}</div></Advanced></>
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

function RouteInspectorPanel() {
  const { t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const projectName = useBuilderStore((state) => state.projectName)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const toProject = useBuilderStore((state) => state.toProject)
  const [query, setQuery] = useState<RouteQuery>({})
  const project = useMemo(() => toProject(), [edges, nodes, projectName, toProject])
  const graph = useMemo(() => compileGraph(project, {
    subscriptionSnapshots,
    retainDraftOnErrorForDiagnostics: true,
  }), [project, subscriptionSnapshots])
  const result = useMemo(() => graph.ir ? inspectRoute(graph.ir, query) : undefined, [graph.ir, query])
  const services = project.services.filter((service) => service.id && service.name)
  const setField = (field: keyof RouteQuery, value: string) => setQuery((current) => ({
    ...current,
    [field]: field === 'port' ? (value ? Number(value) : undefined) : value,
  }))
  const clear = () => setQuery({})
  const target = result?.target
  const strategy = target?.strategy
  return <section className="route-inspector-panel">
    <div className="route-inspector-heading"><div><span>{t('inspector.routeInspectorKicker')}</span><h3>{t('inspector.routeInspectorTitle')}</h3></div><button type="button" className="icon-button" onClick={clear} aria-label={t('inspector.routeInspectorClear')} title={t('inspector.routeInspectorClear')}><X size={14} /></button></div>
    <p className="route-inspector-intro">{t('inspector.routeInspectorDescription')}</p>
    <div className="route-inspector-query">
      <Field label={t('inspector.routeInspectorHostname')}><input value={query.hostname ?? ''} placeholder={t('inspector.routeInspectorHostnamePlaceholder')} onChange={(event) => setField('hostname', event.target.value)} /></Field>
      <Field label={t('inspector.routeInspectorIp')}><input value={query.ip ?? ''} placeholder={t('inspector.routeInspectorIpPlaceholder')} onChange={(event) => setField('ip', event.target.value)} /></Field>
      <Field label={t('inspector.routeInspectorPort')}><input type="number" min="1" max="65535" value={query.port ?? ''} placeholder="443" onChange={(event) => setField('port', event.target.value)} /></Field>
      <Field label={t('inspector.routeInspectorService')}><select value={query.serviceId ?? ''} onChange={(event) => setField('serviceId', event.target.value)}><option value="">{t('inspector.routeInspectorAnyService')}</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></Field>
    </div>
    {!graph.success && <div className="route-inspector-blocked"><AlertTriangle size={14} /><span>{t('inspector.routeInspectorCompileBlocked')}</span></div>}
    {graph.success && result?.status === 'unresolved' && <div className="route-inspector-empty"><Search size={16} /><span>{t('inspector.routeInspectorEnterQuery')}</span></div>}
    {graph.success && result && result.status !== 'unresolved' && <div className="route-inspector-result">
      <div className="route-inspector-result-header"><span>{result.status === 'matched' ? t('inspector.routeInspectorMatched') : t('inspector.routeInspectorDefault')}</span><strong>{result.matchedRule?.name ?? t('inspector.routeInspectorDefaultRoute')}</strong></div>
      {result.matchedRule && <div className="route-inspector-detail"><span>{t('inspector.routeInspectorPriority')}</span><strong>{result.matchedRule.priority}</strong><small>{formatRouteReason(result.matchedRule.reason, t)}</small></div>}
      {target && <div className="route-inspector-detail"><span>{t('inspector.routeInspectorTarget')}</span><strong>{target.label}</strong><small>{target.kind === 'direct' ? t('inspector.routeInspectorDirect') : target.kind === 'reject' ? t('inspector.routeInspectorReject') : t('inspector.routeInspectorStrategy')}</small></div>}
      {strategy && <>
        <div className="route-inspector-detail"><span>{t('inspector.routeInspectorCandidatePath')}</span><strong>{strategy.candidatePath.join(' → ') || t('inspector.routeInspectorNoCandidates')}</strong><small>{t('inspector.routeInspectorCandidateCount', { count: strategy.candidateCount })}</small></div>
        <div className="route-inspector-targets"><span>{t('inspector.routeInspectorCompatibility')}</span><div><b>{t('preview.yamlCompiler')}</b><em className={`is-${strategy.targetSupport.mihomo}`}>{strategy.targetSupport.mihomo}</em></div><div><b>{t('preview.jsonCompiler')}</b><em className={`is-${strategy.targetSupport['sing-box']}`}>{strategy.targetSupport['sing-box']}</em></div></div>
      </>}
      <details className="route-inspector-rules"><summary>{t('inspector.routeInspectorConsideredRules', { count: result.evaluations.length })}</summary>{result.evaluations.map((evaluation) => <div key={evaluation.routeId} className={evaluation.matched ? 'is-matched' : ''}><strong>{evaluation.name}</strong><span>{t('inspector.routeInspectorPriorityValue', { priority: evaluation.priority })}</span><small>{formatRouteReason(evaluation.reason, t)}</small></div>)}</details>
    </div>}
  </section>
}

function formatRouteReason(reason: RouteInspectionResult['evaluations'][number]['reason'], t: ReturnType<typeof useI18n>['t']) {
  if (reason.code === 'service-match') return t('inspector.routeInspectorReason.serviceMatch')
  if (reason.code === 'domain-exact-match') return t('inspector.routeInspectorReason.domainExact')
  if (reason.code === 'domain-suffix-match') return t('inspector.routeInspectorReason.domainSuffix')
  if (reason.code === 'domain-keyword-match') return t('inspector.routeInspectorReason.domainKeyword')
  if (reason.code === 'cidr-match') return t('inspector.routeInspectorReason.cidr')
  if (reason.code === 'port-match') return t('inspector.routeInspectorReason.port')
  if (reason.code === 'input-missing') return t('inspector.routeInspectorReason.missingInput', { field: reason.detail ?? '' })
  if (reason.code === 'unsupported-matcher') return t('inspector.routeInspectorReason.unsupported', { matcher: reason.detail ?? '' })
  return t('inspector.routeInspectorReason.noMatch')
}

export function Inspector() {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId)
  const selectedEdgeId = useBuilderStore((state) => state.selectedEdgeId)
  const deleteSelected = useBuilderStore((state) => state.deleteSelected)
  const addNode = useBuilderStore((state) => state.addNode)
  const resetToDemo = useBuilderStore((state) => state.resetToDemo)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const deleteCancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (deleteConfirmOpen) deleteCancelRef.current?.focus() }, [deleteConfirmOpen])
  const selected = nodes.find((node) => node.id === selectedNodeId)
  const edge = edges.find((item) => item.id === selectedEdgeId)
  const issues = useMemo(() => validateGraph(nodes, edges), [nodes, edges])
  const issue = issues.find((item) => item.nodeId === selectedNodeId)

  if (!selected && edge) return <aside className="inspector"><div className="panel-heading inspector-heading"><div><span>{t('inspector.connection')}</span><h2>{t('inspector.connectionProperties')}</h2></div></div><div className="inspector-scroll"><div className="edge-inspector-visual"><span /><Link2 size={18} /><span /></div><Field label={t('inspector.semantic')}><input value={String(edge.data?.semantic ?? 'data')} readOnly /></Field><div className="edge-endpoints"><div><span>{t('inspector.from')}</span><strong>{localizeNodeTitle(nodes.find((node) => node.id === edge.source)!, locale)}</strong></div><ArrowLeftRight size={15} /><div><span>{t('inspector.to')}</span><strong>{localizeNodeTitle(nodes.find((node) => node.id === edge.target)!, locale)}</strong></div></div><button className="danger-button" onClick={deleteSelected}><Trash2 size={14} /> {t('inspector.deleteConnection')}</button></div></aside>

  if (!selected) return <aside className="inspector"><div className="panel-heading inspector-heading"><div><span>{t('inspector.title')}</span><h2>{t('inspector.properties')}</h2></div></div><div className="inspector-scroll">{isStarterProject(nodes) && <StarterActions onAddSubscription={() => addNode('subscription', { x: 120, y: 120 })} onLoadDemo={resetToDemo} />}{!isStarterProject(nodes) && <RouteInspectorPanel />}<div className="inspector-empty"><div className="inspector-empty-graphic"><span /><span /><span /><Link2 size={18} /></div><h3>{t('inspector.selectNode')}</h3><p>{t('inspector.selectNodeHint')}</p><div><kbd>⌘</kbd><span>+</span><kbd>K</kbd><small>{t('inspector.quickSearch')}</small></div></div></div></aside>

  const Content = inspectorRegistry[selected.data.blockType] ?? GenericInspector
  const requestDelete = () => selected.data.blockType === 'subscription' ? setDeleteConfirmOpen(true) : deleteSelected()
  return <aside className="inspector">
    <div className="inspector-node-header">
      <div className={`node-icon node-icon--${selected.data.category}`}><BlockIcon name={selected.data.icon} size={18} /></div>
      <div><span>{t(categoryKey(selected.data.category))}</span><h2>{localizeNodeTitle(selected, locale)}</h2></div>
      {!selected.data.protected && <button onClick={requestDelete} aria-label={t('inspector.deleteNode')}><Trash2 size={15} /></button>}
    </div>
    {issue && <div className={`validation-banner validation-banner--${issue.severity}`}><AlertTriangle size={15} /><span><strong>{t('inspector.needsConfig')}</strong>{localizeDiagnosticMessage(issue.code, issue.message, locale)}</span></div>}
    <div className="inspector-scroll"><Content node={selected} /></div>
    {deleteConfirmOpen && <div className="subscription-dialog-backdrop" role="presentation" onMouseDown={() => setDeleteConfirmOpen(false)}><section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-subscription-title" onMouseDown={(event) => event.stopPropagation()}><span className="confirmation-icon is-warning"><Trash2 size={20} /></span><h2 id="delete-subscription-title">{t('subscription.delete.title')}</h2><p>{t('subscription.delete.description')}</p><footer><button ref={deleteCancelRef} className="secondary-action" onClick={() => setDeleteConfirmOpen(false)}>{t('subscription.delete.cancel')}</button><button className="danger-action" onClick={() => { setDeleteConfirmOpen(false); deleteSelected() }}>{t('subscription.delete.confirm')}</button></footer></section></div>}
  </aside>
}

function StarterActions({ onAddSubscription, onLoadDemo }: { onAddSubscription: () => void; onLoadDemo: () => void }) {
  const { t } = useI18n()
  return <section className="starter-actions"><span>{t('inspector.starterKicker')}</span><h3>{t('inspector.starterTitle')}</h3><p>{t('inspector.starterDescription')}</p><div><button className="primary-action" onClick={onAddSubscription}><Plus size={14} /> {t('inspector.starterAddSource')}</button><button className="secondary-action" onClick={onLoadDemo}><LayoutTemplate size={14} /> {t('inspector.starterLoadDemo')}</button></div></section>
}
