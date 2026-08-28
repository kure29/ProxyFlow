import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, CalendarClock, Check, ChevronDown,
  ClipboardPaste, Database, Eye, FileOutput, FileUp, GitCompareArrows, Globe2, GripVertical, LayoutTemplate, Link2, Plus, RefreshCw, Search, ShieldCheck, Trash2, X,
  History,
} from 'lucide-react'
import { useBuilderStore } from '../../store/useBuilderStore'
import { validateGraph } from '../../core/validation/validateProject'
import { productionOutputDefinitions } from '../../data/demoProject'
import { serviceCatalog } from '../../data/serviceCatalog'
import { currentAuthoringServices, resolveLegacyServiceDefinition } from '../../data/legacyServices'
import { compileGraph } from '../../core/graphCompiler'
import type { BlockNodeData, GraphEdge, GraphNode, ServiceDefinition } from '../../types/project'
import { BlockIcon } from '../icons/BlockIcon'
import { AssetIcon } from '../icons/AssetIcon'
import { ServiceMark } from '../services/ServiceMark'
import { WebSelect } from '../ui/WebSelect'
import { RegionPicker } from './RegionPicker'
import { useTargetCompile } from '../compiler/useTargetCompile'
import { NodesPreview } from '../subscription/NodesPreview'
import { ChangesPreview } from '../subscription/ChangesPreview'
import { proxyProtocolLabel, type RegionCode, type SupportedProxyProtocol } from '../../core/proxy'
import {
  normalizePersistedSubscriptionExportMode, normalizeSubscriptionRequestProfile, snapshotFreshness,
  type SubscriptionExportMode, type SubscriptionFreshness, type SubscriptionRefreshError,
  type SubscriptionRequestProfile, type SubscriptionRuntimeRecord,
} from '../../core/subscription'
import { ADVANCED_ROUTE_MATCHERS, BASIC_ROUTE_MATCHERS, isRoutingRuleType, resolveRouteMatcherKind, routeMatcherSelectionPatch } from '../../core/routing/routeProductModel'
import { finalDnsFailedOptionsPatch, getFinalDnsFailedUiState, isFinalTargetConfigured } from '../../core/routing/finalOptionsProductModel'
import { getRouteNoResolveUiState, routeNoResolveOptionsPatch, isRouteMatcherConfigured } from '../../core/routing/routeOptionsProductModel'
import { getSurgeGeneralNetworkUiState, removeSurgeGeneralNetworkOptions, surgeGeneralNetworkFieldChoice, surgeGeneralNetworkOptionsPatch, type SurgeGeneralNetworkChoice, type SurgeGeneralNetworkField } from '../../core/routing/generalNetworkProductModel'
import { inspectRoute, type RouteInspectionResult, type RouteQuery } from '../../core/routing/routeInspector'
import { ServerRuntimeProvider, type RuntimeHistoryEntry, type RuntimeSchedule } from '../../core/runtime'
import { createMaterializationContext, deriveProjectRuntime, explainProcessing, materializeProxySet, parseLimitDraft, planRemoteProxySource, planRemoteSourceUsage, type ProcessingExplanation, type RemoteSourceLoweringPlan } from '../../core/proxySet'
import { isStarterProject } from './starterState'
import {
  blockTitleKey, categoryKey, localizeDataValue, localizeDiagnosticMessage, localizeKnownSystemText, localizeNodeTitle,
  localizeSubscriptionSnapshots, regionLabel, useI18n,
} from '../../i18n'
import { normalizeDnsResolvers } from '../../core/dns/resolverProfiles'
import type { WorkspaceSectionId } from '../../core/workspace'
import {
  getTargetCapabilities, isPrimaryTarget, isProductTarget, PRODUCT_TARGETS, resolveActiveProductTarget,
  type PrimaryTarget,
} from '../../core/capabilities'
import {
  isTargetNativeRuleSetSourceConfig, isTargetNativeSourcePortConfig, isTargetNativeStrategyConfig, isValidSourcePort, surgeBuiltinRuleSetSourceConfig,
  surgeBuiltinRuleSetSourceId,
  isTargetNativeSurgeGeneralNetworkConfig,
  type PolicyReference, type SurgeBuiltinRuleSetName, type SurgeNativeStrategyConfig, type SurgeSubnetMatcher,
} from '../../core/targetNative'
import { resolveTargetNativeSurgeGeneralNetworkForOutput } from '../compiler/useProjectCompiles'
import {
  parseCustomRuleSource, validateCustomRuleSourceForTarget, type CustomRuleSourceIssue,
  type CustomRuleSourceRequestedFormat,
} from '../../core/routing/customRuleSource'
import {
  positionViewportPopover, readPopoverViewport, type ViewportPopoverPosition,
} from '../ui/viewportPopover'

