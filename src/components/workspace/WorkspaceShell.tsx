import { useMemo } from 'react'
import {
  ArrowDown, ArrowUp, Boxes, CircleAlert, Download, FileOutput, GitBranch, Globe2,
  ListFilter, Network, Plus, Radio, RefreshCw, Route, SearchCheck, Settings2, ShieldCheck,
} from 'lucide-react'
import { createWorkspaceProjection, type WorkspaceNodeItem, type WorkspaceSectionId } from '../../core/workspace'
import { getTargetCapabilities } from '../../core/capabilities'
import { localizeDiagnosticMessage, useI18n } from '../../i18n'
import type { MessageKey } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import { BlockIcon } from '../icons/BlockIcon'
import type { ProductView, WorkspaceNavigationState } from './types'

interface WorkspaceShellProps extends WorkspaceNavigationState {
  onViewChange: (view: ProductView) => void
}

const navigation = [
  { id: 'sources', icon: Radio, label: 'workspace.sources' },
  { id: 'proxies', icon: Boxes, label: 'workspace.proxies' },
  { id: 'processing', icon: ListFilter, label: 'workspace.processing' },
  { id: 'strategies', icon: GitBranch, label: 'workspace.strategies' },
  { id: 'routing', icon: Route, label: 'workspace.routing' },
  { id: 'dns', icon: Globe2, label: 'workspace.dnsAdvanced' },
  { id: 'inspect', icon: SearchCheck, label: 'workspace.inspect' },
  { id: 'export', icon: FileOutput, label: 'workspace.export' },
] as const

const sourceStatusMessages = {
  idle: 'workspace.sourceStatus.idle',
  loading: 'workspace.sourceStatus.loading',
  succeeded: 'workspace.sourceStatus.succeeded',
  failed: 'workspace.sourceStatus.failed',
} as const satisfies Record<string, MessageKey>

const compatibilityMessages = {
  supported: 'workspace.compatibility.supported',
  partial: 'workspace.compatibility.partial',
  unsupported: 'workspace.compatibility.unsupported',
  'target-native': 'workspace.compatibility.targetNative',
  unknown: 'workspace.compatibility.unknown',
} as const satisfies Record<string, MessageKey>

