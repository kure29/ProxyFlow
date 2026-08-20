import { useMemo, useState } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUp, Boxes, CheckCircle2, CircleAlert, CircleOff,
  Clock3, GitBranch, Info, Pencil, Power, Radio, RefreshCw, Search, Settings2,
  ShieldCheck, Trash2, TriangleAlert, X,
} from 'lucide-react'
import {
  filterWorkspaceProxies, groupProjectHealthDiagnostics, summarizeWorkspaceProcessing,
  summarizeWorkspaceSource, summarizeWorkspaceStrategy, type ProcessingMoveAvailability,
  type WorkspaceNodeItem, type WorkspaceProxySummary,
  type WorkspacePresentationStatus, type WorkspaceSourceRuntimeLike, type WorkspaceSourceStatus,
  type WorkspaceStrategyKind,
} from '../../core/workspace'
import type { PipelineNodeRuntime } from '../../core/proxySet'
import type { StructuredDiagnostic } from '../../core/compiler'
import type { PrimaryTarget } from '../../core/capabilities'
import type { CompatibilityIssue, GraphNode } from '../../types/project'
import { localizeDiagnosticMessage, localizeNodeTitle, useI18n } from '../../i18n'
import type { MessageKey } from '../../i18n'
import { BlockIcon } from '../icons/BlockIcon'
import { RouteInspectorPanel } from '../inspector/Inspector'

const sourceStatusMessages = {
  healthy: 'workspace.source.status.healthy',
  refreshing: 'workspace.source.status.refreshing',
  error: 'workspace.source.status.error',
  stale: 'workspace.source.status.stale',
  idle: 'workspace.source.status.idle',
  disabled: 'workspace.source.status.disabled',
} as const satisfies Record<WorkspaceSourceStatus, MessageKey>

const presentationStatusMessages = {
  ready: 'workspace.status.ready',
  warning: 'workspace.status.warning',
  error: 'workspace.status.error',
  stale: 'workspace.status.stale',
  unavailable: 'workspace.status.unavailable',
  disabled: 'workspace.status.disabled',
} as const satisfies Record<WorkspacePresentationStatus, MessageKey>

const compatibilityMessages = {
  supported: 'workspace.compatibility.supported',
  partial: 'workspace.compatibility.partial',
  unsupported: 'workspace.compatibility.unsupported',
  'target-native': 'workspace.compatibility.targetNative',
  unknown: 'workspace.compatibility.unknown',
} as const satisfies Record<WorkspaceProxySummary['compatibility'], MessageKey>