interface InspectorProps {
  node: GraphNode
  onOpenWorkspaceSection?: (section: WorkspaceSectionId) => void
}

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
  const projectNodes = useBuilderStore((state) => state.nodes)
  const projectEdges = useBuilderStore((state) => state.edges)
  const toProject = useBuilderStore((state) => state.toProject)
  const allSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const snapshot = useBuilderStore((state) => state.subscriptionSnapshots[node.id])
  const runtime = useBuilderStore((state) => state.subscriptionRuntimes[node.id])
  const refresh = useBuilderStore((state) => state.refreshSubscription)
  const parseInput = useBuilderStore((state) => state.parseSubscriptionInput)
  const clearCache = useBuilderStore((state) => state.clearCachedSubscription)
  const runtimeService = useBuilderStore((state) => state.runtimeService)
  const projectId = useBuilderStore((state) => state.projectId)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
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
  const requestProfile = normalizeSubscriptionRequestProfile(node.data.subscriptionRequestProfile)
  const activeProductTarget = resolveActiveProductTarget(primaryTarget)
  const exportMode = normalizePersistedSubscriptionExportMode(node.data.subscriptionExportMode)
  const exportModeHint = exportMode === 'remote'
    ? t('inspector.exportMode.remoteHint')
    : exportMode === 'materialized' ? t('inspector.exportMode.materializedHint') : t('inspector.exportMode.autoHint')
  const remotePlans = useMemo(() => {
    const graph = compileGraph(toProject(), { subscriptionSnapshots: allSnapshots, retainDraftOnErrorForDiagnostics: true, validationTarget: activeProductTarget })
    if (!graph.ir) return undefined
    return PRODUCT_TARGETS.map((target) => {
      const capabilities = getTargetCapabilities(target)
      const usages = planRemoteSourceUsage(graph.ir!, node.id, capabilities.remoteProxySource)
      const plans = usages.length > 0
        ? usages
        : [{ consumerId: node.id, consumerName: t('inspector.exportMode.directPath'), plan: planRemoteProxySource(graph.ir!, { kind: 'source', id: node.id }, capabilities.remoteProxySource, 'select') }]
      return { target, label: capabilities.label, plans }
    })
  }, [activeProductTarget, allSnapshots, exportMode, node.id, projectEdges, projectNodes, requestProfile, t, toProject])
  useEffect(() => { if (clearConfirmOpen) clearCancelRef.current?.focus() }, [clearConfirmOpen])
  useEffect(() => {
    if (inputKind === 'paste') setPaste(node.data.subscriptionContent ?? '')
  }, [inputKind, node.data.subscriptionContent, node.id])
  const localizedSnapshot = snapshot ? localizeSubscriptionSnapshots({ [node.id]: snapshot }, locale)[node.id] : undefined
  const result = localizedSnapshot?.result
  const freshness = snapshot ? snapshotFreshness(snapshot.committedAt) : runtime?.freshness ?? 'fresh'
  const fetchPath = inputKind === 'url' ? runtime?.latestFetchPath ?? (runtimeService ? 'runtime' : 'browser') : 'local'
  const fetchPathLabel = fetchPath === 'runtime'
    ? t('inspector.sourcePath.runtime')
    : fetchPath === 'browser' ? t('inspector.sourcePath.browser') : t('inspector.sourcePath.local')
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
      else { const next = await runtimeProvider.saveSchedule(node.data.subscriptionUrl ?? '', scheduleInterval, true, requestProfile); setSchedule(next) }
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
    {inputKind === 'url' && <Field label={t('inspector.requestProfile')} hint={runtimeService ? t('inspector.requestProfileHint') : t('inspector.requestProfileLocalHint')}><WebSelect label={t('inspector.requestProfile')} value={requestProfile} onChange={(value) => update(node.id, { subscriptionRequestProfile: value as SubscriptionRequestProfile })} options={[{ value: 'auto', label: t('inspector.requestProfile.auto') }, { value: 'mihomo', label: t('inspector.requestProfile.mihomo') }, { value: 'sing-box', label: t('inspector.requestProfile.singBox') }, { value: 'generic', label: t('inspector.requestProfile.generic') }]} /></Field>}
    {inputKind === 'url' && <><Field label={t('inspector.exportMode')} hint={exportModeHint}><WebSelect label={t('inspector.exportMode')} value={exportMode} onChange={(value) => update(node.id, { subscriptionExportMode: value as SubscriptionExportMode })} options={[{ value: 'auto', label: t('inspector.exportMode.auto') }, { value: 'remote', label: t('inspector.exportMode.remote') }, { value: 'materialized', label: t('inspector.exportMode.materialized') }]} /></Field><RemoteSourceStatus targets={remotePlans} /></>}
    {inputKind === 'paste' && <div className="source-input-panel"><Field label={t('inspector.nodeLinks')} hint={t('inspector.nodeLinksHint')}><textarea className="node-links-input" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder={'vmess://…\nvless://…\nss://…'} /></Field><button className="inspector-primary-button" disabled={!paste.trim()} onClick={() => void parseInput(node.id, paste, 'paste')}><ClipboardPaste size={15} /> {t('inspector.parseImport')}</button></div>}
    {inputKind === 'file' && <button type="button" className="config-file-picker" onClick={() => fileRef.current?.click()}><FileUp size={20} /><span><strong>{node.data.subscriptionFileName ?? t('inspector.noFileSelected')}</strong><small>{node.data.subscriptionFileName ? t('inspector.replaceConfigFile') : t('inspector.chooseConfigFile')}</small></span></button>}
    <label className="toggle-row"><span><strong>{t('inspector.enableSubscription')}</strong><small>{t('inspector.enableSubscriptionHint')}</small></span><input type="checkbox" checked={node.data.enabled ?? false} onChange={(event) => update(node.id, { enabled: event.target.checked })} /></label>
    <div className={`source-status-card is-${statusClass(runtime)}`}>
      <span>{t('inspector.fetchStatus')} · {fetchPathLabel}</span>
      <strong>{sourceStatus(runtime, freshness, t)}</strong>
      {runtime?.refreshStatus === 'failed' && runtime.latestError
        ? <div className="source-error-detail"><code>{runtime.latestError.code}</code><span>{sourceErrorMessage(runtime.latestError, fetchPath === 'runtime', locale, t)}</span></div>
        : <small>{runtime?.cacheError ? localizeDiagnosticMessage(runtime.cacheError.code, runtime.cacheError.message, locale) : result ? t('inspector.snapshotReady') : t('inspector.waitingInput')}</small>}
    </div>
    {runtime && <div className="source-timestamps"><div><span>{t('inspector.lastSuccessful')}</span><strong>{formatSourceTimestamp(runtime.lastSuccessfulAt, formatDateTime)}</strong></div><div><span>{t('inspector.latestAttempt')}</span><strong>{formatSourceTimestamp(runtime.lastAttemptAt, formatDateTime)}</strong></div><div><span>{t('inspector.snapshotAge')}</span><strong>{formatSnapshotAge(snapshot?.committedAt, t)}</strong></div></div>}
    <div className="metric-cards"><div><span>{t('inspector.detected')}</span><strong>{result?.detectedCount ?? 0}</strong></div><div><span>{t('inspector.usable')}</span><strong>{result ? result.readyCount + result.partialCount : 0}</strong></div></div>
    {result && <div className="import-summary"><div><span>{t('inspector.ready')}</span><strong>{result.readyCount}</strong></div><div><span>{t('inspector.warnings')}</span><strong>{result.partialCount}</strong></div><div><span>{t('inspector.unsupported')}</span><strong>{result.unsupportedCount}</strong></div></div>}
    {runtime?.refreshStatus === 'failed' && runtime.activeSnapshot && <div className="validation-banner validation-banner--warning"><AlertTriangle size={15} /><span><strong>{t('inspector.refreshFailed')}</strong>{t('inspector.cachedResult')}</span></div>}
    {freshness === 'stale' && runtime?.activeSnapshot && <div className="runtime-inline-status"><span className="status-dot-label status-stale"><i /> {t('inspector.sourceStatus.stale')}</span></div>}
    {runtime?.latestDiff && <button className="diff-summary-button" onClick={() => setChangesOpen(true)}><GitCompareArrows size={14} /><span>{runtime.latestDiff.isInitialBaseline ? t('subscription.diff.initial', { count: result?.detectedCount ?? 0 }) : `+${runtime.latestDiff.added}  -${runtime.latestDiff.removed}  ~${runtime.latestDiff.changed}  =${runtime.latestDiff.unchanged}`}</span></button>}
    {protocols.length > 0 && <SummaryList label={t('inspector.protocols')} items={protocols} />}
    {regions.length > 0 && <SummaryList label={t('inspector.regions')} items={regions.map(([code, count]) => [`${code} · ${regionLabel(code, locale)}`, count])} />}
    <div className="subscription-actions">{inputKind === 'url' && <button className="inspector-secondary-button" onClick={() => void refresh(node.id)}><RefreshCw className={runtime?.refreshStatus === 'loading' ? 'spin' : ''} size={14} /> {runtime?.refreshStatus === 'failed' ? t('inspector.retry') : t('inspector.refresh')}</button>}<button className="inspector-secondary-button" disabled={!result?.nodes.length} onClick={() => { setNodePreviewStatus('all'); setNodesOpen(true) }}><Eye size={14} /> {t('inspector.viewNodes')}</button><button className="inspector-secondary-button" disabled={!result || result.partialCount + result.unsupportedCount === 0} onClick={() => { setNodePreviewStatus('issues'); setNodesOpen(true) }}><AlertTriangle size={14} /> {t('inspector.viewIssues')}</button><button className="inspector-secondary-button" disabled={!runtime?.latestDiff} onClick={() => setChangesOpen(true)}><GitCompareArrows size={14} /> {t('inspector.viewChanges')}</button>{inputKind === 'url' && <button className="inspector-secondary-button" disabled={!snapshot} onClick={() => setClearConfirmOpen(true)}><Database size={14} /> {t('inspector.clearCachedSnapshot')}</button>}</div>
    {runtimeProvider && <section className="runtime-source-panel"><div className="runtime-source-heading"><div><span>{t('runtime.sourceKicker')}</span><strong>{t('runtime.sourceTitle')}</strong></div><span>{schedule?.enabled ? t('runtime.scheduleOn') : t('runtime.scheduleOff')}</span></div><div className="runtime-source-actions"><button className="inspector-secondary-button" onClick={() => setHistoryOpen((value) => !value)}><History size={14} /> {t('runtime.history')}</button><button className="inspector-secondary-button" onClick={() => void toggleSchedule()}><CalendarClock size={14} /> {schedule?.enabled ? t('runtime.disableSchedule') : t('runtime.enableSchedule')}</button></div>{schedule?.enabled && <label className="runtime-source-interval">{t('runtime.interval')}<WebSelect label={t('runtime.interval')} value={String(scheduleInterval)} onChange={(value) => setScheduleInterval(Number(value))} options={[{ value: '300', label: t('runtime.interval5m') }, { value: '900', label: t('runtime.interval15m') }, { value: '3600', label: t('runtime.interval1h') }]} /></label>}{serviceMessage && <small className="runtime-source-error">{serviceMessage}</small>}{historyOpen && <div className="runtime-history-list">{history.length === 0 ? <small>{t('runtime.noHistory')}</small> : history.slice(0, 10).map((entry) => <div key={entry.snapshotId}><span><strong>{entry.readyCount} / {entry.detectedCount}</strong><small>{formatDateShort(entry.committedAt, formatDateTime)}</small></span><button className="icon-button" onClick={() => void restore(entry.snapshotId)} aria-label={t('runtime.restore')} title={t('runtime.restore')}><History size={13} /></button></div>)}</div>}</section>}
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

function RemoteSourceStatus({ targets }: {
  targets?: Array<{
    target: PrimaryTarget
    label: string
    plans: Array<{ consumerId: string; consumerName: string; plan: RemoteSourceLoweringPlan }>
  }>
}) {
  const { locale, t } = useI18n()
  if (!targets) return <p className="source-export-capability-hint">{t('inspector.exportMode.statusUnavailable')}</p>
  return <section className="source-export-status" aria-label={t('inspector.exportMode.status')}>
    <span>{t('inspector.exportMode.status')}</span>
    {targets.map(({ target, label, plans }) => {
      const decisions = new Set(plans.map(({ plan }) => plan.decision))
      const status = decisions.has('unsupported') ? 'unsupported' as const
        : decisions.has('native-remote') && decisions.has('materialized') ? 'mixed' as const
          : decisions.has('native-remote') ? 'native' as const : 'materialized' as const
      const statusLabel = status === 'unsupported' ? t('inspector.exportMode.status.unsupported')
        : status === 'mixed' ? t('inspector.exportMode.status.mixed')
          : status === 'native' ? t('inspector.exportMode.status.native') : t('inspector.exportMode.status.materialized')
      return <div key={target} data-status={status}>
        <header><strong>{label}</strong><b>{statusLabel}</b></header>
        <ul>{plans.map(({ consumerId, consumerName, plan }) => {
          const diagnostic = plan.diagnostics.find((item) => ['REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED', 'REMOTE_SOURCE_PROCESSING_UNSUPPORTED', 'REMOTE_SOURCE_TARGET_UNSUPPORTED', 'REMOTE_SOURCE_REQUEST_PROFILE_UNSUPPORTED', 'REMOTE_SOURCE_SNAPSHOT_UNAVAILABLE', 'REMOTE_SOURCE_MIXED_INPUTS', 'REMOTE_SOURCE_MATERIALIZED', 'REMOTE_SOURCE_NATIVE'].includes(item.code))
          return <li key={`${consumerId}:${plan.decision}`}><span>{consumerName}</span><small>{diagnostic ? localizeDiagnosticMessage(diagnostic.code, diagnostic.message, locale) : t(plan.decision === 'native-remote' ? 'inspector.exportMode.nativePath' : 'inspector.exportMode.materializedPath')}</small></li>
        })}</ul>
        {status === 'unsupported' && <p><AlertTriangle size={14} />{t('inspector.exportMode.useAutoAdvice')}</p>}
      </div>
    })}
  </section>
}

function sourceStatus(runtime: SubscriptionRuntimeRecord | undefined, freshness: SubscriptionFreshness, t: ReturnType<typeof useI18n>['t']) {
  if (runtime?.refreshStatus === 'loading') return t('inspector.sourceStatus.loading')
  if (runtime?.refreshStatus === 'failed') {
    const code = runtime.latestError?.code
    if (code === 'SUBSCRIPTION_CORS_BLOCKED') return t('inspector.sourceStatus.cors')
    if (code === 'SUBSCRIPTION_NETWORK_ERROR') return t('inspector.sourceStatus.network')
    if (code === 'SUBSCRIPTION_TIMEOUT') return t('inspector.sourceStatus.timeout')
    if (code === 'SUBSCRIPTION_HTTP_ERROR') return t('inspector.sourceStatus.http')
    if (code === 'SUBSCRIPTION_RUNTIME_UNAVAILABLE') return t('inspector.sourceStatus.runtimeUnavailable')
    if (code === 'SUBSCRIPTION_RUNTIME_POLICY_BLOCKED') return t('inspector.sourceStatus.runtimePolicyBlocked')
    if (code === 'SUBSCRIPTION_TLS_ERROR') return t('inspector.sourceStatus.tls')
    if (code && ['SUBSCRIPTION_UNSUPPORTED_FORMAT', 'SUBSCRIPTION_PARSE_FAILED', 'SUBSCRIPTION_NO_USABLE_NODES'].includes(code)) return t('inspector.sourceStatus.parseFailed')
    return t('inspector.sourceStatus.failed')
  }
  if (runtime?.activeState === 'empty') return t('inspector.sourceStatus.empty')
  if (runtime?.activeSnapshot && freshness === 'stale') return t('inspector.sourceStatus.stale')
  if (runtime?.activeSnapshot) return t('inspector.sourceStatus.ready')
  return t('inspector.sourceStatus.idle')
}

