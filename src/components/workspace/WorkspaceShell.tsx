import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Boxes, CheckCircle2, ChevronDown, CircleAlert, FileOutput, GitBranch, Globe2, Home, ListFilter, Plus,
  Radio, RefreshCw, Route, SearchCheck, ShieldCheck,
} from 'lucide-react'
import {
  createWorkspaceProjection, orderWorkspaceProcessingNodes, processingMoveAvailability,
  summarizeWorkspaceSource,
  type WorkspaceNodeItem, type WorkspaceSectionId,
} from '../../core/workspace'
import { deriveProjectRuntime } from '../../core/proxySet'
import { getTargetCapabilities, type PrimaryTarget } from '../../core/capabilities'
import { blockDescriptionKey, blockTitleKey, localizeNodeTitle, localizeProjectName, localizeSubscriptionSnapshots, useI18n } from '../../i18n'
import type { MessageKey } from '../../i18n'
import { blockByType } from '../../data/blockLibrary'
import { useBuilderStore } from '../../store/useBuilderStore'
import { BlockIcon } from '../icons/BlockIcon'
import type { BlockNodeData, BlockType } from '../../types/project'
import type { ProductView, WorkspaceNavigationState } from './types'
import { WorkspaceNodeEditor } from './WorkspaceNodeEditor'
import { useProjectCompiles } from '../compiler/useProjectCompiles'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'
import { TargetSwitchDialog, WorkspaceExportPanel } from './WorkspaceTargets'
import {
  processingCreationOptions, strategyCreationOptions, type WorkspaceCreationOption,
} from './workspaceCreation'
import { RoutingWorkspace, type RoutingWorkspaceCopy } from './RoutingWorkspace'
import { DnsWorkspace, type DnsWorkspaceCopy } from './DnsWorkspace'
import { MobileWorkspaceNavigation } from './MobileWorkspaceNavigation'
import {
  ProcessingWorkspace, ProjectHealthWorkspace, ProxiesWorkspace, SourcesWorkspace,
  StrategiesWorkspace,
} from './WorkspacePages'

interface WorkspaceShellProps extends WorkspaceNavigationState {
  onViewChange: (view: ProductView) => void
  primaryHealth: PrimaryTargetHealth
}

const navigation = [
  { id: 'overview', icon: Home, label: 'workspace.overview', description: 'workspace.description.overview' },
  { id: 'sources', icon: Radio, label: 'workspace.sources', description: 'workspace.description.sources' },
  { id: 'proxies', icon: Boxes, label: 'workspace.proxies', description: 'workspace.description.proxies' },
  { id: 'processing', icon: ListFilter, label: 'workspace.processing', description: 'workspace.description.processing' },
  { id: 'strategies', icon: GitBranch, label: 'workspace.strategies', description: 'workspace.description.strategies' },
  { id: 'routing', icon: Route, label: 'workspace.routing', description: 'workspace.description.routing' },
  { id: 'dns', icon: Globe2, label: 'workspace.dnsAdvanced', description: 'workspace.description.dns' },
  { id: 'inspect', icon: SearchCheck, label: 'workspace.inspect', description: 'workspace.description.inspect' },
  { id: 'export', icon: FileOutput, label: 'workspace.export', description: 'workspace.description.export' },
] as const

const compatibilityMessages = {
  supported: 'workspace.compatibility.supported',
  partial: 'workspace.compatibility.partial',
  unsupported: 'workspace.compatibility.unsupported',
  'target-native': 'workspace.compatibility.targetNative',
  unknown: 'workspace.compatibility.unknown',
} as const satisfies Record<string, MessageKey>