export function SourcesWorkspace({ items, runtimes, onRefresh, onEdit, onToggle, onDelete }: {
  items: WorkspaceNodeItem[]
  runtimes: Record<string, WorkspaceSourceRuntimeLike | undefined>
  onRefresh: (id: string) => Promise<void>
  onEdit: (item: WorkspaceNodeItem) => void
  onToggle: (item: WorkspaceNodeItem, disabled: boolean) => void
  onDelete: (item: WorkspaceNodeItem) => void
}) {
  const { locale, t } = useI18n()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  if (!items.length) return <WorkspaceEmpty icon={<Radio size={22} />} title={t('workspace.empty.sources')} />

  return <div className="workspace-source-list">{items.map((item) => {
    const runtime = runtimes[item.node.id]
    const source = summarizeWorkspaceSource(item.node, runtime)
    const disabled = source.status === 'disabled'
    const isUrl = item.node.data.blockType === 'subscription' && item.node.data.subscriptionInputKind === 'url'
    const sourceKind = sourceKindKey(item.node)
    return <article className="workspace-source-item" data-status={source.status} key={source.id}>
      <div className="workspace-source-icon"><BlockIcon name={item.node.data.icon} size={19} /></div>
      <div className="workspace-source-main">
        <div className="workspace-source-title"><strong>{localizeNodeTitle(item.node, locale)}</strong><SourceStatus status={source.status} label={t(sourceStatusMessages[source.status])} /></div>
        <div className="workspace-source-meta">
          <span>{source.hostname ?? t(sourceKind)}</span>
          <span>{t('workspace.source.nodes', { count: source.nodeCount })}</span>
          <span><Clock3 size={13} />{source.lastSuccessfulAt
            ? relativeSourceTimeLabel(source.lastSuccessfulAt, locale, t)
            : t('workspace.source.neverRefreshed')}</span>
        </div>
        {source.usingLastKnownGood && <p className="workspace-source-lkg"><TriangleAlert size={14} />{t('workspace.source.lastKnownGood')}</p>}
        {pendingDelete === source.id && <div className="workspace-inline-confirm" role="alert">
          <span>{t('workspace.source.deleteConfirm', { name: localizeNodeTitle(item.node, locale) })}</span>
          <button type="button" onClick={() => setPendingDelete(null)}>{t('workspace.cancel')}</button>
          <button type="button" className="danger" onClick={() => { onDelete(item); setPendingDelete(null) }}>{t('workspace.delete')}</button>
        </div>}
      </div>
      <div className="workspace-row-actions">
        {isUrl && <button type="button" className="icon-button" disabled={disabled || source.status === 'refreshing'} title={t('workspace.source.refresh')} aria-label={t('workspace.source.refresh')} onClick={() => void onRefresh(source.id)}><RefreshCw className={source.status === 'refreshing' ? 'spin' : ''} size={16} /></button>}
        <button type="button" className="icon-button" title={t('workspace.source.edit')} aria-label={t('workspace.source.edit')} onClick={() => onEdit(item)}><Pencil size={16} /></button>
        <button type="button" className="icon-button" title={disabled ? t('workspace.source.enable') : t('workspace.source.disable')} aria-label={disabled ? t('workspace.source.enable') : t('workspace.source.disable')} onClick={() => onToggle(item, !disabled)}><Power size={16} /></button>
        <button type="button" className="icon-button danger" disabled={Boolean(item.node.data.protected)} title={t('workspace.source.delete')} aria-label={t('workspace.source.delete')} onClick={() => setPendingDelete(source.id)}><Trash2 size={16} /></button>
      </div>
    </article>
  })}</div>
}

export function ProxiesWorkspace({ proxies }: { proxies: WorkspaceProxySummary[] }) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [region, setRegion] = useState('')
  const [protocol, setProtocol] = useState('')
  const [sourceAvailability, setSourceAvailability] = useState('')
  const [compatibility, setCompatibility] = useState('')
  const options = useMemo(() => collectProxyFilterOptions(proxies), [proxies])
  const filtered = useMemo(() => filterWorkspaceProxies(proxies, {
    search, sourceId, region,
    protocol: protocol as WorkspaceProxySummary['protocol'] || undefined,
    sourceAvailability: sourceAvailability as WorkspaceProxySummary['sourceAvailability'] || undefined,
    compatibility: compatibility as WorkspaceProxySummary['compatibility'] || undefined,
  }), [compatibility, protocol, proxies, region, search, sourceAvailability, sourceId])
  const filteredState = Boolean(search || sourceId || region || protocol || sourceAvailability || compatibility)

  if (!proxies.length) return <WorkspaceEmpty icon={<Boxes size={22} />} title={t('workspace.empty.proxies')} />
  return <div className="workspace-proxies-page">
    <div className="workspace-proxy-filters" role="search">
      <label className="workspace-search-field"><span className="visually-hidden">{t('workspace.proxy.search')}</span><Search size={16} /><input type="search" value={search} placeholder={t('workspace.proxy.search')} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" aria-label={t('workspace.proxy.clearSearch')} onClick={() => setSearch('')}><X size={14} /></button>}</label>
      <FilterSelect label={t('workspace.proxy.allSources')} value={sourceId} onChange={setSourceId} options={options.sources} />
      <FilterSelect label={t('workspace.proxy.allRegions')} value={region} onChange={setRegion} options={options.regions.map((value) => ({ value, label: value }))} />
      <FilterSelect label={t('workspace.proxy.allProtocols')} value={protocol} onChange={setProtocol} options={options.protocols.map((value) => ({ value, label: value }))} />
      <FilterSelect label={t('workspace.proxy.allAvailability')} value={sourceAvailability} onChange={setSourceAvailability} options={options.sourceAvailabilities.map((value) => ({ value, label: t(sourceStatusMessages[value]) }))} />
      <FilterSelect label={t('workspace.proxy.allCompatibility')} value={compatibility} onChange={setCompatibility} options={options.compatibilities.map((value) => ({ value, label: t(compatibilityMessages[value]) }))} />
      {filteredState && <button type="button" className="workspace-clear-filters" onClick={() => { setSearch(''); setSourceId(''); setRegion(''); setProtocol(''); setSourceAvailability(''); setCompatibility('') }}>{t('workspace.proxy.clearFilters')}</button>}
    </div>
    <div className="workspace-table-summary">{t('workspace.proxy.results', { shown: filtered.length, total: proxies.length })}</div>
    {filtered.length === 0
      ? <WorkspaceEmpty icon={<Search size={22} />} title={t('workspace.proxy.noMatches')} />
      : <div className="workspace-proxy-table" role="table" aria-label={t('workspace.proxies')} aria-rowcount={filtered.length + 1}>
        <div role="row" className="is-heading"><span role="columnheader">{t('workspace.name')}</span><span role="columnheader">{t('workspace.protocol')}</span><span role="columnheader">{t('workspace.region')}</span><span role="columnheader">{t('workspace.source')}</span><span role="columnheader">{t('workspace.proxy.sourceAvailability')}</span><span role="columnheader">{t('workspace.compatibility')}</span></div>
        {filtered.map((proxy) => <div role="row" key={`${proxy.sourceId}:${proxy.id}`}><strong role="cell" title={proxy.name}>{proxy.name}</strong><code role="cell">{proxy.protocol}</code><span role="cell">{proxy.region}</span><span role="cell" title={proxy.sourceName}>{proxy.sourceName}</span><SourceStatus role="cell" status={proxy.sourceAvailability} label={t(sourceStatusMessages[proxy.sourceAvailability])} /><b role="cell" className={`is-${proxy.compatibility}`}>{t(compatibilityMessages[proxy.compatibility])}</b></div>)}
      </div>}
  </div>
}