function sourceErrorMessage(
  error: SubscriptionRefreshError,
  usesRuntimeService: boolean,
  locale: 'en-US' | 'zh-CN',
  t: ReturnType<typeof useI18n>['t'],
) {
  if (error.code === 'SUBSCRIPTION_NETWORK_ERROR') return usesRuntimeService
    ? t('inspector.sourceError.runtimeNetwork')
    : t('inspector.sourceError.browserNetwork')
  if (error.code === 'SUBSCRIPTION_RUNTIME_UNAVAILABLE') return t('inspector.sourceError.runtimeUnavailable')
  if (error.code === 'SUBSCRIPTION_RUNTIME_POLICY_BLOCKED') return t('inspector.sourceError.runtimePolicyBlocked')
  if (error.code === 'SUBSCRIPTION_TLS_ERROR') return t('inspector.sourceError.tls')
  if (error.code === 'SUBSCRIPTION_CONTENT_ENCODING_ERROR') return t('inspector.sourceError.contentEncoding')
  if (error.code === 'SUBSCRIPTION_TIMEOUT') return t('inspector.sourceError.timeout')
  if (error.code === 'SUBSCRIPTION_HTTP_ERROR') {
    const status = localizeDiagnosticMessage(error.code, error.message, locale)
    return `${status} ${t('inspector.sourceError.http')}`
  }
  return localizeDiagnosticMessage(error.code, error.message, locale)
}

function statusClass(runtime: SubscriptionRuntimeRecord | undefined) {
  if (runtime?.refreshStatus === 'loading') return 'loading'
  if (runtime?.refreshStatus === 'failed') return 'failed'
  if (runtime?.activeSnapshot) return 'ready'
  return 'idle'
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
    <Field label={t('inspector.protocol')}><WebSelect label={t('inspector.protocol')} value={protocol} onChange={(value) => {
      const proxyProtocol = value as BlockNodeData['proxyProtocol']
      update(node.id, { proxyProtocol, ...(proxyProtocol === 'anytls' && node.data.proxyPort === 1080 ? { proxyPort: 443 } : {}) })
    }} options={(['http', 'socks5', 'shadowsocks', 'trojan', 'vmess', 'vless', 'anytls'] as SupportedProxyProtocol[]).map((value) => ({ value, label: proxyProtocolLabel(value) }))} /></Field>
    <TextField node={node} field="proxyServer" label={t('inspector.server')} placeholder="proxy.example.com" />
    <Field label={t('inspector.port')}><input type="number" min="1" max="65535" value={node.data.proxyPort ?? 1080} onChange={(event) => update(node.id, { proxyPort: Number(event.target.value) })} /></Field>
    {['http', 'socks5'].includes(protocol) && <><TextField node={node} field="proxyUsername" label={t('inspector.username')} /><Field label={t('inspector.password')}><input type="password" value={node.data.proxyPassword ?? ''} onChange={(event) => update(node.id, { proxyPassword: event.target.value })} /></Field></>}
    {usesPassword && <Field label={t('inspector.password')}><input type="password" value={node.data.proxyPassword ?? ''} onChange={(event) => update(node.id, { proxyPassword: event.target.value })} /></Field>}
    {protocol === 'shadowsocks' && <TextField node={node} field="proxyMethod" label={t('inspector.cipher')} placeholder="aes-128-gcm" />}
    {usesUuid && <TextField node={node} field="proxyUuid" label="UUID" placeholder="00000000-0000-4000-8000-000000000000" />}
    {protocol === 'vmess' && <><TextField node={node} field="proxySecurity" label={t('inspector.security')} placeholder="auto" /><Field label={t('inspector.alterId')}><input type="number" min="0" value={node.data.proxyAlterId ?? 0} onChange={(event) => update(node.id, { proxyAlterId: Number(event.target.value) })} /></Field></>}
    {usesTls && <Advanced><label className="toggle-row compact"><span><strong>TLS</strong></span><input type="checkbox" disabled={protocol === 'anytls'} checked={protocol === 'anytls' || node.data.proxyTls || protocol === 'trojan'} onChange={(event) => update(node.id, { proxyTls: event.target.checked })} /></label>{(node.data.proxyTls || protocol === 'trojan' || protocol === 'anytls') && <><TextField node={node} field="proxyServerName" label={t('inspector.serverName')} /><label className="check-row"><input type="checkbox" checked={node.data.proxyAllowInsecure ?? false} onChange={(event) => update(node.id, { proxyAllowInsecure: event.target.checked })} /> {t('inspector.allowInsecure')}</label></>}{protocol === 'anytls' && <><TextField node={node} field="proxyClientFingerprint" label={t('inspector.clientFingerprint')} placeholder="chrome" /><Field label={t('inspector.idleCheckInterval')}><input type="number" min="1" value={node.data.proxyIdleSessionCheckInterval ?? 30} onChange={(event) => update(node.id, { proxyIdleSessionCheckInterval: Number(event.target.value) })} /></Field><Field label={t('inspector.idleTimeout')}><input type="number" min="1" value={node.data.proxyIdleSessionTimeout ?? 30} onChange={(event) => update(node.id, { proxyIdleSessionTimeout: Number(event.target.value) })} /></Field><Field label={t('inspector.minIdleSession')}><input type="number" min="0" value={node.data.proxyMinIdleSession ?? 0} onChange={(event) => update(node.id, { proxyMinIdleSession: Number(event.target.value) })} /></Field></>}{usesTransport && <><Field label={t('inspector.transport')}><WebSelect label={t('inspector.transport')} value={node.data.proxyTransport ?? 'tcp'} onChange={(value) => update(node.id, { proxyTransport: value as BlockNodeData['proxyTransport'] })} options={[{ value: 'tcp', label: 'TCP' }, { value: 'ws', label: 'WebSocket' }, { value: 'http', label: 'HTTP' }, { value: 'grpc', label: 'gRPC' }]} /></Field>{['ws', 'http'].includes(node.data.proxyTransport ?? 'tcp') && <><TextField node={node} field="proxyTransportPath" label={t('inspector.path')} /><TextField node={node} field="proxyTransportHost" label={t('inspector.host')} /></>}{node.data.proxyTransport === 'grpc' && <TextField node={node} field="proxyGrpcServiceName" label={t('inspector.serviceName')} />}</>}</Advanced>}
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

export function RegionMultiSelect({ values, onChange }: { values: RegionCode[]; onChange: (values: RegionCode[]) => void }) {
  const { t } = useI18n()
  return <div className="inspector-field">
    <span>{t('inspector.filterRegions')}<small>{t('inspector.filterRegionsHint')}</small></span>
    <RegionPicker values={values} onChange={onChange} />
  </div>
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
  return <><TextField node={node} field="title" label={t('inspector.name')} /><Field label={t('inspector.sortBy')}><WebSelect label={t('inspector.sortBy')} value={node.data.sortBy ?? 'name'} onChange={(value) => update(node.id, { sortBy: value as BlockNodeData['sortBy'] })} options={[{ value: 'name', label: t('inspector.sort.name') }, { value: 'region', label: t('inspector.sort.region') }, { value: 'protocol', label: t('inspector.sort.protocol') }, { value: 'latency', label: t('inspector.sort.latency'), disabled: true }]} /></Field><Field label={t('inspector.direction')}><WebSelect label={t('inspector.direction')} value={node.data.sortDirection ?? 'ascending'} onChange={(value) => update(node.id, { sortDirection: value as BlockNodeData['sortDirection'] })} options={[{ value: 'ascending', label: t('inspector.ascending') }, { value: 'descending', label: t('inspector.descending') }]} /></Field><ProcessingDebug materialized={materialized} /></>
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
    {node.data.blockType === 'load-balance' && <Advanced><div className="strategy-advanced-note">{t('inspector.loadBalanceAdvancedHint')}</div><Field label={t('inspector.loadBalanceMode')}><WebSelect label={t('inspector.loadBalanceMode')} value={node.data.loadBalanceMode ?? 'round-robin'} onChange={(value) => update(node.id, { loadBalanceMode: value as BlockNodeData['loadBalanceMode'] })} options={[{ value: 'round-robin', label: t('inspector.loadBalance.roundRobin') }, { value: 'consistent-hash', label: t('inspector.loadBalance.consistentHash') }]} /></Field></Advanced>}
    {node.data.blockType !== 'fixed-proxy' && <div className="candidate-list"><span>{t('inspector.incomingCandidates')}</span>{materializedCandidates.length ? materializedCandidates.map((item) => <code key={item.id}>{localizeNodeTitle(item, locale)}</code>) : <small>{t('inspector.sourceMissing')}</small>}</div>}
    {emptyCandidates
      ? <div className="strategy-explanation is-warning"><AlertTriangle size={14} /><span><strong>{t('inspector.emptyCandidates')}</strong><small>{incoming.length ? t('inspector.emptyCandidatesHint') : t('inspector.connectStrategySource')}</small></span></div>
      : runtime && <div className="strategy-explanation is-ready"><Check size={14} /><span><strong>{strategyExplanationTitle(node.data.blockType, t)}</strong><small>{strategyExplanation(node, runtime.outputCount, t)}</small></span></div>}
  </>
}

function TargetNativeStrategyInspector({ node }: InspectorProps) {
  const { locale, t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const nodes = useBuilderStore((state) => state.nodes)
  const snapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const toProject = useBuilderStore((state) => state.toProject)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const native = node.data.targetNativeStrategy
  const graph = useMemo(() => compileGraph(toProject(), { subscriptionSnapshots: snapshots, retainDraftOnErrorForDiagnostics: true, validationTarget: primaryTarget }), [node.id, primaryTarget, snapshots, toProject])
  const proxies = useMemo(() => graph.ir?.sources.flatMap((source) => source.kind === 'manual-proxy' || source.kind === 'subscription' ? (source.proxies ?? []).filter((proxy) => proxy.kind !== 'unmodeled').map((proxy) => ({ id: proxy.id, name: localizeDataValue(proxy.name, undefined, locale) })) : []) ?? [], [graph.ir, locale])
  const strategyOptions = useMemo(() => nodes
    .filter((item) => item.id !== node.id && item.data.category === 'strategy')
    .map((item) => ({ value: `strategy:${item.id}`, label: localizeNodeTitle(item, locale) })), [locale, node.id, nodes])
  if (!isTargetNativeStrategyConfig(native)) return <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span>{localizeDiagnosticMessage('TARGET_NATIVE_STRATEGY_INVALID', 'This target-native strategy has invalid typed configuration.', locale)}</span></div>
  const setNative = (next: SurgeNativeStrategyConfig) => update(node.id, { targetNativeStrategy: next })
  const policyOptions = [
    { value: '__direct__', label: 'DIRECT' },
    { value: '__reject__', label: 'REJECT' },
    ...strategyOptions,
    ...proxies.map((proxy) => ({ value: `proxy:${proxy.id}`, label: proxy.name })),
  ]
  const policyValue = (reference: PolicyReference | undefined) => !reference ? '' : reference.kind === 'builtin' ? reference.id === 'DIRECT' ? '__direct__' : '__reject__' : `${reference.kind}:${reference.id}`
  const parsePolicy = (value: string): PolicyReference | undefined => {
    if (value === '__direct__') return { kind: 'builtin', id: 'DIRECT' }
    if (value === '__reject__') return { kind: 'builtin', id: 'REJECT' }
    const [kind, ...rest] = value.split(':')
    const id = rest.join(':')
    if ((kind === 'proxy' || kind === 'strategy') && id) return { kind, id } as PolicyReference
    return undefined
  }
  const matcherType = (matcher: SurgeSubnetMatcher) => matcher.kind === 'network-type' ? `type:${matcher.value}` : matcher.kind
  const parseMatcher = (value: string): SurgeSubnetMatcher => value.startsWith('type:')
    ? { kind: 'network-type', value: value.slice(5) as 'WIFI' | 'WIRED' | 'CELLULAR' }
    : { kind: value as 'ssid' | 'bssid' | 'router' | 'mccmnc', value: '' }
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    <div className="strategy-kind-card"><span>{t('inspector.targetNative')}</span><strong>{native.kind === 'smart' ? t('inspector.targetNativeSmart') : t('inspector.targetNativeSubnet')}</strong><b className="target-native-badge">{t('inspector.targetNativeBadge')}</b></div>
    {primaryTarget !== 'surge' && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span>{localizeDiagnosticMessage('TARGET_NATIVE_STRATEGY_UNSUPPORTED', 'This strategy is Surge-specific; the selected target has no proven equivalent.', locale)}</span></div>}
    {native.kind === 'smart' && <>
      <div className="section-label"><span>{t('inspector.smartMembers')}</span><small>{t('inspector.candidates')} · {native.members.length}</small></div>
      <p className="field-hint">{t('inspector.smartMembersHint')}</p>
      <div className="native-member-list">{proxies.length ? proxies.map((proxy) => {
        const checked = native.members.some((member) => member.id === proxy.id)
        return <label className="native-member-option" key={proxy.id}><input type="checkbox" checked={checked} onChange={() => setNative({ ...native, members: checked ? native.members.filter((member) => member.id !== proxy.id) : [...native.members, { kind: 'proxy', id: proxy.id }] })} /><span>{proxy.name}</span></label>
      }) : <small>{t('inspector.noProxyMembers')}</small>}</div>
      <Advanced>
        <label className="toggle-row compact"><span><strong>{t('inspector.smartEvaluateBeforeUse')}</strong><small>{t('inspector.smartEvaluateBeforeUseHint')}</small></span><input type="checkbox" checked={native.evaluateBeforeUse ?? false} onChange={(event) => setNative({ ...native, evaluateBeforeUse: event.target.checked })} /></label>
        <div className="section-label"><span>{t('inspector.smartPolicyPriority')}</span><small>{t('inspector.smartPolicyPriorityHint')}</small></div>
        <div className="native-priority-list">{(native.policyPriority ?? []).map((rule, index) => <div className="native-priority-row" key={`${node.id}-priority-${index}`}>
          <input aria-label={`${t('inspector.smartPolicyPriorityPattern')} ${index + 1}`} value={rule.pattern} placeholder="Premium" onChange={(event) => setNative({ ...native, policyPriority: (native.policyPriority ?? []).map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, pattern: event.target.value } : candidate) })} />
          <input aria-label={`${t('inspector.smartPolicyPriorityFactor')} ${index + 1}`} type="number" min="0.01" step="0.1" value={rule.factor} onChange={(event) => setNative({ ...native, policyPriority: (native.policyPriority ?? []).map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, factor: Number(event.target.value) } : candidate) })} />
          <button type="button" className="icon-button danger" aria-label={t('inspector.removeService')} onClick={() => setNative({ ...native, policyPriority: (native.policyPriority ?? []).filter((_, candidateIndex) => candidateIndex !== index) })}><Trash2 size={13} /></button>
        </div>)}</div>
        <button type="button" className="dashed-button" onClick={() => setNative({ ...native, policyPriority: [...(native.policyPriority ?? []), { pattern: '', factor: 1 }] })}><Plus size={14} /> {t('inspector.smartAddPolicyPriority')}</button>
      </Advanced>
    </>}
    {native.kind === 'subnet' && <>
      <div className="section-label"><span>{t('inspector.subnetConditions')}</span><small>{native.conditions.length}</small></div>
      <div className="native-condition-list">{native.conditions.map((condition, index) => <div className="native-condition-card" key={`${node.id}-condition-${index}`}>
        <div className="native-condition-heading"><strong>{index + 1}</strong><button type="button" className="icon-button danger" aria-label={t('inspector.removeService')} onClick={() => setNative({ ...native, conditions: native.conditions.filter((_, candidateIndex) => candidateIndex !== index) })}><Trash2 size={13} /></button></div>
        <Field label={t('inspector.subnetConditionType')}><WebSelect label={t('inspector.subnetConditionType')} value={matcherType(condition.matcher)} onChange={(value) => {
          const matcher = parseMatcher(value)
          const conditions = native.conditions.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, matcher } : candidate)
          setNative({ ...native, conditions })
        }} options={[{ value: 'ssid', label: t('inspector.subnetSsid') }, { value: 'bssid', label: t('inspector.subnetBssid') }, { value: 'router', label: t('inspector.subnetRouter') }, { value: 'mccmnc', label: t('inspector.subnetMccmnc') }, { value: 'type:WIFI', label: t('inspector.subnetWifi') }, { value: 'type:WIRED', label: t('inspector.subnetWired') }, { value: 'type:CELLULAR', label: t('inspector.subnetCellular') }]} /></Field>
        <Field label={t('inspector.subnetConditionValue')} hint={condition.matcher.kind === 'network-type' ? 'TYPE' : condition.matcher.kind === 'mccmnc' ? 'MCC+MNC · 5–6 digits' : undefined}><input value={condition.matcher.value} disabled={condition.matcher.kind === 'network-type'} placeholder={condition.matcher.kind === 'ssid' ? 'Home-WiFi' : condition.matcher.kind === 'mccmnc' ? '310260' : undefined} onChange={(event) => setNative({ ...native, conditions: native.conditions.map((candidate, candidateIndex) => {
          if (candidateIndex !== index || candidate.matcher.kind === 'network-type') return candidate
          return { ...candidate, matcher: { kind: candidate.matcher.kind, value: event.target.value } }
        }) })} /></Field>
        <Field label={t('inspector.subnetPolicy')}><WebSelect label={t('inspector.subnetPolicy')} value={policyValue(condition.policy)} onChange={(value) => { const policy = parsePolicy(value); if (policy) setNative({ ...native, conditions: native.conditions.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, policy } : candidate) }) }} options={[{ value: '', label: t('inspector.subnetPolicySelect'), disabled: true }, ...policyOptions]} /></Field>
      </div>)}</div>
      <button type="button" className="dashed-button" onClick={() => setNative({ ...native, conditions: [...native.conditions, { matcher: { kind: 'ssid', value: '' }, policy: { kind: 'builtin', id: 'DIRECT' } }] })}><Plus size={14} /> {t('inspector.subnetAddCondition')}</button>
      <Field label={t('inspector.subnetDefault')}><WebSelect label={t('inspector.subnetDefault')} value={policyValue(native.defaultPolicy)} onChange={(value) => { const policy = parsePolicy(value); if (policy) setNative({ ...native, defaultPolicy: policy }) }} options={[{ value: '', label: t('inspector.subnetPolicySelect'), disabled: true }, ...policyOptions]} /></Field>
    </>}
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
    <Field label={t('inspector.fixedProxy')}><WebSelect label={t('inspector.fixedProxy')} value={node.data.proxyId ?? ''} onChange={(value) => update(node.id, { proxyId: value })} options={[{ value: '', label: t('inspector.selectManualProxy'), disabled: true }, ...proxies.map((proxy) => ({ value: proxy.id, label: localizeNodeTitle(proxy, locale) }))]} /></Field>
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
    <Advanced><Field label={t('inspector.connectionTimeout')}><div className="input-with-unit"><input defaultValue="10" /><span>{t('inspector.seconds')}</span></div></Field><Field label={t('inspector.retryCount')}><WebSelect label={t('inspector.retryCount')} defaultValue="2" options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} /></Field><label className="toggle-row compact"><span><strong>{t('inspector.udpRelay')}</strong></span><input type="checkbox" defaultChecked /></label></Advanced>
  </>
}

