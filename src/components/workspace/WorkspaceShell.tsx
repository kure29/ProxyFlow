import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes, ChevronDown, FileOutput, GitBranch, Globe2, Home, ListFilter, Plus,
  Radio, RefreshCw, Route, SearchCheck, ShieldCheck,
} from 'lucide-react'
import {
  createWorkspaceProjection, orderWorkspaceProcessingNodes, processingMoveAvailability,
  summarizeWorkspaceSource,
  type WorkspaceNodeItem, type WorkspaceSectionId,
} from '../../core/workspace'
import { deriveProjectRuntime } from '../../core/proxySet'
import { getTargetCapabilities, resolveActiveProductTarget, type PrimaryTarget } from '../../core/capabilities'
import { localizeNodeTitle, localizeProjectName, localizeSubscriptionSnapshots, useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { BlockNodeData, BlockType } from '../../types/project'
import type { ProductView, WorkspaceNavigationState } from './types'
import { WorkspaceNodeEditor } from './WorkspaceNodeEditor'
import { useProjectCompiles } from '../compiler/useProjectCompiles'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'
import { mergeProjectHealthDiagnostics, summarizeDiagnosticCounts } from '../compiler/diagnosticPresentation'
import { stateForTarget, TargetSwitchDialog, WorkspaceExportPanel } from './WorkspaceTargets'
import {
  processingCreationOptions, strategyCreationOptions,
} from './workspaceCreation'
import { WorkspaceAddMenu } from './WorkspaceAddMenu'
import { RoutingWorkspace, type RoutingWorkspaceCopy } from './RoutingWorkspace'
import { DnsWorkspace, type DnsWorkspaceCopy } from './DnsWorkspace'
import { MobileWorkspaceNavigation } from './MobileWorkspaceNavigation'
import { ProjectOverview } from './ProjectOverview'
import {
  ProcessingWorkspace, ProjectHealthWorkspace, ProxiesWorkspace, SourcesWorkspace,
  StrategiesWorkspace,
} from './WorkspacePages'
import type { ProjectListItem } from '../../storage/projectStorage'
import { shouldDismissWorkspaceEditor } from './workspaceEditorLifecycle'

interface WorkspaceShellProps extends WorkspaceNavigationState {
  onViewChange: (view: ProductView) => void
  primaryHealth: PrimaryTargetHealth
  lastNodeSection: WorkspaceSectionId
  projects: ProjectListItem[]
  onNewProject: () => void
  onSwitchProject: (projectId: string) => Promise<void>
  onRenameProject: (projectId: string, name: string) => Promise<boolean>
  onDeleteProject: (projectId: string) => Promise<void>
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

export function WorkspaceShell({
  activeSection, onSectionChange, onViewChange, primaryHealth, lastNodeSection, projects,
  onNewProject, onSwitchProject, onRenameProject, onDeleteProject,
}: WorkspaceShellProps) {
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
  const previousSectionRef = useRef(activeSection)
  const [targetDialogOpen, setTargetDialogOpen] = useState(false)
  const targetCompiles = useProjectCompiles(activeSection === 'export' || activeSection === 'inspect' || targetDialogOpen)
  const activeProductTarget = resolveActiveProductTarget(primaryTarget)

  const project = useMemo(() => toProject(), [edges, nodes, primaryTarget, projectId, projectName, toProject])
  const sourceAvailability = useMemo(() => Object.fromEntries(nodes
    .filter((node) => node.data.category === 'source')
    .map((node) => [node.id, summarizeWorkspaceSource(node, runtimes[node.id]).status])), [nodes, runtimes])
  const projection = useMemo(
    () => createWorkspaceProjection(project, { subscriptionSnapshots: snapshots, sourceAvailability, validationTarget: activeProductTarget }),
    [activeProductTarget, project, snapshots, sourceAvailability],
  )
  const pipelineRuntime = useMemo(
    () => deriveProjectRuntime(project, localizeSubscriptionSnapshots(snapshots, locale)),
    [locale, project, snapshots],
  )
  const orderedProcessing = useMemo(() => {
    const itemById = new Map(projection.processing.map((item) => [item.node.id, item]))
    return orderWorkspaceProcessingNodes(nodes, edges).map((node) => itemById.get(node.id)!).filter(Boolean)
  }, [edges, nodes, projection.processing])
  const compatibilityDiagnostics = useMemo(
    () => stateForTarget(targetCompiles, activeProductTarget).result?.issues ?? [],
    [activeProductTarget, targetCompiles],
  )
  const inspectDiagnostics = useMemo(() => mergeProjectHealthDiagnostics(
    projection.compileIssues,
    primaryHealth.diagnostics,
    compatibilityDiagnostics,
  ), [compatibilityDiagnostics, primaryHealth.diagnostics, projection.compileIssues])
  const diagnosticCounts = summarizeDiagnosticCounts(primaryHealth.diagnostics)
  const counts: Record<WorkspaceSectionId, number | undefined> = {
    overview: undefined,
    sources: projection.sources.length,
    proxies: projection.proxies.length,
    processing: projection.processing.length,
    strategies: projection.strategies.length + projection.chains.length,
    routing: projection.routing.length + projection.finalRoutes.length,
    dns: projection.dns.length,
    inspect: diagnosticCounts.badgeCount,
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
  const showInFlow = (item: WorkspaceNodeItem) => {
    setEditorOpen(false)
    selectNode(item.node.id)
    onViewChange('visual-flow')
  }
  const addNode = (type: BlockType, data?: Partial<BlockNodeData>, openEditor = true) => {
    const index = nodes.filter((node) => node.data.blockType === type).length
    const id = addLibraryNode(type, { x: 80 + index * 36, y: 90 + index * 42 }, data)
    if (id && openEditor) setEditorOpen(true)
  }
  const closeEditor = useCallback(() => { setEditorOpen(false); selectNode(null) }, [selectNode])

  useEffect(() => {
    if (shouldDismissWorkspaceEditor(previousSectionRef.current, activeSection)) {
      setEditorOpen(false)
      selectNode(null)
    }
    previousSectionRef.current = activeSection
  }, [activeSection, selectNode])
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
        lastNodeSection={lastNodeSection}
        items={navigation.map(({ id, icon, label }) => ({ id, icon, label: t(label), count: counts[id] }))}
        labels={{
          title: t('workspace.mobileNavigation.title'),
          home: t('workspace.mobileNavigation.home'),
          nodes: t('workspace.mobileNavigation.nodes'),
          strategies: t('workspace.mobileNavigation.strategies'),
          routing: t('workspace.mobileNavigation.routing'),
          more: t('workspace.mobileNavigation.more'),
        }}
        onSectionChange={onSectionChange}
      />
    </nav>

    <main id="workspace-main" className="workspace-content" tabIndex={-1}>
      <header className="workspace-content-header">
        <div><h1>{t(activeNavigation.label)}</h1><p>{t(activeNavigation.description)}</p><button type="button" className="workspace-target-context" onClick={() => setTargetDialogOpen(true)}>{t('workspace.targetContext', { target: targetLabel })}<ChevronDown size={12} /></button></div>
        {activeSection === 'sources' && <div><button className="secondary-action" disabled={refreshableCount === 0 || refreshingCount > 0} onClick={() => void refreshAllSubscriptions()}><RefreshCw className={refreshingCount > 0 ? 'spin' : ''} size={15} />{t('workspace.refreshAll')}</button><button className="secondary-action" onClick={() => addNode('manual-proxy')}><Plus size={15} />{t('workspace.pasteLinks')}</button><button className="primary-action" onClick={() => addNode('subscription')}><Plus size={15} />{t('workspace.addSubscription')}</button></div>}
        {activeSection === 'processing' && <WorkspaceAddMenu label={t('workspace.addProcessing')} options={processingCreationOptions} onCreate={addNode} />}
        {activeSection === 'strategies' && <WorkspaceAddMenu label={t('workspace.addStrategy')} options={strategyCreationOptions(activeProductTarget)} onCreate={addNode} />}
      </header>

      <section className="workspace-section-body" data-section={activeSection}>
        {activeSection === 'overview' && <ProjectOverview
          projectName={localizeProjectName(projectName, locale)}
          projectId={projectId}
          projects={projects}
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
            const option = strategyCreationOptions(activeProductTarget).find(({ disabled }) => !disabled)
            if (option) addNode(option.blockType, option.data)
            else setTargetDialogOpen(true)
          }}
          onNewProject={onNewProject}
          onSwitchProject={onSwitchProject}
          onRenameProject={onRenameProject}
          onDeleteProject={onDeleteProject}
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
          onShowFlow={showInFlow}
          onDuplicate={(item) => duplicateNode(item.node.id)}
          onDelete={(item) => removeNode(item.node.id)}
        />}
        {activeSection === 'strategies' && <StrategiesWorkspace
          items={[...projection.strategies, ...projection.chains]}
          target={activeProductTarget}
          runtime={pipelineRuntime}
          issues={projection.compileIssues}
          onEdit={editInWorkspace}
          onShowFlow={showInFlow}
          onDuplicate={(item) => duplicateNode(item.node.id)}
          onDelete={(item) => removeNode(item.node.id)}
        />}
        {activeSection === 'routing' && <RoutingWorkspace
          items={projection.routing}
          finals={projection.finalRoutes}
          services={project.services}
          issues={projection.compileIssues}
          capabilities={getTargetCapabilities(activeProductTarget).routingMatchers}
          copy={routingWorkspaceCopy(t, activeProductTarget)}
          onCreate={addNode}
          onMove={moveRule}
          onMoveToIndex={moveRuleToIndex}
          onEdit={editInWorkspace}
          onShowFlow={showInFlow}
          onDuplicate={(item) => duplicateNode(item.node.id)}
          onDelete={(item) => removeNode(item.node.id)}
          getNodeTitle={(node) => localizeNodeTitle(node, locale)}
          getTargetSummary={(node, fallback) => node.data.targetKind === 'strategy' && node.data.targetId
            ? localizeNodeTitle(nodes.find((candidate) => candidate.id === node.data.targetId) ?? node, locale)
            : fallback}
        />}
        {activeSection === 'dns' && <DnsWorkspace
          node={projection.dns[0] ? { id: projection.dns[0].node.id, resolver: projection.dns[0].node.data.resolver, dnsResolvers: projection.dns[0].node.data.dnsResolvers } : undefined}
          target={activeProductTarget}
          copy={dnsWorkspaceCopy(t)}
          onCreateDns={() => addNode('dns', undefined, false)}
          onChange={(resolvers) => projection.dns[0] && updateNodeData(projection.dns[0].node.id, { dnsResolvers: resolvers, resolver: undefined })}
        />}
        {activeSection === 'inspect' && <ProjectHealthWorkspace
          nodes={nodes}
          diagnostics={inspectDiagnostics}
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