export function ProcessingWorkspace({ items, runtime, issues, availability, onMove, onToggle, onEdit }: {
  items: WorkspaceNodeItem[]
  runtime: ReadonlyMap<string, PipelineNodeRuntime>
  issues: StructuredDiagnostic[]
  availability: (nodeId: string) => ProcessingMoveAvailability
  onMove: (nodeId: string, direction: 'up' | 'down') => void
  onToggle: (item: WorkspaceNodeItem, disabled: boolean) => void
  onEdit: (item: WorkspaceNodeItem) => void
}) {
  const { locale, t } = useI18n()
  if (!items.length) return <WorkspaceEmpty icon={<Settings2 size={22} />} title={t('workspace.empty.processing')} />
  return <ol className="workspace-processing-pipeline" aria-label={t('workspace.processing.pipeline')}>{items.map((item, index) => {
    const step = summarizeWorkspaceProcessing(item, runtime.get(item.node.id), issues)
    const canMove = availability(item.node.id)
    const disabled = step.status === 'disabled'
    return <li className="workspace-processing-step" data-status={step.status} key={step.id}>
      <span className="workspace-step-number" aria-hidden="true">{index + 1}</span>
      <div className="workspace-step-icon"><BlockIcon name={item.node.data.icon} size={18} /></div>
      <div className="workspace-step-main">
        <div><strong>{localizeNodeTitle(item.node, locale)}</strong><StatusBadge status={step.status} /></div>
        <p>{processingSummaryLabel(step.summary, t)}</p>
        {(step.inputCount !== undefined || step.outputCount !== undefined) && <small>{t('workspace.processing.counts', { input: step.inputCount ?? 0, output: step.outputCount ?? 0, removed: step.removedCount ?? 0 })}</small>}
      </div>
      <label className="workspace-compact-toggle"><span className="visually-hidden">{disabled ? t('workspace.enable') : t('workspace.disable')}</span><input type="checkbox" checked={!disabled} onChange={(event) => onToggle(item, !event.target.checked)} /></label>
      <div className="workspace-step-actions">
        <button type="button" className="icon-button" disabled={!canMove.up} title={canMove.up ? t('workspace.processing.moveUp') : t('workspace.processing.reorderUnavailable')} aria-label={t('workspace.processing.moveUp')} onClick={() => onMove(step.id, 'up')}><ArrowUp size={16} /></button>
        <button type="button" className="icon-button" disabled={!canMove.down} title={canMove.down ? t('workspace.processing.moveDown') : t('workspace.processing.reorderUnavailable')} aria-label={t('workspace.processing.moveDown')} onClick={() => onMove(step.id, 'down')}><ArrowDown size={16} /></button>
        <button type="button" className="row-action" onClick={() => onEdit(item)}>{t('workspace.open')}</button>
      </div>
    </li>
  })}</ol>
}