export interface SurgeFinalOptionsEditorProps {
  node: GraphNode
  primaryTarget: PrimaryTarget | null | undefined
  finalTargetNativeKind?: 'smart' | 'subnet'
  hasConfiguredFinalTarget: boolean
}

/** Small, Final-only editor for the typed Surge dns-failed intent. */
export function SurgeFinalOptionsEditor({ node, primaryTarget, finalTargetNativeKind, hasConfiguredFinalTarget }: SurgeFinalOptionsEditorProps) {
  const { t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const state = getFinalDnsFailedUiState({
    primaryTarget,
    finalTargetKind: node.data.targetKind,
    finalTargetNativeKind,
    hasConfiguredFinalTarget,
    hasPersistedIntent: node.data.targetNativeFinalOptions !== undefined,
  })
  const hint = state.isFinalTargetMissing
    ? t('inspector.finalOptions.targetMissingHint')
    : state.isDirectFinal && !state.hasPersistedIntent
      ? t('inspector.finalOptions.directUnsupported')
      : t('inspector.finalOptions.hint')
  return <section className="target-native-card final-options-editor" data-final-options="dns-failed" data-final-target-native-kind={finalTargetNativeKind ?? ''}>
    <div className="target-native-card-heading">
      <span><strong>{t('inspector.finalOptions.title')}</strong><small>{hint}</small></span>
      <em className="node-native-badge">{t('inspector.finalOptions.surgeOnlyLabel')}</em>
    </div>
    <label className="toggle-row compact">
      <span><strong>{t('inspector.finalOptions.label')}</strong><small>{t('inspector.finalOptions.toggleHint')}</small></span>
      <input
        type="checkbox"
        aria-label={t('inspector.finalOptions.label')}
        checked={state.hasPersistedIntent}
        disabled={state.toggleDisabled}
        onChange={(event) => {
          if (event.target.checked && !state.canCreate) return
          update(node.id, finalDnsFailedOptionsPatch(event.target.checked))
        }}
      />
    </label>
    {state.isFinalTargetMissing && state.hasPersistedIntent && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('inspector.finalOptions.targetMissing')}</strong><small>{t('inspector.finalOptions.targetMissingDetail')}</small></span></div>}
    {state.isTargetMismatch && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('inspector.finalOptions.surgeOnly')}</strong><small>{t('inspector.finalOptions.targetMismatch')}</small></span></div>}
    {state.isIncompatible && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('inspector.finalOptions.incompatible')}</strong><small>{t('inspector.finalOptions.directUnsupported')}</small></span></div>}
  </section>
}