export function WorkspaceShell({ activeSection, onSectionChange, onViewChange }: WorkspaceShellProps) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const projectId = useBuilderStore((state) => state.projectId)
  const projectName = useBuilderStore((state) => state.projectName)
  const primaryTarget = useBuilderStore((state) => state.primaryTarget)
  const snapshots = useBuilderStore((state) => state.subscriptionSnapshots)
  const runtimes = useBuilderStore((state) => state.subscriptionRuntimes)
  const toProject = useBuilderStore((state) => state.toProject)
  const addLibraryNode = useBuilderStore((state) => state.addLibraryNode)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const refreshSubscription = useBuilderStore((state) => state.refreshSubscription)
  const moveRule = useBuilderStore((state) => state.moveRoutingRule)
  const setPreviewOpen = useBuilderStore((state) => state.setPreviewOpen)

  const projection = useMemo(
    () => createWorkspaceProjection(toProject(), { subscriptionSnapshots: snapshots }),
    [edges, nodes, primaryTarget, projectId, projectName, snapshots, toProject],
  )
  const counts: Record<WorkspaceSectionId, number | undefined> = {
    sources: projection.sources.length,
    proxies: projection.proxies.length,
    processing: projection.processing.length,
    strategies: projection.strategies.length + projection.chains.length,
    routing: projection.routing.length + projection.finalRoutes.length,
    dns: projection.dns.length,
    inspect: projection.compileIssues.length,
    export: projection.outputs.length,
  }
  const targetLabel = primaryTarget ? getTargetCapabilities(primaryTarget).label : t('workspace.targetRequired')

  const editInFlow = (item: WorkspaceNodeItem) => {
    selectNode(item.node.id)
    onViewChange('visual-flow')
  }
  const addNode = (type: Parameters<typeof addLibraryNode>[0]) => {
    const index = nodes.filter((node) => node.data.blockType === type).length
    addLibraryNode(type, { x: 80 + index * 36, y: 90 + index * 42 })
  }

  return <div className="structured-workspace">
    <nav className="workspace-navigation" aria-label={t('workspace.navigation')}>
      <div className="workspace-target-summary"><ShieldCheck size={17} /><span><small>{t('workspace.primaryTarget')}</small><strong>{targetLabel}</strong></span></div>
      <div className="workspace-navigation-items">
        {navigation.map(({ id, icon: Icon, label }) => <button type="button" className={activeSection === id ? 'is-active' : ''} key={id} onClick={() => onSectionChange(id)} aria-current={activeSection === id ? 'page' : undefined}>
          <Icon size={17} /><span>{t(label)}</span>{counts[id] !== undefined && <small>{counts[id]}</small>}
        </button>)}
      </div>
      <button type="button" className="visual-flow-link" onClick={() => onViewChange('visual-flow')}><Network size={16} /><span>{t('top.visualFlow')}</span></button>
    </nav>

    <main id="workspace-main" className="workspace-content" tabIndex={-1}>
      <header className="workspace-content-header">
        <div><h1>{t(navigation.find((item) => item.id === activeSection)!.label)}</h1><p>{t('workspace.targetContext', { target: targetLabel })}</p></div>
        {activeSection === 'sources' && <div><button className="secondary-action" onClick={() => addNode('manual-proxy')}><Plus size={15} />{t('workspace.pasteLinks')}</button><button className="primary-action" onClick={() => addNode('subscription')}><Plus size={15} />{t('workspace.addSubscription')}</button></div>}
        {activeSection === 'processing' && <button className="primary-action" onClick={() => addNode('filter')}><Plus size={15} />{t('workspace.addProcessing')}</button>}
        {activeSection === 'strategies' && <button className="primary-action" onClick={() => addNode('manual-select')}><Plus size={15} />{t('workspace.addStrategy')}</button>}
        {activeSection === 'routing' && <button className="primary-action" onClick={() => addNode('service-rule')}><Plus size={15} />{t('workspace.addRouting')}</button>}
        {activeSection === 'export' && <button className="primary-action" onClick={() => setPreviewOpen(true)}><Download size={15} />{t('top.exportConfig')}</button>}
      </header>

      <section className="workspace-section-body">
        {activeSection === 'sources' && <SourceList items={projection.sources} runtimes={runtimes} onRefresh={refreshSubscription} onEdit={editInFlow} />}
        {activeSection === 'proxies' && <ProxyList proxies={projection.proxies} />}
        {activeSection === 'processing' && <NodeList items={projection.processing} empty={t('workspace.empty.processing')} onEdit={editInFlow} />}
        {activeSection === 'strategies' && <NodeList items={[...projection.strategies, ...projection.chains]} empty={t('workspace.empty.strategies')} onEdit={editInFlow} />}
        {activeSection === 'routing' && <RoutingList items={projection.routing} finals={projection.finalRoutes} onMove={moveRule} onEdit={editInFlow} />}
        {activeSection === 'dns' && <NodeList items={projection.dns} empty={t('workspace.empty.dns')} onEdit={editInFlow} />}
        {activeSection === 'inspect' && <div className="workspace-issue-list">{projection.compileIssues.length === 0
          ? <EmptyState icon={<ShieldCheck size={22} />} title={t('workspace.inspectReady')} />
          : projection.compileIssues.map((issue, index) => <article key={`${issue.code}-${issue.nodeId ?? index}`}><CircleAlert size={17} /><span><strong>{issue.code}</strong><small>{localizeDiagnosticMessage(issue.code, issue.message, locale)}</small></span>{issue.nodeId && <button onClick={() => { selectNode(issue.nodeId!); onViewChange('visual-flow') }}>{t('workspace.open')}</button>}</article>)}</div>}
        {activeSection === 'export' && <ExportSummary primaryTarget={primaryTarget} issueCount={projection.compileIssues.filter((issue) => issue.severity === 'error').length} onPreview={() => setPreviewOpen(true)} />}
      </section>
    </main>
  </div>
}

function SourceList({ items, runtimes, onRefresh, onEdit }: {
  items: WorkspaceNodeItem[]
  runtimes: ReturnType<typeof useBuilderStore.getState>['subscriptionRuntimes']
  onRefresh: (id: string) => Promise<void>
  onEdit: (item: WorkspaceNodeItem) => void
}) {
  const { t } = useI18n()
  if (!items.length) return <EmptyState icon={<Radio size={22} />} title={t('workspace.empty.sources')} />
  return <div className="workspace-row-list">{items.map((item) => {
    const runtime = runtimes[item.node.id]
    return <article className="workspace-node-row" key={item.node.id}>
      <BlockIcon name={item.node.data.icon} size={18} />
      <span><strong>{item.node.data.title}</strong><small>{runtime?.refreshStatus ? t(sourceStatusMessages[runtime.refreshStatus]) : item.node.data.subtitle}</small></span>
      <b>{item.node.data.nodeCount ?? runtime?.activeSnapshot?.result.detectedCount ?? 0}</b>
      {item.node.data.subscriptionInputKind === 'url' && <button className="icon-button" aria-label={t('inspector.refresh')} onClick={() => void onRefresh(item.node.id)}><RefreshCw size={15} /></button>}
      <button className="row-action" onClick={() => onEdit(item)}>{t('workspace.open')}</button>
    </article>
  })}</div>
}