export function StrategiesWorkspace({ items, target, runtime, issues, onEdit }: {
  items: WorkspaceNodeItem[]
  target: PrimaryTarget | null
  runtime: ReadonlyMap<string, PipelineNodeRuntime>
  issues: StructuredDiagnostic[]
  onEdit: (item: WorkspaceNodeItem) => void
}) {
  const { t } = useI18n()
  const presentations = items.map((item) => ({ item, strategy: summarizeWorkspaceStrategy(item, target, runtime.get(item.node.id), issues) }))
  const basic = presentations.filter(({ strategy }) => !strategy.advanced)
  const advanced = presentations.filter(({ strategy }) => strategy.advanced)
  if (!items.length) return <WorkspaceEmpty icon={<GitBranch size={22} />} title={t('workspace.empty.strategies')} />

  return <div className="workspace-strategy-page">
    {basic.length > 0 && <section aria-labelledby="strategy-basic-title"><h2 id="strategy-basic-title">{t('workspace.strategy.basic')}</h2><div className="workspace-strategy-grid">{basic.map(({ item, strategy }) => <StrategyCard key={strategy.id} item={item} strategy={strategy} onEdit={onEdit} />)}</div></section>}
    {advanced.length > 0 && <details className="workspace-advanced-section"><summary>{t('workspace.strategy.advanced', { count: advanced.length })}</summary><div className="workspace-strategy-grid">{advanced.map(({ item, strategy }) => <StrategyCard key={strategy.id} item={item} strategy={strategy} onEdit={onEdit} />)}</div></details>}
  </div>
}

export function ProjectHealthWorkspace({ nodes, diagnostics, compatibilityDiagnostics, onOpenNode }: {
  nodes: GraphNode[]
  diagnostics: StructuredDiagnostic[]
  compatibilityDiagnostics: CompatibilityIssue[]
  onOpenNode: (nodeId: string) => void
}) {
  const { locale, t } = useI18n()
  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes])
  const groups = useMemo(() => groupProjectHealthDiagnostics(diagnostics, compatibilityDiagnostics, nodeIds), [compatibilityDiagnostics, diagnostics, nodeIds])
  const warnings = groups.warnings.filter((issue) => issue.severity === 'warning')
  const suggestions = groups.warnings.filter((issue) => issue.severity === 'info')
  const allClear = groups.errors.length + warnings.length + groups.compatibility.length + suggestions.length === 0
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  return <div className="workspace-inspect-page">
    <RouteInspectorPanel />
    {allClear
      ? <div className="workspace-health-ready"><ShieldCheck size={28} /><div><strong>{t('workspace.health.ready')}</strong><p>{t('workspace.health.readyDescription')}</p></div></div>
      : <div className="workspace-health-page">
        <HealthSection id="health-errors" title={t('workspace.health.errors')} icon={<CircleAlert size={18} />} severity="error" entries={groups.errors} />
        <HealthSection id="health-warnings" title={t('workspace.health.warnings')} icon={<TriangleAlert size={18} />} severity="warning" entries={warnings} />
        <HealthSection id="health-compatibility" title={t('workspace.health.compatibility')} icon={<ShieldCheck size={18} />} severity="compatibility" entries={groups.compatibility} />
        <HealthSection id="health-suggestions" title={t('workspace.health.suggestions')} icon={<Info size={18} />} severity="info" entries={suggestions} />
      </div>}
  </div>

  function HealthSection({ id, title, icon, severity, entries }: {
    id: string
    title: string
    icon: React.ReactNode
    severity: 'error' | 'warning' | 'compatibility' | 'info'
    entries: ReturnType<typeof groupProjectHealthDiagnostics>['errors']
  }) {
    return <section className="workspace-health-section" data-severity={severity} aria-labelledby={id}>
      <header>{icon}<h2 id={id}>{title}</h2><span>{entries.length}</span></header>
      {entries.length === 0
        ? <p className="workspace-health-empty">{t('workspace.health.none')}</p>
        : <div>{entries.map((entry, index) => {
          const location = entry.locationNodeId ? nodeById.get(entry.locationNodeId) : undefined
          return <article key={`${entry.target ?? 'project'}-${entry.code}-${entry.locationNodeId ?? 'none'}-${index}`}>
            <div><strong>{localizeDiagnosticMessage(entry.code, entry.message, locale)}</strong><span>{entry.target && <b>{entry.target}</b>}{location && <small>{localizeNodeTitle(location, locale)}</small>}<code>{entry.code}</code></span></div>
            {entry.locationNodeId && <button type="button" onClick={() => onOpenNode(entry.locationNodeId!)}>{t('workspace.health.goTo')}<ArrowRight size={14} /></button>}
          </article>
        })}</div>}
    </section>
  }
}