export function WorkspaceShell({ activeSection, onSectionChange, onViewChange, primaryHealth }: WorkspaceShellProps) {
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
  const removeNode = useBuilderStore((state) => state.removeNode)
  const duplicateNode = useBuilderStore((state) => state.duplicateNode)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const refreshSubscription = useBuilderStore((state) => state.refreshSubscription)
  const moveProcessingStep = useBuilderStore((state) => state.moveProcessingStep)
  const moveRule = useBuilderStore((state) => state.moveRoutingRule)
  const moveRuleToIndex = useBuilderStore((state) => state.moveRoutingRuleToIndex)
  const updateNodeData = useBuilderStore((state) => state.updateNodeData)
  const setPreviewOpen = useBuilderStore((state) => state.setPreviewOpen)
  const setPrimaryTarget = useBuilderStore((state) => state.setPrimaryTarget)
  const refreshAllSubscriptions = useBuilderStore((state) => state.refreshAllSubscriptions)
  const refreshableCount = useBuilderStore((state) => state.nodes.filter((node) => node.data.blockType === 'subscription' && node.data.enabled !== false && node.data.subscriptionInputKind === 'url' && Boolean(node.data.subscriptionUrl?.trim())).length)
  const refreshingCount = useBuilderStore((state) => Object.values(state.subscriptionRuntimes).filter((runtime) => runtime.refreshStatus === 'loading').length)
  const [editorOpen, setEditorOpen] = useState(false)
  const [targetDialogOpen, setTargetDialogOpen] = useState(false)
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const targetCompiles = useProjectCompiles(activeSection === 'export' || activeSection === 'inspect' || targetDialogOpen)

  const project = useMemo(() => toProject(), [edges, nodes, primaryTarget, projectId, projectName, toProject])
  const sourceAvailability = useMemo(() => Object.fromEntries(nodes
    .filter((node) => node.data.category === 'source')
    .map((node) => [node.id, summarizeWorkspaceSource(node, runtimes[node.id]).status])), [nodes, runtimes])
  const projection = useMemo(
    () => createWorkspaceProjection(project, { subscriptionSnapshots: snapshots, sourceAvailability }),
    [project, snapshots, sourceAvailability],
  )
  const pipelineRuntime = useMemo(
    () => deriveProjectRuntime(project, localizeSubscriptionSnapshots(snapshots, locale)),
    [locale, project, snapshots],
  )
  const orderedProcessing = useMemo(() => {
    const itemById = new Map(projection.processing.map((item) => [item.node.id, item]))
    return orderWorkspaceProcessingNodes(nodes, edges).map((node) => itemById.get(node.id)!).filter(Boolean)
  }, [edges, nodes, projection.processing])
  const compatibilityDiagnostics = useMemo(() => [
    ...(targetCompiles.mihomoState.result?.issues ?? []),
    ...(targetCompiles.singBoxState.result?.issues ?? []),
  ], [targetCompiles.mihomoState.result, targetCompiles.singBoxState.result])
  const counts: Record<WorkspaceSectionId, number | undefined> = {
    overview: undefined,
    sources: projection.sources.length,
    proxies: projection.proxies.length,
    processing: projection.processing.length,
    strategies: projection.strategies.length + projection.chains.length,
    routing: projection.routing.length + projection.finalRoutes.length,
    dns: projection.dns.length,
    inspect: primaryHealth.diagnostics.length,
    export: projection.outputs.length,
  }
  const targetLabel = primaryTarget ? getTargetCapabilities(primaryTarget).label : t('workspace.targetRequired')
  const activeNavigation = navigation.find((item) => item.id === activeSection)!

  const editInWorkspace = (item: WorkspaceNodeItem) => {
    selectNode(item.node.id)
    setEditorOpen(true)
  }
  const openNodeInWorkspace = (nodeId: string) => {
    selectNode(nodeId)
    setEditorOpen(true)
  }
  const addNode = (type: BlockType, data?: Partial<BlockNodeData>, openEditor = true) => {
    const index = nodes.filter((node) => node.data.blockType === type).length
    const id = addLibraryNode(type, { x: 80 + index * 36, y: 90 + index * 42 }, data)
    if (id && openEditor) setEditorOpen(true)
  }
  const closeEditor = useCallback(() => { setEditorOpen(false); selectNode(null) }, [selectNode])
  const showEditorInFlow = useCallback(() => { setEditorOpen(false); onViewChange('visual-flow') }, [onViewChange])
  const openSectionFromEditor = useCallback((section: WorkspaceSectionId) => {
    closeEditor()
    onSectionChange(section)
  }, [closeEditor, onSectionChange])
  const closeTargetDialog = useCallback(() => setTargetDialogOpen(false), [])
  const selectTarget = useCallback((target: NonNullable<typeof primaryTarget>) => {
    setPrimaryTarget(target)
    setTargetDialogOpen(false)
  }, [setPrimaryTarget])

  return <div className="structured-workspace">
    <nav className="workspace-navigation" aria-label={t('workspace.navigation')}>
      <button type="button" className="workspace-target-summary" onClick={() => setTargetDialogOpen(true)}><ShieldCheck size={17} /><span><small>{t('workspace.primaryTarget')}</small><strong>{targetLabel}</strong></span><ChevronDown size={14} /></button>
      <div className="workspace-navigation-items">
        {navigation.map(({ id, icon: Icon, label }) => <button type="button" className={activeSection === id ? 'is-active' : ''} key={id} onClick={() => onSectionChange(id)} aria-current={activeSection === id ? 'page' : undefined}>
          <Icon size={17} /><span>{t(label)}</span>{counts[id] !== undefined && <small>{counts[id]}</small>}
        </button>)}
      </div>
      <MobileWorkspaceNavigation
        activeSection={activeSection}
        items={navigation.map(({ id, icon, label }) => ({ id, icon, label: t(label), count: counts[id] }))}
        open={mobileNavigationOpen}
        openLabel={t('workspace.mobileNavigation.open')}
        closeLabel={t('workspace.mobileNavigation.close')}
        title={t('workspace.mobileNavigation.title')}
        inputLabel={t('workspace.mobileNavigation.sourcesProxies')}
        moreLabel={t('workspace.mobileNavigation.more')}
        onOpenChange={setMobileNavigationOpen}
        onSectionChange={onSectionChange}
      />
    </nav>

    <main id="workspace-main" className="workspace-content" tabIndex={-1}>
      <header className="workspace-content-header">
        <div><h1>{t(activeNavigation.label)}</h1><p>{t(activeNavigation.description)}</p><button type="button" className="workspace-target-context" onClick={() => setTargetDialogOpen(true)}>{t('workspace.targetContext', { target: targetLabel })}<ChevronDown size={12} /></button></div>
        {activeSection === 'sources' && <div><button className="secondary-action" disabled={refreshableCount === 0 || refreshingCount > 0} onClick={() => void refreshAllSubscriptions()}><RefreshCw className={refreshingCount > 0 ? 'spin' : ''} size={15} />{t('workspace.refreshAll')}</button><button className="secondary-action" onClick={() => addNode('manual-proxy')}><Plus size={15} />{t('workspace.pasteLinks')}</button><button className="primary-action" onClick={() => addNode('subscription')}><Plus size={15} />{t('workspace.addSubscription')}</button></div>}
        {activeSection === 'processing' && <WorkspaceAddMenu label={t('workspace.addProcessing')} options={processingCreationOptions} onCreate={addNode} />}
        {activeSection === 'strategies' && <WorkspaceAddMenu label={t('workspace.addStrategy')} options={strategyCreationOptions(primaryTarget)} onCreate={addNode} />}
      </header>

      <section className="workspace-section-body" data-section={activeSection}>
        {activeSection === 'overview' && <ProjectOverview
          projectName={localizeProjectName(projectName, locale)}
          targetLabel={targetLabel}
          canExport={primaryHealth.status === 'ready'}
          health={primaryHealth}
          proxyCount={projection.proxies.length}
          strategyCount={projection.strategies.length + projection.chains.length}
          routingCount={projection.routing.length}
          dnsEnabled={projection.dns.some(({ node }) => node.data.disabled !== true)}
          onOpenSection={onSectionChange}
          onAddSubscription={() => addNode('subscription')}
          onAddStrategy={() => {
            const option = strategyCreationOptions(primaryTarget).find(({ disabled }) => !disabled)
            if (option) addNode(option.blockType, option.data)
            else setTargetDialogOpen(true)
          }}
        />}
        {activeSection === 'sources' && <SourcesWorkspace
          items={projection.sources}
          runtimes={runtimes}
          onRefresh={refreshSubscription}
          onEdit={editInWorkspace}
          onToggle={(item, disabled) => updateNodeData(item.node.id, { disabled, enabled: !disabled })}
          onDelete={(item) => removeNode(item.node.id)}
        />}
        {activeSection === 'proxies' && <ProxiesWorkspace proxies={projection.proxies} />}
        {activeSection === 'processing' && <ProcessingWorkspace
          items={orderedProcessing}
          runtime={pipelineRuntime}
          issues={projection.compileIssues}
          availability={(nodeId) => processingMoveAvailability(nodes, edges, nodeId)}
          onMove={(nodeId, direction) => { moveProcessingStep(nodeId, direction) }}
          onToggle={(item, disabled) => updateNodeData(item.node.id, { disabled })}
          onEdit={editInWorkspace}
        />}
        {activeSection === 'strategies' && <StrategiesWorkspace
          items={[...projection.strategies, ...projection.chains]}
          target={primaryTarget}
          runtime={pipelineRuntime}
          issues={projection.compileIssues}
          onEdit={editInWorkspace}
        />}
        {activeSection === 'routing' && <RoutingWorkspace
          items={projection.routing}
          finals={projection.finalRoutes}
          services={project.services}
          issues={projection.compileIssues}
          capabilities={primaryTarget ? getTargetCapabilities(primaryTarget).routingMatchers : {}}
          copy={routingWorkspaceCopy(t, primaryTarget)}
          onCreate={addNode}
          onMove={moveRule}
          onMoveToIndex={moveRuleToIndex}
          onEdit={editInWorkspace}
          onDuplicate={(item) => duplicateNode(item.node.id)}
          onDelete={(item) => removeNode(item.node.id)}
          getNodeTitle={(node) => localizeNodeTitle(node, locale)}
          getTargetSummary={(node, fallback) => node.data.targetKind === 'strategy' && node.data.targetId
            ? localizeNodeTitle(nodes.find((candidate) => candidate.id === node.data.targetId) ?? node, locale)
            : fallback}
        />}
        {activeSection === 'dns' && <DnsWorkspace
          node={projection.dns[0] ? { id: projection.dns[0].node.id, resolver: projection.dns[0].node.data.resolver, dnsResolvers: projection.dns[0].node.data.dnsResolvers } : undefined}
          target={primaryTarget}
          copy={dnsWorkspaceCopy(t)}
          onCreateDns={() => addNode('dns', undefined, false)}
          onChange={(resolvers) => projection.dns[0] && updateNodeData(projection.dns[0].node.id, { dnsResolvers: resolvers, resolver: undefined })}
        />}
        {activeSection === 'inspect' && <ProjectHealthWorkspace
          nodes={nodes}
          diagnostics={projection.compileIssues}
          compatibilityDiagnostics={compatibilityDiagnostics}
          onOpenNode={openNodeInWorkspace}
        />}
        {activeSection === 'export' && <WorkspaceExportPanel
          primaryTarget={primaryTarget}
          compiles={targetCompiles}
          onSelectTarget={setPrimaryTarget}
          onPreview={(target) => setPreviewOpen(true, target)}
        />}
      </section>
    </main>
    <WorkspaceNodeEditor open={editorOpen} onClose={closeEditor} onShowFlow={showEditorInFlow} onOpenWorkspaceSection={openSectionFromEditor} />
    <TargetSwitchDialog open={targetDialogOpen} current={primaryTarget} compiles={targetCompiles} onClose={closeTargetDialog} onSelect={selectTarget} />
  </div>
}