export interface SurgeRouteOptionsEditorProps {
  node: GraphNode
  primaryTarget: PrimaryTarget | null | undefined
  matcherKind: BlockNodeData['routeMatcherKind']
  hasConfiguredMatcher: boolean
}

/** Small routing-rule editor for the typed Surge `no-resolve` intent. */
export function SurgeRouteOptionsEditor({ node, primaryTarget, matcherKind, hasConfiguredMatcher }: SurgeRouteOptionsEditorProps) {
  const { t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const state = getRouteNoResolveUiState({
    primaryTarget,
    matcherKind,
    hasConfiguredMatcher,
    hasPersistedIntent: node.data.targetNativeRouteOptions !== undefined,
  })
  const hint = state.isMatcherMissing
    ? t('inspector.routeOptions.matcherMissingHint')
    : state.isMatcherSupported ? t('inspector.routeOptions.hint') : t('inspector.routeOptions.unsupportedHint')
  return <section className="target-native-card route-options-editor" data-route-options="no-resolve" data-route-matcher-kind={matcherKind ?? ''}>
    <div className="target-native-card-heading">
      <span><strong>{t('inspector.routeOptions.title')}</strong><small>{hint}</small></span>
      <em className="node-native-badge">{t('inspector.routeOptions.surgeOnlyLabel')}</em>
    </div>
    <label className="toggle-row compact">
      <span><strong>{t('inspector.routeOptions.label')}</strong><small>{t('inspector.routeOptions.toggleHint')}</small></span>
      <input
        type="checkbox"
        aria-label={t('inspector.routeOptions.label')}
        checked={state.hasPersistedIntent}
        disabled={state.toggleDisabled}
        onChange={(event) => {
          if (event.target.checked && !state.canCreate) return
          update(node.id, routeNoResolveOptionsPatch(event.target.checked))
        }}
      />
    </label>
    {state.isTargetMismatch && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('inspector.routeOptions.surgeOnly')}</strong><small>{t('inspector.routeOptions.targetMismatch')}</small></span></div>}
    {state.isMatcherMissing && state.hasPersistedIntent && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('inspector.routeOptions.matcherMissing')}</strong><small>{t('inspector.routeOptions.matcherMissingDetail')}</small></span></div>}
    {state.isIncompatible && !state.isMatcherMissing && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('inspector.routeOptions.incompatible')}</strong><small>{t('inspector.routeOptions.unsupportedHint')}</small></span></div>}
  </section>
}

export function RoutingInspector({ node }: InspectorProps) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const authoringTarget = primaryTarget ? resolveActiveProductTarget(primaryTarget) : null
  const activeService = useBuilderStore((state) => state.activeService)
  const update = useBuilderStore((state) => state.updateNodeData)
  const setTarget = useBuilderStore((state) => state.setRoutingTarget)
  const targets = nodes.filter((item) => ['strategy', 'chain'].includes(item.data.category))
  const hasConfiguredFinalTarget = node.data.blockType === 'final'
    && isFinalTargetConfigured(node.data.targetKind, node.data.targetId, targets)
  const finalTargetNativeKind = node.data.blockType === 'final' && node.data.targetKind === 'strategy' && node.data.targetId
    ? (() => {
      const target = nodes.find((item) => item.id === node.data.targetId)
      if (target?.data.blockType !== 'target-native-strategy' || !isTargetNativeStrategyConfig(target.data.targetNativeStrategy)) return undefined
      return target.data.targetNativeStrategy.kind
    })()
    : undefined
  const services = node.data.services ?? []
  const matcherKind = resolveRouteMatcherKind(node.data)
  const routingCapabilities = authoringTarget ? getTargetCapabilities(authoringTarget).routingMatchers : undefined
  const matcherCapability = matcherKind ? routingCapabilities?.[matcherKind] : undefined
  const nativeRuleSet = matcherKind === 'rule-set' && isTargetNativeRuleSetSourceConfig(node.data.targetNativeRuleSet)
    ? node.data.targetNativeRuleSet
    : undefined
  const unsupportedMatcher = matcherCapability?.status === 'unsupported' && !nativeRuleSet
  const nativeRuleSetMismatch = Boolean(nativeRuleSet && authoringTarget && authoringTarget !== 'surge')
  const isRouteRule = isRoutingRuleType(node.data.blockType)
  const isServiceRule = isRouteRule && node.data.blockType !== 'custom-rule'
  const isCustomRule = node.data.blockType === 'custom-rule'
  const isServiceRoute = matcherKind === 'service'
  const isAdvancedMatcher = Boolean(matcherKind && matcherKind !== 'rule-set' && ADVANCED_ROUTE_MATCHERS.includes(matcherKind))
  const matcherValue = node.data.routeMatcherValue ?? ''
  const sourcePortValue = isTargetNativeSourcePortConfig(node.data.targetNativeSourcePort)
    ? node.data.targetNativeSourcePort.port
    : undefined
  const hasConfiguredMatcher = isRouteMatcherConfigured(matcherKind, node.data)
  const setMatcher = (value: BlockNodeData['routeMatcherKind']) => update(
    node.id,
    routeMatcherSelectionPatch(value, node.data, authoringTarget),
  )
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    {primaryTarget && getTargetCapabilities(primaryTarget).productStatus === 'paused' && <div className="validation-banner"><AlertTriangle size={15} /><span><strong>{t('workspace.targetPausedTitle', { target: getTargetCapabilities(primaryTarget).label })}</strong>{t('workspace.targetPausedDescription')}</span></div>}
    {unsupportedMatcher && authoringTarget && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('workspace.routing.unsupportedByTarget', { target: getTargetCapabilities(authoringTarget).label })}</strong>{matcherCapability.reason && <code>{matcherCapability.reason}</code>}</span></div>}
    {nativeRuleSetMismatch && authoringTarget && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('inspector.ruleSetSource.surgeOnly')}</strong><small>{t('inspector.ruleSetSource.targetMismatch', { target: getTargetCapabilities(authoringTarget).label })}</small></span></div>}
    {isCustomRule && <Field label={t('inspector.matcherType')}>
      <WebSelect label={t('inspector.matcherType')} value={isAdvancedMatcher ? '' : matcherKind ?? ''} onChange={(value) => setMatcher(value as BlockNodeData['routeMatcherKind'])} options={[
        { value: '', label: t('inspector.selectBasicMatcher'), disabled: true },
        ...BASIC_ROUTE_MATCHERS.filter((value) => value !== 'service').map((value) => { const unsupported = routingCapabilities?.[value].status === 'unsupported'; return { value, label: `${matcherLabel(value, t)}${unsupported ? ` · ${t('inspector.unsupported')}` : ''}`, disabled: unsupported } }),
      { value: 'rule-set', label: t('inspector.matcher.ruleSet') },
      ]} />
    </Field>}
    {isServiceRule && isServiceRoute && <><div className="section-label"><span>{t('inspector.services')}</span><small>{t('inspector.servicesSelected', { count: services.length })}</small></div>
    <div className="service-list">{services.map((service) => { const definition = serviceCatalog.find((item) => item.id === service || item.name === service) ?? resolveLegacyServiceDefinition(service); const label = definition?.name ?? service; const selected = activeService === service || activeService === definition?.name; return <div className={selected ? 'is-active' : ''} key={service}><span className="service-mark-slot"><ServiceMark serviceId={definition?.id ?? service} selected={selected} /></span><span><strong>{localizeKnownSystemText(label, locale)}</strong><small>{definition?.description ?? t('inspector.serviceDefinition')}</small></span><button type="button" aria-label={`${t('inspector.removeService')} ${label}`} onClick={() => update(node.id, { services: services.filter((item) => item !== service) })}><X size={15} /></button></div> })}</div>
    <ServiceMultiSelectPopover selected={services} onChange={(next) => update(node.id, { services: next })} /></>}
    {isCustomRule && matcherKind === 'rule-set' && <RuleSetSourceEditor nativeRuleSet={nativeRuleSet} authoringTarget={authoringTarget} onChange={(value) => {
      update(node.id, ruleSetSourcePatch(value, node.data.customRuleSource?.id))
    }} t={t} />}
    {isCustomRule && matcherKind === 'rule-set' && !nativeRuleSet && <CustomRuleSourceEditor key={node.id} node={node} primaryTarget={authoringTarget} update={update} t={t} />}
    {isCustomRule && !isAdvancedMatcher && matcherKind && matcherKind !== 'rule-set' && <MatcherValueField node={node} kind={matcherKind} matcherValue={matcherValue} update={update} t={t} />}
    {isRouteRule && <SurgeRouteOptionsEditor node={node} primaryTarget={primaryTarget} matcherKind={matcherKind} hasConfiguredMatcher={hasConfiguredMatcher} />}
    <Field label={t('inspector.targetStrategy')}><WebSelect label={t('inspector.targetStrategy')} value={node.data.targetKind === 'direct' ? '__direct__' : node.data.targetKind === 'reject' ? '__reject__' : node.data.targetId ?? ''} onChange={(value) => setTarget(node.id, value)} options={[{ value: '', label: t('inspector.selectTarget'), disabled: true }, { value: '__direct__', label: 'DIRECT' }, { value: '__reject__', label: 'REJECT' }, ...targets.map((target) => ({ value: target.id, label: localizeNodeTitle(target, locale) }))]} /></Field>
    {node.data.blockType === 'final' && <SurgeFinalOptionsEditor node={node} primaryTarget={primaryTarget} finalTargetNativeKind={finalTargetNativeKind} hasConfiguredFinalTarget={hasConfiguredFinalTarget} />}
    {isCustomRule && <Advanced>
      <Field label={t('inspector.advancedMatcher')}>
        <WebSelect label={t('inspector.advancedMatcher')} value={isAdvancedMatcher ? matcherKind : '__none__'} onChange={(value) => setMatcher(value === '__none__' ? 'domain-suffix' : value as BlockNodeData['routeMatcherKind'])} options={[
          { value: '__none__', label: t('inspector.noAdvancedMatcher') },
          ...ADVANCED_ROUTE_MATCHERS.filter((value) => value !== 'rule-set').map((value) => { const unsupported = routingCapabilities?.[value].status === 'unsupported'; return { value, label: `${matcherLabel(value, t)}${unsupported ? ` · ${t('inspector.unsupported')}` : ''}`, disabled: unsupported } }),
        ]} />
      </Field>
      {isAdvancedMatcher && matcherKind && <MatcherValueField node={node} kind={matcherKind} matcherValue={matcherValue} update={update} t={t} />}
      {matcherKind && matcherKind !== 'rule-set' && <div className="actual-rules"><div><span>{t('inspector.matcherPreview')}</span><code>{formatMatcherPreview(matcherKind, matcherKind === 'source-port' ? sourcePortValue : matcherKind === 'port' ? node.data.routeMatcherPort : matcherValue)}</code></div></div>}
    </Advanced>}
  </>
}