export interface ProxyFilterOptions {
  sources: Array<{ value: string; label: string }>
  regions: string[]
  protocols: WorkspaceProxySummary['protocol'][]
  sourceAvailabilities: WorkspaceProxySummary['sourceAvailability'][]
  compatibilities: WorkspaceProxySummary['compatibility'][]
}

export function collectProxyFilterOptions(proxies: readonly WorkspaceProxySummary[]): ProxyFilterOptions {
  const sources = new Map<string, string>()
  for (const proxy of proxies) if (!sources.has(proxy.sourceId)) sources.set(proxy.sourceId, proxy.sourceName)
  return {
    sources: [...sources].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label)),
    regions: uniqueSorted(proxies.map((proxy) => proxy.region)),
    protocols: uniqueSorted(proxies.map((proxy) => proxy.protocol)),
    sourceAvailabilities: uniqueSorted(proxies.map((proxy) => proxy.sourceAvailability)),
    compatibilities: uniqueSorted(proxies.map((proxy) => proxy.compatibility)),
  }
}

export type RelativeSourceTime =
  | { unit: 'now'; count: 0 }
  | { unit: 'minute' | 'hour' | 'day'; count: number }
  | { unit: 'date'; value: Date }

export function resolveRelativeSourceTime(value: string, now = Date.now()): RelativeSourceTime | undefined {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return undefined
  const elapsed = Math.max(0, now - timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return { unit: 'now', count: 0 }
  if (minutes < 60) return { unit: 'minute', count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { unit: 'hour', count: hours }
  const days = Math.floor(hours / 24)
  if (days < 7) return { unit: 'day', count: days }
  return { unit: 'date', value: new Date(timestamp) }
}

function relativeSourceTimeLabel(value: string, locale: string, t: ReturnType<typeof useI18n>['t']) {
  const relative = resolveRelativeSourceTime(value)
  if (!relative) return t('workspace.source.neverRefreshed')
  if (relative.unit === 'now') return t('workspace.source.refreshedNow')
  if (relative.unit === 'date') return t('workspace.source.refreshedOn', {
    date: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(relative.value),
  })
  return t(`workspace.source.refreshed${relative.unit === 'minute' ? 'Minutes' : relative.unit === 'hour' ? 'Hours' : 'Days'}` as MessageKey, { count: relative.count })
}

function sourceKindKey(node: GraphNode): MessageKey {
  if (node.data.blockType === 'manual-proxy') return 'workspace.source.kind.manual'
  if (node.data.blockType === 'import-config' || node.data.subscriptionInputKind === 'file') return 'workspace.source.kind.file'
  if (node.data.subscriptionInputKind === 'paste') return 'workspace.source.kind.paste'
  return 'workspace.source.kind.url'
}

function SourceStatus({ status, label, role }: { status: WorkspaceSourceStatus; label: string; role?: React.AriaRole }) {
  const Icon = status === 'healthy' ? CheckCircle2 : status === 'disabled' ? CircleOff : status === 'refreshing' ? RefreshCw : status === 'idle' ? Clock3 : TriangleAlert
  return <span className="workspace-status-badge" data-status={status} role={role}><Icon className={status === 'refreshing' ? 'spin' : ''} size={13} />{label}</span>
}

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return <label className="workspace-filter-select"><span className="visually-hidden">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
}

function StatusBadge({ status }: { status: WorkspacePresentationStatus }) {
  const { t } = useI18n()
  const Icon = status === 'ready' ? CheckCircle2 : status === 'disabled' ? CircleOff : status === 'unavailable' ? CircleAlert : status === 'stale' ? Clock3 : TriangleAlert
  return <span className="workspace-status-badge" data-status={status}><Icon size={13} />{t(presentationStatusMessages[status])}</span>
}

function processingSummaryLabel(summary: ReturnType<typeof summarizeWorkspaceProcessing>['summary'], t: ReturnType<typeof useI18n>['t']) {
  if (summary.kind === 'filter') return t('workspace.processing.summary.filter', { operation: t(summary.operation === 'exclude' ? 'workspace.processing.exclude' : 'workspace.processing.include'), count: summary.criterionCount })
  if (summary.kind === 'rename') return t('workspace.processing.summary.rename', { mode: t(summary.mode === 'simple' ? 'workspace.processing.renameSimple' : 'workspace.processing.renameRegex'), state: t(summary.configured ? 'workspace.processing.configured' : 'workspace.processing.notConfigured') })
  if (summary.kind === 'sort') return t('workspace.processing.summary.sort', { field: t(`workspace.processing.sort.${summary.by}` as MessageKey), direction: t(`workspace.processing.sort.${summary.direction}` as MessageKey) })
  if (summary.kind === 'deduplicate') return t('workspace.processing.summary.deduplicate')
  if (summary.kind === 'merge') return t('workspace.processing.summary.merge', { count: summary.sourceCount })
  if (summary.kind === 'limit') return summary.max === undefined ? t('workspace.processing.summary.limitUnset') : t('workspace.processing.summary.limit', { count: summary.max })
  return t('workspace.processing.summary.unknown')
}

function StrategyCard({ item, strategy, onEdit }: {
  item: WorkspaceNodeItem
  strategy: ReturnType<typeof summarizeWorkspaceStrategy>
  onEdit: (item: WorkspaceNodeItem) => void
}) {
  const { locale, t } = useI18n()
  return <article className="workspace-strategy-card" data-status={strategy.status}>
    <div className="workspace-strategy-icon"><BlockIcon name={item.node.data.icon} size={19} /></div>
    <div className="workspace-strategy-main"><div><strong>{localizeNodeTitle(item.node, locale)}</strong><StatusBadge status={strategy.status} /></div><p>{t(strategyKindKey(strategy.kind))}</p><small>{strategySummaryLabel(strategy.summary, t)}</small></div>
    <div className="workspace-strategy-meta">{strategy.candidateCount !== undefined && <span>{t('workspace.strategy.candidates', { count: strategy.candidateCount })}</span>}<b className={`is-${strategy.capability}`}>{strategy.capability === 'unknown' ? t('workspace.compatibility.unknown') : t(compatibilityMessages[strategy.capability])}</b></div>
    <button type="button" className="row-action" onClick={() => onEdit(item)}>{t('workspace.open')}</button>
  </article>
}

function strategyKindKey(kind: WorkspaceStrategyKind): MessageKey {
  return `workspace.strategy.kind.${kind}` as MessageKey
}

function strategySummaryLabel(summary: ReturnType<typeof summarizeWorkspaceStrategy>['summary'], t: ReturnType<typeof useI18n>['t']) {
  if (summary.kind === 'auto' || summary.kind === 'failover') return t('workspace.strategy.summary.healthCheck', { interval: summary.intervalSeconds ?? 0, tolerance: summary.toleranceMs ?? 0 })
  if (summary.kind === 'load-balance') return t('workspace.strategy.summary.loadBalance', { mode: summary.mode ?? t('workspace.strategy.notConfigured') })
  if (summary.kind === 'fixed') return t(summary.configured ? 'workspace.strategy.summary.fixedReady' : 'workspace.strategy.summary.fixedMissing')
  if (summary.kind === 'chain') return t('workspace.strategy.summary.chain', { count: summary.hopCount })
  if (summary.kind === 'manual') return t('workspace.strategy.summary.manual')
  return t('workspace.strategy.summary.unknown')
}

function WorkspaceEmpty({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="workspace-empty-state">{icon}<strong>{title}</strong></div>
}

function uniqueSorted<T extends string>(values: readonly T[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}