function ProxyList({ proxies }: { proxies: ReturnType<typeof createWorkspaceProjection>['proxies'] }) {
  const { t } = useI18n()
  if (!proxies.length) return <EmptyState icon={<Boxes size={22} />} title={t('workspace.empty.proxies')} />
  return <div className="workspace-proxy-table" role="table">
    <div role="row" className="is-heading"><span>{t('workspace.name')}</span><span>{t('workspace.protocol')}</span><span>{t('workspace.region')}</span><span>{t('workspace.source')}</span><span>{t('workspace.compatibility')}</span></div>
    {proxies.map((proxy) => <div role="row" key={`${proxy.sourceId}:${proxy.id}`}><strong>{proxy.name}</strong><code>{proxy.protocol}</code><span>{proxy.region}</span><span>{proxy.sourceName}</span><b className={`is-${proxy.compatibility}`}>{t(compatibilityMessages[proxy.compatibility])}</b></div>)}
  </div>
}

function NodeList({ items, empty, onEdit }: { items: WorkspaceNodeItem[]; empty: string; onEdit: (item: WorkspaceNodeItem) => void }) {
  if (!items.length) return <EmptyState icon={<Settings2 size={22} />} title={empty} />
  return <div className="workspace-row-list">{items.map((item) => <article className="workspace-node-row" key={item.node.id}>
    <BlockIcon name={item.node.data.icon} size={18} /><span><strong>{item.node.data.title}</strong><small>{item.node.data.subtitle}</small></span><ConnectionCount item={item} /><OpenButton onClick={() => onEdit(item)} />
  </article>)}</div>
}

function RoutingList({ items, finals, onMove, onEdit }: {
  items: ReturnType<typeof createWorkspaceProjection>['routing']
  finals: WorkspaceNodeItem[]
  onMove: (id: string, direction: 'up' | 'down') => void
  onEdit: (item: WorkspaceNodeItem) => void
}) {
  const { t } = useI18n()
  if (!items.length && !finals.length) return <EmptyState icon={<Route size={22} />} title={t('workspace.empty.routing')} />
  return <div className="workspace-row-list">{items.map((item, index) => <article className="workspace-node-row routing-workspace-row" key={item.node.id}>
    <b>{index + 1}</b><span><strong>{item.node.data.title}</strong><small>{item.node.data.targetLabel ?? t('workspace.targetMissing')}</small></span>
    <div className="routing-order-actions"><button className="icon-button" disabled={index === 0} aria-label={t('workspace.moveUp')} onClick={() => onMove(item.node.id, 'up')}><ArrowUp size={14} /></button><button className="icon-button" disabled={index === items.length - 1} aria-label={t('workspace.moveDown')} onClick={() => onMove(item.node.id, 'down')}><ArrowDown size={14} /></button></div>
    <OpenButton onClick={() => onEdit(item)} />
  </article>)}{finals.map((item) => <article className="workspace-node-row routing-workspace-row is-final" key={item.node.id}><b>F</b><span><strong>{item.node.data.title}</strong><small>{item.node.data.targetLabel ?? t('workspace.targetMissing')}</small></span><i>{t('workspace.final')}</i><OpenButton onClick={() => onEdit(item)} /></article>)}</div>
}

function ExportSummary({ primaryTarget, issueCount, onPreview }: { primaryTarget: ReturnType<typeof useBuilderStore.getState>['primaryTarget']; issueCount: number; onPreview: () => void }) {
  const { t } = useI18n()
  return <div className="workspace-export-summary"><ShieldCheck size={24} /><div><span>{t('workspace.primaryTarget')}</span><h2>{primaryTarget ? getTargetCapabilities(primaryTarget).label : t('workspace.targetRequired')}</h2><p className={issueCount ? 'is-blocked' : 'is-ready'}>{issueCount ? t('workspace.exportBlocked', { count: issueCount }) : t('workspace.exportReady')}</p></div><button className="secondary-action" onClick={onPreview}>{t('top.preview')}</button></div>
}

function EmptyState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="workspace-empty-state">{icon}<strong>{title}</strong></div>
}

function ConnectionCount({ item }: { item: WorkspaceNodeItem }) {
  const { t } = useI18n()
  return <b>{t('workspace.connections', { count: item.incoming.length + item.outgoing.length })}</b>
}

function OpenButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()
  return <button className="row-action" onClick={onClick}>{t('workspace.open')}</button>
}