function ServiceMultiSelectPopover({ selected, onChange }: { selected: string[]; onChange: (services: string[]) => void }) {
  const { locale, t } = useI18n()
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<ViewportPopoverPosition | null>(null)
  const visible = serviceCatalog.filter((service) => `${service.name} ${service.description ?? ''}`
    .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return
    const updatePosition = () => setPosition(positionViewportPopover(
      trigger.getBoundingClientRect(),
      readPopoverViewport(),
      { preferredWidth: 320, maxHeight: 420, minPreferredHeight: 260, matchAnchorWidth: true },
    ))
    updatePosition()
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus())
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false)
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.visualViewport?.addEventListener('resize', updatePosition)
    window.visualViewport?.addEventListener('scroll', updatePosition)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.visualViewport?.removeEventListener('resize', updatePosition)
      window.visualViewport?.removeEventListener('scroll', updatePosition)
    }
  }, [open])

  const moveFocus = (event: KeyboardEvent<HTMLElement>, edge?: 'first' | 'last') => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const options = Array.from(popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])
    if (!options.length) return
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    const index = edge === 'first' ? 0 : edge === 'last' ? options.length - 1
      : nextListboxOptionIndex(event.key, current, options.length)
    const next = options[index]
    next?.focus({ preventScroll: true })
    next?.scrollIntoView({ block: 'nearest' })
  }

  const selectService = (serviceId: string, optionIndex: number) => {
    const nextOptionIndex = nextServiceOptionIndex(visible, selected, optionIndex)
    onChange([...selected, serviceId])
    window.requestAnimationFrame(() => {
      const options = Array.from(popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])
      const next = options[nextOptionIndex] ?? options.at(-1)
      if (next) {
        next.focus({ preventScroll: true })
        next.scrollIntoView({ block: 'nearest' })
      } else searchRef.current?.focus()
    })
  }

  return <>
    <button ref={triggerRef} type="button" className="inspector-secondary-button service-picker-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((value) => !value)}><Plus size={14} />{t('inspector.addService')}</button>
    {open && createPortal(<div ref={popoverRef} id={id} className="service-picker service-picker-popover" data-placement={position?.placement} style={{ position: 'fixed', top: position?.top, bottom: position?.bottom, left: position?.left, width: position?.width, maxHeight: position?.maxHeight, visibility: position ? 'visible' : 'hidden' }} onKeyDown={(event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }}>
      <div className="service-picker-heading"><div className="service-search"><Search size={15} /><input ref={searchRef} value={query} placeholder={t('inspector.searchServices')} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => moveFocus(event, event.key === 'ArrowDown' ? 'first' : undefined)} /></div><button type="button" className="service-picker-collapse" onClick={() => { setOpen(false); triggerRef.current?.focus() }} aria-label={t('inspector.collapse')} title={t('inspector.collapse')}><X size={16} /></button></div>
      <div className="service-picker-options" role="listbox" aria-multiselectable="true" aria-label={t('inspector.services')} onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()} onKeyDown={moveFocus}>{visible.map((service, optionIndex) => {
        const isSelected = selected.includes(service.id) || selected.includes(service.name)
        return <button type="button" role="option" aria-selected={isSelected} disabled={isSelected} key={service.id} onClick={() => selectService(service.id, optionIndex)}><ServiceMark serviceId={service.id} selected={isSelected} /><span><strong>{localizeKnownSystemText(service.name, locale)}</strong><small>{service.description}</small></span>{isSelected ? <Check size={15} /> : <Plus size={15} />}</button>
      })}{visible.length === 0 && <small>{t('inspector.noServices')}</small>}</div>
    </div>, document.body)}
  </>
}