interface ProjectOverviewProps {
  projectName: string
  targetLabel: string
  canExport: boolean
  health: PrimaryTargetHealth
  proxyCount: number
  strategyCount: number
  routingCount: number
  dnsEnabled: boolean
  onOpenSection: (section: WorkspaceSectionId) => void
  onAddSubscription: () => void
  onAddStrategy: () => void
}

function ProjectOverview({
  projectName, targetLabel, canExport, health, proxyCount, strategyCount, routingCount, dnsEnabled,
  onOpenSection, onAddSubscription, onAddStrategy,
}: ProjectOverviewProps) {
  const { t } = useI18n()
  const errorCount = health.diagnostics.filter(({ severity }) => severity === 'error').length
  const warningCount = health.diagnostics.filter(({ severity }) => severity === 'warning').length
  const facts = [
    { label: t('workspace.overview.target'), value: targetLabel },
    { label: t('workspace.overview.exportable'), value: canExport ? t('workspace.overview.yes') : t('workspace.overview.no'), status: canExport ? 'ready' : 'blocked' },
    { label: t('workspace.overview.nodes'), value: String(proxyCount) },
    { label: t('workspace.overview.strategies'), value: String(strategyCount) },
    { label: t('workspace.overview.routing'), value: String(routingCount) },
    { label: t('workspace.overview.dns'), value: dnsEnabled ? t('workspace.overview.enabled') : t('workspace.overview.disabled') },
  ]

  return <div className="project-overview">
    <section className="project-overview-summary" aria-labelledby="project-overview-name">
      <div>
        <span>{t('workspace.overview.project')}</span>
        <h2 id="project-overview-name">{projectName}</h2>
      </div>
      <div className="project-overview-health" data-ready={errorCount === 0 || undefined}>
        {errorCount === 0 ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}
        <span><strong>{errorCount === 0 ? t('workspace.overview.clear') : t('workspace.overview.needsAttention')}</strong><small>{t('workspace.overview.issueSummary', { errors: errorCount, warnings: warningCount })}</small></span>
      </div>
    </section>
    <dl className="project-overview-facts">
      {facts.map(({ label, value, status }) => <div key={label} data-status={status}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div><dt>{t('workspace.overview.errors')}</dt><dd><button type="button" onClick={() => onOpenSection('inspect')}>{errorCount}</button></dd></div>
      <div><dt>{t('workspace.overview.warnings')}</dt><dd><button type="button" onClick={() => onOpenSection('inspect')}>{warningCount}</button></dd></div>
    </dl>
    <section className="project-overview-shortcuts" aria-labelledby="project-overview-shortcuts">
      <h3 id="project-overview-shortcuts">{t('workspace.overview.shortcuts')}</h3>
      <div>
        <button type="button" className="secondary-action" onClick={() => onOpenSection('inspect')}><SearchCheck size={16} />{t('workspace.inspect')}</button>
        <button type="button" className="primary-action" onClick={() => onOpenSection('export')}><FileOutput size={16} />{t('workspace.export')}</button>
        <button type="button" className="secondary-action" onClick={onAddSubscription}><Plus size={16} />{t('workspace.addSubscription')}</button>
        <button type="button" className="secondary-action" onClick={onAddStrategy}><Plus size={16} />{t('workspace.addStrategy')}</button>
      </div>
    </section>
  </div>
}

function WorkspaceAddMenu({ label, options, onCreate }: { label: string; options: WorkspaceCreationOption[]; onCreate: (type: BlockType, data?: Partial<BlockNodeData>) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const focusFrame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus())
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  const navigateMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
    if (!items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowUp' ? (current <= 0 ? items.length - 1 : current - 1)
          : (current + 1) % items.length
    items[next]?.focus()
  }
  const closeMenu = () => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }
  return <div className="workspace-add-menu" ref={rootRef} onBlur={(event) => {
    if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
  }}>
    <button ref={triggerRef} type="button" className="primary-action" aria-haspopup="menu" aria-controls={open ? 'workspace-add-options' : undefined} aria-expanded={open} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true) }
    }} onClick={() => open ? closeMenu() : setOpen(true)}><Plus size={15} />{label}<ChevronDown size={14} /></button>
    {open && <div ref={menuRef} id="workspace-add-options" className="workspace-add-options" role="menu" onKeyDown={navigateMenu}>{options.map((option) => {
      const item = blockByType.get(option.blockType)
      const optionLabel = option.id === 'service' ? t('inspector.matcher.service') : option.id === 'domain' ? t('inspector.matcher.domainSuffix') : option.id === 'cidr' ? t('inspector.matcher.ipCidr') : option.id === 'port' ? t('inspector.matcher.port') : t(blockTitleKey(option.blockType))
      const status = option.status ? t(compatibilityMessages[option.status]) : option.advanced ? t('workspace.advanced') : t(blockDescriptionKey(option.blockType))
      return <button type="button" role="menuitem" disabled={option.disabled} key={option.id} onClick={() => { onCreate(option.blockType, option.data); closeMenu() }}>
        <BlockIcon name={item?.icon ?? 'plus'} size={17} /><span><strong>{optionLabel}</strong><small>{status}</small></span>{option.advanced && <i>{t('workspace.advanced')}</i>}
      </button>
    })}</div>}
  </div>
}

function routingWorkspaceCopy(t: ReturnType<typeof useI18n>['t'], target: PrimaryTarget | null): RoutingWorkspaceCopy {
  return {
    rulesLabel: t('workspace.routing.rulesLabel'), addRule: t('workspace.addRouting'),
    chooseRuleKind: t('workspace.routing.chooseRuleKind'), serviceRule: t('workspace.routing.serviceRule'), serviceRuleDescription: t('workspace.routing.serviceRuleDescription'),
    customRule: t('workspace.routing.customRule'), customRuleDescription: t('workspace.routing.customRuleDescription'), chooseService: t('workspace.routing.chooseService'),
    searchServices: t('workspace.routing.searchServices'), noServices: t('workspace.routing.noServices'), chooseMatcher: t('workspace.routing.chooseMatcher'),
    back: t('workspace.routing.back'), close: t('workspace.routing.close'), serviceMatcher: t('workspace.routing.serviceMatcher'), customMatcher: t('workspace.routing.customMatcher'),
    finalRoute: t('workspace.routing.finalRoute'), target: t('workspace.routing.target'), moveUp: t('workspace.moveUp'), moveDown: t('workspace.moveDown'),
    dragRule: t('workspace.routing.drag'), more: t('workspace.routing.more'),
    edit: t('workspace.edit'), duplicate: t('canvas.copyNode'), delete: t('workspace.delete'), cancel: t('workspace.cancel'),
    unsupportedByTarget: t('workspace.routing.unsupportedByTarget', { target: target ? getTargetCapabilities(target).label : t('workspace.targetRequired') }),
    statusLabels: { ready: t('workspace.routing.status.ready'), warning: t('workspace.routing.status.warning'), error: t('workspace.routing.status.error'), disabled: t('workspace.routing.status.disabled') },
    capabilityLabels: { supported: t('workspace.compatibility.supported'), partial: t('workspace.compatibility.partial'), unsupported: t('workspace.compatibility.unsupported'), 'target-native': t('workspace.compatibility.targetNative') },
    presentation: {
      matcherLabels: {
        service: t('inspector.matcher.service'), domain: t('inspector.matcher.domain'), 'domain-suffix': t('inspector.matcher.domainSuffix'),
        'domain-keyword': t('inspector.matcher.domainKeyword'), 'ip-cidr': t('inspector.matcher.ipCidr'), 'ip-cidr6': t('inspector.matcher.ipCidr6'),
        port: t('inspector.matcher.port'), asn: t('inspector.matcher.asn'), 'geo-ip': t('inspector.matcher.geoIp'), 'geo-site': t('inspector.matcher.geoSite'), 'rule-set': t('inspector.matcher.ruleSet'),
      },
      emptyMatcher: t('workspace.routing.emptyMatcher'), targetMissing: t('workspace.targetMissing'), ruleCount: (count) => t('workspace.routing.ruleCount', { count }),
    },
  }
}

function dnsWorkspaceCopy(t: ReturnType<typeof useI18n>['t']): DnsWorkspaceCopy {
  return {
    emptyTitle: t('workspace.dns.emptyTitle'), emptyDescription: t('workspace.dns.emptyDescription'), addDns: t('workspace.addDns'), resolverDescription: t('workspace.dns.resolverDescription'),
    addResolver: t('workspace.dns.addResolver'), customResolver: t('workspace.dns.customResolver'), name: t('workspace.name'), protocol: t('workspace.protocol'),
    endpoint: t('workspace.dns.endpoint'), role: t('workspace.dns.role'), enabled: t('workspace.dns.enabled'), remove: t('workspace.dns.remove'), unsupported: t('workspace.dns.unsupported'),
    roles: { default: t('workspace.dns.role.default'), direct: t('workspace.dns.role.direct'), fallback: t('workspace.dns.role.fallback') },
    regions: { system: t('workspace.dns.region.system'), global: t('workspace.dns.region.global'), 'mainland-china': t('workspace.dns.region.mainlandChina') },
  }
}