export function nextListboxOptionIndex(key: string, current: number, length: number) {
  if (length <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  if (key === 'ArrowUp') return current <= 0 ? length - 1 : current - 1
  return (current + 1) % length
}

export function nextServiceOptionIndex(
  services: readonly ServiceDefinition[],
  selected: readonly string[],
  selectedIndex: number,
) {
  return services.slice(0, selectedIndex).filter(
    (service) => !selected.includes(service.id) && !selected.includes(service.name),
  ).length
}

type RuleSetSourceSelection = 'custom' | SurgeBuiltinRuleSetName

export function ruleSetSourcePatch(selection: RuleSetSourceSelection, customSourceId?: string): Partial<BlockNodeData> {
  if (selection === 'custom') {
    return { targetNativeRuleSet: undefined, routeMatcherValue: customSourceId ?? '' }
  }
  return {
    targetNativeRuleSet: surgeBuiltinRuleSetSourceConfig(selection),
    routeMatcherValue: surgeBuiltinRuleSetSourceId(selection),
    customRuleSource: undefined,
  }
}

export function isSurgeBuiltinRuleSetSelectionDisabled(authoringTarget: PrimaryTarget | null | undefined) {
  return authoringTarget !== 'surge'
}

export function ruleSetSourceOptions(
  authoringTarget: PrimaryTarget | null | undefined,
  t: ReturnType<typeof useI18n>['t'],
) {
  const disabled = isSurgeBuiltinRuleSetSelectionDisabled(authoringTarget)
  const surgeOnly = disabled ? ` · ${t('inspector.ruleSetSource.surgeOnlyLabel')}` : ''
  return [
    { value: 'custom', label: t('inspector.ruleSetSource.custom') },
    { value: 'LAN', label: `${t('inspector.ruleSetSource.surgeBuiltin')} · LAN${surgeOnly}`, ...(disabled ? { disabled: true } : {}) },
    { value: 'SYSTEM', label: `${t('inspector.ruleSetSource.surgeBuiltin')} · SYSTEM${surgeOnly}`, ...(disabled ? { disabled: true } : {}) },
  ]
}

function RuleSetSourceEditor({
  nativeRuleSet, authoringTarget, onChange, t,
}: {
  nativeRuleSet?: { target: 'surge'; kind: 'builtin-rule-set'; name: SurgeBuiltinRuleSetName }
  authoringTarget?: PrimaryTarget | null
  onChange: (value: RuleSetSourceSelection) => void
  t: ReturnType<typeof useI18n>['t']
}) {
  const value: RuleSetSourceSelection = nativeRuleSet?.name ?? 'custom'
  return <section className="rule-set-source-selector" aria-label={t('inspector.ruleSetSource.title')}>
    <Field label={t('inspector.ruleSetSource.title')} hint={t('inspector.ruleSetSource.hint')}>
      <WebSelect
        label={t('inspector.ruleSetSource.title')}
        value={value}
        onChange={(next) => onChange(next as RuleSetSourceSelection)}
        options={ruleSetSourceOptions(authoringTarget, t)}
      />
    </Field>
    {nativeRuleSet && <div className="target-native-card">
      <div className="target-native-card-heading"><span><strong>{t('inspector.ruleSetSource.builtinTitle', { name: nativeRuleSet.name })}</strong><small>{nativeRuleSet.name === 'LAN' ? t('inspector.ruleSetSource.builtinLanDescription') : t('inspector.ruleSetSource.builtinSystemDescription')}</small></span><em className="node-native-badge">{t('inspector.ruleSetSource.targetBadge')}</em></div>
      <code>RULE-SET,{nativeRuleSet.name},&lt;policy&gt;</code>
    </div>}
  </section>
}

function CustomRuleSourceEditor({ node, primaryTarget, update, t }: {
  node: GraphNode
  primaryTarget: ReturnType<typeof useBuilderStore.getState>['primaryTarget']
  update: ReturnType<typeof useBuilderStore.getState>['updateNodeData']
  t: ReturnType<typeof useI18n>['t']
}) {
  const existing = node.data.customRuleSource
  const [name, setName] = useState(existing?.name ?? node.data.title)
  const [inputKind, setInputKind] = useState<'file' | 'url'>(existing?.inputKind ?? 'file')
  const [requestedFormat, setRequestedFormat] = useState<CustomRuleSourceRequestedFormat>('auto')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [icon, setIcon] = useState(existing?.icon)
  const [issues, setIssues] = useState<CustomRuleSourceIssue[]>([])
  const [loading, setLoading] = useState(false)

  const importContent = async (content: string, metadata: { fileName?: string; sourceUrl?: string }) => {
    const result = parseCustomRuleSource({
      id: existing?.id ?? `custom-rule-${node.id}`,
      name,
      inputKind,
      content,
      requestedFormat,
      fileName: metadata.fileName,
      url: metadata.sourceUrl,
      icon,
      enabled: existing?.enabled ?? true,
    })
    if (!result.ok) { setIssues(result.issues); return }
    const targetIssues = primaryTarget ? validateCustomRuleSourceForTarget(result.source, primaryTarget) : []
    const nextIssues = [...result.issues, ...targetIssues]
    setIssues(nextIssues)
    if (targetIssues.some((issue) => issue.severity === 'error')) return
    update(node.id, { customRuleSource: result.source, routeMatcherValue: result.source.id })
  }

  const importUrl = async () => {
    setLoading(true)
    setIssues([])
    try {
      const response = await fetch(url, { credentials: 'omit', redirect: 'follow' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      await importContent(await response.text(), { sourceUrl: url })
    } catch (error) {
      setIssues([{ code: 'RULE_SOURCE_FETCH_FAILED', severity: 'error', message: error instanceof Error ? error.message : t('inspector.ruleSource.fetchFailed') }])
    } finally { setLoading(false) }
  }

  const updateExisting = (patch: Partial<NonNullable<BlockNodeData['customRuleSource']>>) => {
    if (!existing) return
    update(node.id, { customRuleSource: { ...existing, ...patch } })
  }

  return <section className="custom-rule-source" aria-label={t('inspector.ruleSource.title')}>
    <div className="custom-rule-source-heading">
      <AssetIcon className="rule-source-avatar" src={icon} fallback="R" />
      <span><strong>{t('inspector.ruleSource.title')}</strong><small>{t('inspector.ruleSource.normalizedHint')}</small></span>
    </div>
    <Field label={t('inspector.ruleSource.name')}><input value={name} onChange={(event) => { setName(event.target.value); updateExisting({ name: event.target.value }) }} /></Field>
    <Field label={t('inspector.ruleSource.input')}><WebSelect label={t('inspector.ruleSource.input')} value={inputKind} onChange={(value) => setInputKind(value as 'file' | 'url')} options={[{ value: 'file', label: t('inspector.ruleSource.file') }, { value: 'url', label: 'URL' }]} /></Field>
    <Field label={t('inspector.ruleSource.format')}><WebSelect label={t('inspector.ruleSource.format')} value={requestedFormat} onChange={(value) => setRequestedFormat(value as CustomRuleSourceRequestedFormat)} options={[{ value: 'auto', label: t('inspector.ruleSource.autoDetect') }, { value: 'mihomo-yaml', label: 'Mihomo YAML' }, { value: 'surge-list', label: 'Surge List' }]} /></Field>
    {inputKind === 'file' ? <label className="custom-rule-source-upload"><FileUp size={15} /><span>{existing?.fileName ?? t('inspector.ruleSource.chooseFile')}</span><input type="file" accept=".yaml,.yml,.list,.txt,text/plain,application/yaml" onChange={async (event) => { const file = event.target.files?.[0]; if (file) await importContent(await file.text(), { fileName: file.name }) }} /></label>
      : <div className="custom-rule-source-url"><Field label={t('inspector.ruleSource.url')}><input type="url" value={url} placeholder="https://rules.example.com/list.yaml" onChange={(event) => setUrl(event.target.value)} /></Field><button type="button" className="inspector-secondary-button" disabled={loading || !url.trim()} onClick={() => void importUrl()}><Link2 size={14} />{loading ? t('inspector.ruleSource.loading') : t('inspector.ruleSource.validate')}</button></div>}
    <div className="custom-rule-source-icon-field">
      <span>{t('inspector.ruleSource.iconOptional')}</span>
      <div className="custom-rule-source-icon">
      {icon && <AssetIcon className="custom-rule-source-icon-preview" src={icon} fallback="R" />}
      <label className="inspector-secondary-button"><FileUp size={14} />{t(icon ? 'inspector.ruleSource.changeIcon' : 'inspector.ruleSource.selectIcon')}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/') || file.size > 256_000) { setIssues([{ code: 'RULE_SOURCE_ICON_INVALID', severity: 'error', message: t('inspector.ruleSource.iconInvalid') }]); return }
        const dataUrl = await fileToDataUrl(file)
        setIcon(dataUrl)
        updateExisting({ icon: dataUrl })
      }} /></label>
      {icon && <button type="button" className="inspector-secondary-button" onClick={() => { setIcon(undefined); updateExisting({ icon: undefined }) }}><X size={14} />{t('inspector.ruleSource.removeIcon')}</button>}
      </div>
    </div>
    {existing && <label className="toggle-row compact"><span><strong>{t('inspector.ruleSource.enabled')}</strong><small>{existing.matchers.length} {t('inspector.ruleSource.rules')}</small></span><input type="checkbox" checked={existing.enabled} onChange={(event) => updateExisting({ enabled: event.target.checked })} /></label>}
    {existing && <div className="custom-rule-source-status"><Check size={15} /><span><strong>{existing.format === 'mihomo-yaml' ? 'Mihomo YAML' : 'Surge List'}</strong><small>{t('inspector.ruleSource.validated', { count: existing.matchers.length })}</small></span></div>}
    {issues.length > 0 && <div className="custom-rule-source-issues">{issues.map((issue, index) => <div data-severity={issue.severity} key={`${issue.code}-${index}`}><AlertTriangle size={14} /><span><strong>{issue.code}</strong><small>{issue.line ? `${t('inspector.ruleSource.line')} ${issue.line} · ` : ''}{issue.message}</small></span></div>)}</div>}
  </section>
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image data.'))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function MatcherValueField({ node, kind, matcherValue, update, t }: { node: GraphNode; kind: NonNullable<BlockNodeData['routeMatcherKind']>; matcherValue: string; update: ReturnType<typeof useBuilderStore.getState>['updateNodeData']; t: ReturnType<typeof useI18n>['t'] }) {
  if (kind === 'service') return null
  const sourcePortValue = isTargetNativeSourcePortConfig(node.data.targetNativeSourcePort)
    ? node.data.targetNativeSourcePort.port
    : undefined
  return kind === 'port' || kind === 'source-port'
    ? <Field label={t('inspector.matcherValue')}><input type="number" min="1" max="65535" value={(kind === 'source-port' ? sourcePortValue : node.data.routeMatcherPort) ?? ''} placeholder="443" onChange={(event) => {
      const port = Number(event.target.value)
      update(node.id, {
        routeMatcherPort: port,
        ...(kind === 'source-port' ? { targetNativeSourcePort: isValidSourcePort(port) ? { target: 'surge', kind: 'source-port', port } : undefined } : {}),
      })
    }} /></Field>
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
  if (kind === 'source-port') return t('inspector.matcher.sourcePort')
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

function OutputInspector({ node, onOpenWorkspaceSection }: InspectorProps) {
  const { locale, t } = useI18n()
  const setOutputClient = useBuilderStore((state) => state.setOutputClient)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const setPreviewOpen = useBuilderStore((state) => state.setPreviewOpen)
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const toProject = useBuilderStore((state) => state.toProject)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const activeProductTarget = resolveActiveProductTarget(primaryTarget)
  const graph = useMemo(() => compileGraph(toProject(), {
    subscriptionSnapshots: localizeSubscriptionSnapshots(subscriptionSnapshots, locale),
    validationTarget: activeProductTarget,
  }), [activeProductTarget, edges, locale, nodes, projectId, projectName, subscriptionSnapshots, toProject])
  const registeredTarget = isPrimaryTarget(node.data.client) ? node.data.client : undefined
  const supported = Boolean(registeredTarget && isProductTarget(registeredTarget))
  const paused = Boolean(registeredTarget && getTargetCapabilities(registeredTarget).productStatus === 'paused')
  const targetOptions = useMemo(() => {
    if (!registeredTarget) return undefined
    const records = graph.targetNativeSurgeGeneralNetworks
      ?? (graph.targetNativeSurgeGeneralNetwork ? [graph.targetNativeSurgeGeneralNetwork] : [])
    return {
      outputNodeId: node.id,
      ...(node.data.client === 'mihomo' ? { targetProfile: node.data.mihomoProfile } : {}),
      targetNativeSurgeGeneralNetwork: resolveTargetNativeSurgeGeneralNetworkForOutput(records, node.id),
    }
  }, [graph.targetNativeSurgeGeneralNetwork, graph.targetNativeSurgeGeneralNetworks, node.data.client, node.data.mihomoProfile, node.id, registeredTarget])
  const target = useTargetCompile(graph.ir, supported ? registeredTarget : undefined, graph.success, targetOptions)
  const errors = graph.success ? target.result?.issues.filter((issue) => issue.severity === 'error').length ?? 0 : graph.issues.filter((issue) => issue.severity === 'error').length
  const warnings = graph.success ? target.result?.issues.filter((issue) => issue.severity === 'warning').length ?? 0 : graph.issues.filter((issue) => issue.severity === 'warning').length
  const info = target.result?.issues.filter((issue) => issue.severity === 'info').length ?? 0
  const compiled = supported && graph.success && target.status === 'success'
  return <>
    {paused && registeredTarget && <div className="validation-banner"><AlertTriangle size={15} /><span><strong>{t('workspace.targetPausedTitle', { target: getTargetCapabilities(registeredTarget).label })}</strong>{t('workspace.targetPausedDescription')}</span></div>}
    <Field label={t('inspector.targetClient')}><div className="client-grid">{productionOutputDefinitions.map((output) => <button className={node.data.client === output.target ? 'is-selected' : ''} key={output.id} onClick={() => setOutputClient(node.id, output.target)}><AssetIcon className="client-icon" src={output.icon} darkSrc={output.iconDark} fallback={output.label.slice(0, 1)} /><strong>{output.label}</strong><small>{t('node.compatibility.supported')}</small>{node.data.client === output.target && <Check className="client-check" size={15} />}</button>)}</div></Field>
    <SurgeGeneralNetworkEditor node={node} primaryTarget={registeredTarget} />
    <div className="compat-card"><ShieldCheck size={18} /><div><strong>{t('inspector.compatibility')}</strong><span>{!supported ? t('inspector.clientUnavailable') : target.status === 'loading' ? t('inspector.loadingCompiler') : compiled ? t('inspector.warningInfo', { warnings, info }) : t('inspector.errorNoOutput', { errors })}</span></div><b>{!supported ? t('inspector.unsupported') : target.status === 'loading' ? t('preview.loading') : compiled ? t('preview.compiled') : t('inspector.blocked')}</b></div>
    {onOpenWorkspaceSection && <button className="inspector-primary-button" onClick={() => onOpenWorkspaceSection('export')}><FileOutput size={15} /> {t('workspace.open')} {t('workspace.export')}</button>}
    <button className="inspector-primary-button" onClick={() => setPreviewOpen(true)}><Eye size={15} /> {t('inspector.previewConfig')}</button>
    <div className="mock-note">{t('inspector.realCompilerNote')}</div>
  </>
}

export interface SurgeGeneralNetworkEditorProps {
  node: GraphNode
  primaryTarget?: PrimaryTarget | null
}

/** Output-local Product editor for the typed Surge IPv6/VIF General family. */
export function SurgeGeneralNetworkEditor({ node, primaryTarget }: SurgeGeneralNetworkEditorProps) {
  const { t } = useI18n()
  const update = useBuilderStore((state) => state.updateNodeData)
  const config = node.data.targetNativeSurgeGeneralNetwork
  const hasPersistedIntent = config !== undefined
  const state = getSurgeGeneralNetworkUiState({ primaryTarget, hasPersistedIntent })
  const valid = !hasPersistedIntent || isTargetNativeSurgeGeneralNetworkConfig(config)
  const setChoice = (field: SurgeGeneralNetworkField, choice: string) => {
    const nextChoice = choice as SurgeGeneralNetworkChoice
    // Retained intent on another target is inspectable/removable, but it is
    // not editable there.  Otherwise selecting a second field would create
    // new Surge semantics while the Product state explicitly denies creation.
    if (primaryTarget !== 'surge') return
    if (nextChoice !== 'default' && !state.canCreate) return
    update(node.id, surgeGeneralNetworkOptionsPatch(config, field, nextChoice))
  }

  if (!hasPersistedIntent && primaryTarget !== 'surge') return null

  return <section className="target-native-card surge-general-network-editor" data-general-network="surge" aria-label={t('inspector.generalNetwork.title')}>
    <div className="target-native-card-heading">
      <span><strong>{t('inspector.generalNetwork.title')}</strong><small>{primaryTarget === 'surge' ? t('inspector.generalNetwork.hint') : t('inspector.generalNetwork.retainedHint')}</small></span>
      <em className="node-native-badge">{t('inspector.generalNetwork.surgeOnlyLabel')}</em>
    </div>
    {!valid && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('inspector.generalNetwork.invalid')}</strong><small>{t('inspector.generalNetwork.invalidDetail')}</small></span><button type="button" className="inspector-secondary-button" onClick={() => update(node.id, removeSurgeGeneralNetworkOptions())}>{t('inspector.generalNetwork.remove')}</button></div>}
    {valid && <>
      <Field label={t('inspector.generalNetwork.ipv6')} hint={t('inspector.generalNetwork.ipv6Hint')}><WebSelect disabled={primaryTarget !== 'surge'} label={t('inspector.generalNetwork.ipv6')} value={surgeGeneralNetworkFieldChoice(config, 'ipv6')} onChange={(value) => setChoice('ipv6', value)} options={[{ value: 'default', label: t('inspector.generalNetwork.default') }, { value: 'enabled', label: t('inspector.generalNetwork.enabled') }, { value: 'disabled', label: t('inspector.generalNetwork.disabled') }]} /></Field>
      <Field label={t('inspector.generalNetwork.ipv6Vif')} hint={t('inspector.generalNetwork.ipv6VifHint')}><WebSelect disabled={primaryTarget !== 'surge'} label={t('inspector.generalNetwork.ipv6Vif')} value={surgeGeneralNetworkFieldChoice(config, 'ipv6Vif')} onChange={(value) => setChoice('ipv6Vif', value)} options={[{ value: 'default', label: t('inspector.generalNetwork.default') }, { value: 'disabled', label: t('inspector.generalNetwork.disabled') }, { value: 'auto', label: t('inspector.generalNetwork.auto') }, { value: 'always', label: t('inspector.generalNetwork.always') }]} /></Field>
      <Field label={t('inspector.generalNetwork.icmpForwarding')} hint={t('inspector.generalNetwork.icmpHint')}><WebSelect disabled={primaryTarget !== 'surge'} label={t('inspector.generalNetwork.icmpForwarding')} value={surgeGeneralNetworkFieldChoice(config, 'icmpForwarding')} onChange={(value) => setChoice('icmpForwarding', value)} options={[{ value: 'default', label: t('inspector.generalNetwork.default') }, { value: 'enabled', label: t('inspector.generalNetwork.enabled') }, { value: 'disabled', label: t('inspector.generalNetwork.disabled') }]} /></Field>
      {surgeGeneralNetworkFieldChoice(config, 'ipv6Vif') === 'always' && <div className="validation-banner"><AlertTriangle size={15} /><span>{t('inspector.generalNetwork.alwaysWarning')}</span></div>}
      <div className="mock-note">{t('inspector.generalNetwork.icmpNote')}</div>
      {state.isTargetMismatch && <div className="validation-banner validation-banner--error"><AlertTriangle size={15} /><span><strong>{t('inspector.generalNetwork.surgeOnly')}</strong><small>{t('inspector.generalNetwork.targetMismatch')}</small></span></div>}
      {state.hasPersistedIntent && primaryTarget !== 'surge' && <button type="button" className="inspector-secondary-button" onClick={() => update(node.id, removeSurgeGeneralNetworkOptions())}><X size={14} />{t('inspector.generalNetwork.remove')}</button>}
    </>}
  </section>
}

function DnsInspector({ node, onOpenWorkspaceSection }: InspectorProps) {
  const { t } = useI18n()
  const resolvers = normalizeDnsResolvers(node.data.dnsResolvers, node.data.resolver)
  const enabledCount = resolvers.filter((resolver) => resolver.enabled).length
  return <>
    <TextField node={node} field="title" label={t('inspector.name')} />
    <div className="compat-card"><Globe2 size={18} /><div><strong>{t('workspace.dnsAdvanced')}</strong><span>{t('workspace.export.resolvers', { count: enabledCount })}</span></div><b>{enabledCount}</b></div>
    {onOpenWorkspaceSection && <button className="inspector-primary-button" onClick={() => onOpenWorkspaceSection('dns')}><Globe2 size={15} /> {t('workspace.open')} {t('workspace.dnsAdvanced')}</button>}
  </>
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
  'target-native-strategy': TargetNativeStrategyInspector,
  'fixed-proxy': FixedStrategyInspector,
  'proxy-chain': ChainInspector,
  'routing-group': RoutingInspector,
  'service-rule': RoutingInspector,
  'custom-rule': RoutingInspector,
  final: RoutingInspector,
  dns: DnsInspector,
  output: OutputInspector,
}

export function RouteInspectorPanel() {
  const { t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const projectName = useBuilderStore((state) => state.projectName)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const subscriptionSnapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const toProject = useBuilderStore((state) => state.toProject)
  const [query, setQuery] = useState<RouteQuery>({})
  const project = useMemo(() => toProject(), [edges, nodes, projectName, toProject])
  const activeProductTarget = resolveActiveProductTarget(primaryTarget)
  const graph = useMemo(() => compileGraph(project, {
    subscriptionSnapshots,
    retainDraftOnErrorForDiagnostics: true,
    validationTarget: activeProductTarget,
  }), [activeProductTarget, project, subscriptionSnapshots])
  const result = useMemo(() => graph.ir ? inspectRoute(graph.ir, query) : undefined, [graph.ir, query])
  const services = currentAuthoringServices(project.services).filter((service) => service.id && service.name)
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
      <Field label={t('inspector.routeInspectorService')}><WebSelect label={t('inspector.routeInspectorService')} value={query.serviceId ?? ''} onChange={(value) => setField('serviceId', value)} options={[{ value: '', label: t('inspector.routeInspectorAnyService') }, ...services.map((service) => ({ value: service.id, label: service.name }))]} /></Field>
    </div>
    {!graph.success && <div className="route-inspector-blocked"><AlertTriangle size={14} /><span>{t('inspector.routeInspectorCompileBlocked')}</span></div>}
    {graph.success && result?.status === 'unresolved' && <div className="route-inspector-empty"><Search size={16} /><span>{t('inspector.routeInspectorEnterQuery')}</span></div>}
    {graph.success && result && result.status !== 'unresolved' && <div className="route-inspector-result">
      <div className="route-inspector-result-header"><span>{result.status === 'matched' ? t('inspector.routeInspectorMatched') : t('inspector.routeInspectorDefault')}</span><strong>{result.matchedRule?.name ?? t('inspector.routeInspectorDefaultRoute')}</strong></div>
      {result.matchedRule && <div className="route-inspector-detail"><span>{t('inspector.routeInspectorPriority')}</span><strong>{result.matchedRule.priority}</strong><small>{formatRouteReason(result.matchedRule.reason, t)}</small></div>}
      {target && <div className="route-inspector-detail"><span>{t('inspector.routeInspectorTarget')}</span><strong>{target.label}</strong><small>{target.kind === 'direct' ? t('inspector.routeInspectorDirect') : target.kind === 'reject' ? t('inspector.routeInspectorReject') : t('inspector.routeInspectorStrategy')}</small></div>}
      {strategy && <>
        <div className="route-inspector-detail"><span>{t('inspector.routeInspectorCandidatePath')}</span><strong>{strategy.candidatePath.join(' → ') || t('inspector.routeInspectorNoCandidates')}</strong><small>{t('inspector.routeInspectorCandidateCount', { count: strategy.candidateCount })}</small></div>
        <div className="route-inspector-targets"><span>{t('inspector.routeInspectorCompatibility')}</span><div><b>{getTargetCapabilities(activeProductTarget).label}</b><em className={`is-${strategy.targetSupport[activeProductTarget]}`}>{strategy.targetSupport[activeProductTarget]}</em></div></div>
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

export function Inspector({ onOpenWorkspaceSection }: { onOpenWorkspaceSection?: (section: WorkspaceSectionId) => void } = {}) {
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
    <div className="inspector-scroll"><Content node={selected} onOpenWorkspaceSection={onOpenWorkspaceSection} /></div>
    {deleteConfirmOpen && <div className="subscription-dialog-backdrop" role="presentation" onMouseDown={() => setDeleteConfirmOpen(false)}><section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-subscription-title" onMouseDown={(event) => event.stopPropagation()}><span className="confirmation-icon is-warning"><Trash2 size={20} /></span><h2 id="delete-subscription-title">{t('subscription.delete.title')}</h2><p>{t('subscription.delete.description')}</p><footer><button ref={deleteCancelRef} className="secondary-action" onClick={() => setDeleteConfirmOpen(false)}>{t('subscription.delete.cancel')}</button><button className="danger-action" onClick={() => { setDeleteConfirmOpen(false); deleteSelected() }}>{t('subscription.delete.confirm')}</button></footer></section></div>}
  </aside>
}

function StarterActions({ onAddSubscription, onLoadDemo }: { onAddSubscription: () => void; onLoadDemo: () => void }) {
  const { t } = useI18n()
  return <section className="starter-actions"><span>{t('inspector.starterKicker')}</span><h3>{t('inspector.starterTitle')}</h3><p>{t('inspector.starterDescription')}</p><div><button className="primary-action" onClick={onAddSubscription}><Plus size={14} /> {t('inspector.starterAddSource')}</button><button className="secondary-action" onClick={onLoadDemo}><LayoutTemplate size={14} /> {t('inspector.starterLoadDemo')}</button></div></section>
}
