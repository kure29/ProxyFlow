import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes, FileOutput, GitBranch, Globe2, Home, ListFilter, Plus,
  Radio, RefreshCw, Route, SearchCheck,
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
import type { WorkspaceNavigationState } from './types'
import { WorkspaceNodeEditor } from './WorkspaceNodeEditor'
import { useProjectCompiles } from '../compiler/useProjectCompiles'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'
import { mergeProjectHealthDiagnostics, summarizeDiagnosticCounts } from '../compiler/diagnosticPresentation'
import { stateForTarget, WorkspaceExportPanel } from './WorkspaceTargets'
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
import { productNodeTabs } from './productNavigationModel'
import type { ProjectListItem } from '../../storage/projectStorage'
import { shouldDismissWorkspaceEditor } from './workspaceEditorLifecycle'
import { isNodeSection, resolveNodeSection } from './mobileWorkspaceNavigationModel'

interface WorkspaceShellProps extends WorkspaceNavigationState {
  primaryHealth: PrimaryTargetHealth
  lastNodeSection: WorkspaceSectionId
  nodeEditorRequest?: { nodeId: string; requestId: number } | null
  onNodeEditorRequestHandled?: (requestId: number) => void
  projects: ProjectListItem[]
  onNewProject: () => void
  onSwitchProject: (projectId: string) => Promise<void>
  onRenameProject: (projectId: string, name: string) => Promise<boolean>
  onDeleteProject: (projectId: string) => Promise<void>
}

const navigation = [
  { id: 'overview', icon: Home, label: 'workspace.home', description: 'workspace.description.overview' },
  { id: 'sources', icon: Radio, label: 'workspace.sources', description: 'workspace.description.sources' },
  { id: 'proxies', icon: Boxes, label: 'workspace.proxyInventory', description: 'workspace.description.proxies' },
  { id: 'processing', icon: ListFilter, label: 'workspace.processing', description: 'workspace.description.processing' },
  { id: 'strategies', icon: GitBranch, label: 'workspace.strategies', description: 'workspace.description.strategies' },
  { id: 'routing', icon: Route, label: 'workspace.routing', description: 'workspace.description.routing' },
  { id: 'inspect', icon: SearchCheck, label: 'workspace.inspect', description: 'workspace.description.inspect' },
  { id: 'dns', icon: Globe2, label: 'workspace.settings', description: 'workspace.description.dns' },
  { id: 'export', icon: FileOutput, label: 'workspace.export', description: 'workspace.description.export' },
] as const

export function WorkspaceShell({
  activeSection, onSectionChange, primaryHealth, lastNodeSection, nodeEditorRequest, onNodeEditorRequestHandled, projects,
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
  const setPrimaryTarget = useBuilderStore((state) => state.setPrimaryTarget)
  const refreshAllSubscriptions = useBuilderStore((state) => state.refreshAllSubscriptions)
  const refreshableCount = useBuilderStore((state) => state.nodes.filter((node) => node.data.blockType === 'subscription' && node.data.enabled !== false && node.data.subscriptionInputKind === 'url' && Boolean(node.data.subscriptionUrl?.trim())).length)
  const refreshingCount = useBuilderStore((state) => Object.values(state.subscriptionRuntimes).filter((runtime) => runtime.refreshStatus === 'loading').length)
  const [editorOpen, setEditorOpen] = useState(false)
  const previousSectionRef = useRef(activeSection)
  const targetCompiles = useProjectCompiles(activeSection === 'export' || activeSection === 'inspect' || activeSection === 'strategies')
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
  const activeTargetProjection = stateForTarget(targetCompiles, activeProductTarget).result?.targetProjection
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
  const activeNavigation = navigation.find((item) => item.id === activeSection) ?? navigation[0]
  const isNodesActive = isNodeSection(activeSection)
  const primaryNavigation = [
    { id: 'sources', section: 'sources', icon: Radio, label: 'workspace.sources', count: counts.sources },
    { id: 'processing', section: 'processing', icon: ListFilter, label: 'workspace.processing', count: counts.processing },
    { id: 'strategies', section: 'strategies', icon: GitBranch, label: 'workspace.strategies', count: counts.strategies },
    { id: 'routing', section: 'routing', icon: Route, label: 'workspace.routing', count: counts.routing },
    { id: 'settings', section: 'dns', icon: Globe2, label: 'workspace.settings', count: undefined },
    { id: 'export', section: 'export', icon: FileOutput, label: 'workspace.export', count: undefined },
  ] as const
  const auxiliaryNavigation = [
    { id: 'overview', section: 'overview', icon: Home, label: 'workspace.home', count: undefined },
    { id: 'inspect', section: 'inspect', icon: SearchCheck, label: 'workspace.inspect', count: counts.inspect },
  ] as const

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

  useEffect(() => {
    if (shouldDismissWorkspaceEditor(previousSectionRef.current, activeSection)) {
      setEditorOpen(false)
      selectNode(null)
    }
    previousSectionRef.current = activeSection
  }, [activeSection, selectNode])
  useEffect(() => {
    if (!nodeEditorRequest) return
    if (nodes.some((node) => node.id === nodeEditorRequest.nodeId)) {
      selectNode(nodeEditorRequest.nodeId)
      setEditorOpen(true)
    }
    onNodeEditorRequestHandled?.(nodeEditorRequest.requestId)
  }, [nodeEditorRequest, nodes, onNodeEditorRequestHandled, selectNode])
  const openSectionFromEditor = useCallback((section: WorkspaceSectionId) => {
    closeEditor()
    onSectionChange(section)
  }, [closeEditor, onSectionChange])

  return <div className="structured-workspace">
    <nav className="workspace-navigation" aria-label={t('workspace.navigation')}>
      <div className="workspace-navigation-items">
        {primaryNavigation.map(({ id, section, icon: Icon, label, count }) => {
          const active = id === 'sources' ? isNodesActive : activeSection === section
          return <button type="button" className={active ? 'is-active' : ''} key={id} aria-current={active ? 'page' : undefined} onClick={() => onSectionChange(id === 'sources' ? resolveNodeSection(activeSection, lastNodeSection) : section)}>
            <Icon size={18} /><span>{t(label)}</span>{count !== undefined && <small>{count}</small>}
          </button>
        })}
        <div className="workspace-navigation-divider" aria-hidden="true" />
        {auxiliaryNavigation.map(({ id, section, icon: Icon, label, count }) => {
          const active = activeSection === section
          return <button type="button" className={active ? 'is-active' : ''} key={id} aria-current={active ? 'page' : undefined} onClick={() => onSectionChange(section)}>
            <Icon size={18} /><span>{t(label)}</span>{count !== undefined && count > 0 && <small>{count}</small>}
          </button>
        })}
      </div>
      <MobileWorkspaceNavigation
        activeSection={activeSection}
        lastNodeSection={lastNodeSection}
        items={navigation.map(({ id, icon, label }) => {
          const nodeTab = productNodeTabs.find((tab) => tab.section === id)
          return { id, icon, label: t(nodeTab?.label ?? label), count: counts[id] }
        })}
        labels={{
          title: t('workspace.mobileNavigation.title'),
          home: t('workspace.mobileNavigation.home'),
          nodes: t('workspace.mobileNavigation.sources'),
          processing: t('workspace.processing'),
          strategies: t('workspace.mobileNavigation.strategies'),
          routing: t('workspace.mobileNavigation.routing'),
          more: t('workspace.mobileNavigation.more'),
        }}
        onSectionChange={onSectionChange}
      />
    </nav>

    <main id="workspace-main" className="workspace-content" tabIndex={-1}>
      <header className="workspace-content-header">
        <div><h1>{isNodesActive ? (activeSection === 'proxies' ? t('workspace.proxyInventory') : t('workspace.sources')) : t(activeNavigation.label)}</h1>{!isNodesActive && <p>{t(activeNavigation.description)}</p>}</div>
        {activeSection === 'sources' && <div><button className="secondary-action" disabled={refreshableCount === 0 || refreshingCount > 0} onClick={() => void refreshAllSubscriptions()}><RefreshCw className={refreshingCount > 0 ? 'spin' : ''} size={15} />{t('workspace.refreshAll')}</button><button className="secondary-action" onClick={() => addNode('manual-proxy')}><Plus size={15} />{t('workspace.pasteLinks')}</button><button className="primary-action" onClick={() => addNode('subscription')}><Plus size={15} />{t('workspace.addSubscription')}</button></div>}
        {activeSection === 'processing' && <WorkspaceAddMenu label={t('workspace.addProcessing')} options={processingCreationOptions} onCreate={addNode} />}
        {activeSection === 'strategies' && <WorkspaceAddMenu label={t('workspace.addStrategy')} options={strategyCreationOptions(activeProductTarget)} onCreate={addNode} />}
      </header>

      {isNodesActive && <nav className="workspace-node-tabs" aria-label={t('workspace.sources')} role="tablist">
        {productNodeTabs.map(({ section, label }) => <button
          type="button"
          role="tab"
          aria-selected={activeSection === section}
          aria-controls={`workspace-panel-${section}`}
          className={activeSection === section ? 'is-active' : ''}
          key={section}
          onClick={() => onSectionChange(section)}
        >
          <span>{t(label)}</span>
          <small>{counts[section]}</small>
        </button>)}
      </nav>}

      <section id={isNodesActive ? `workspace-panel-${activeSection}` : undefined} className="workspace-section-body" data-section={activeSection} role={isNodesActive ? 'tabpanel' : undefined}>
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
            else onSectionChange('export')
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
        {activeSection === 'proxies' && <ProxiesWorkspace proxies={projection.proxies} target={activeProductTarget} targetProjection={activeTargetProjection} />}
        {activeSection === 'processing' && <ProcessingWorkspace
          items={orderedProcessing}
          runtime={pipelineRuntime}
          issues={projection.compileIssues}
          availability={(nodeId) => processingMoveAvailability(nodes, edges, nodeId)}
          onMove={(nodeId, direction) => { moveProcessingStep(nodeId, direction) }}
          onToggle={(item, disabled) => updateNodeData(item.node.id, { disabled })}
          onEdit={editInWorkspace}
          onDuplicate={(item) => duplicateNode(item.node.id)}
          onDelete={(item) => removeNode(item.node.id)}
        />}
        {activeSection === 'strategies' && <StrategiesWorkspace
          items={[...projection.strategies, ...projection.chains]}
          target={activeProductTarget}
          runtime={pipelineRuntime}
          issues={projection.compileIssues}
          targetProjection={activeTargetProjection}
          onEdit={editInWorkspace}
          onDuplicate={(item) => duplicateNode(item.node.id)}
          onDelete={(item) => removeNode(item.node.id)}
        />}
        {activeSection === 'routing' && <RoutingWorkspace
          items={projection.routing}
          finals={projection.finalRoutes}
          services={project.services}
          issues={projection.compileIssues}
          capabilities={getTargetCapabilities(activeProductTarget).routingMatchers}
          authoringTarget={activeProductTarget}
          copy={routingWorkspaceCopy(t, activeProductTarget)}
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
          node={projection.dns[0] ? { id: projection.dns[0].node.id, resolver: projection.dns[0].node.data.resolver, dnsResolvers: projection.dns[0].node.data.dnsResolvers, universalDnsMode: projection.dns[0].node.data.universalDnsMode, targetNativeSurgeDnsBehavior: projection.dns[0].node.data.targetNativeSurgeDnsBehavior } : undefined}
          target={activeProductTarget}
          copy={dnsWorkspaceCopy(t)}
          onCreateDns={() => addNode('dns', undefined, false)}
          onChange={(resolvers, universalDnsMode, targetNativeSurgeDnsBehavior) => projection.dns[0] && updateNodeData(projection.dns[0].node.id, {
            dnsResolvers: resolvers,
            resolver: undefined,
            ...(universalDnsMode ? { universalDnsMode } : {}),
            ...(targetNativeSurgeDnsBehavior !== undefined ? { targetNativeSurgeDnsBehavior: targetNativeSurgeDnsBehavior ?? undefined } : {}),
          })}
        />}
        {activeSection === 'inspect' && <ProjectHealthWorkspace
          nodes={nodes}
          diagnostics={inspectDiagnostics}
          compatibilityDiagnostics={compatibilityDiagnostics}
          targetProjection={activeTargetProjection}
          target={activeProductTarget}
          onOpenNode={openNodeInWorkspace}
        />}
        {activeSection === 'export' && <WorkspaceExportPanel
          primaryTarget={primaryTarget}
          compiles={targetCompiles}
          onSelectTarget={setPrimaryTarget}
          onShowDiagnostics={() => onSectionChange('inspect')}
        />}
      </section>
    </main>
    <WorkspaceNodeEditor open={editorOpen} onClose={closeEditor} onOpenWorkspaceSection={openSectionFromEditor} />
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
    surgeBuiltinTitle: t('workspace.routing.surgeBuiltinTitle'), surgeBuiltinDescription: t('workspace.routing.surgeBuiltinDescription'),
    surgeBuiltinLan: t('workspace.routing.surgeBuiltinLan'), surgeBuiltinSystem: t('workspace.routing.surgeBuiltinSystem'),
    surgeBuiltinLanDescription: t('workspace.routing.surgeBuiltinLanDescription'), surgeBuiltinSystemDescription: t('workspace.routing.surgeBuiltinSystemDescription'), surgeOnly: t('workspace.routing.surgeOnly'),
    unsupportedByTarget: t('workspace.routing.unsupportedByTarget', { target: target ? getTargetCapabilities(target).label : t('workspace.targetRequired') }),
    statusLabels: { ready: t('workspace.routing.status.ready'), warning: t('workspace.routing.status.warning'), error: t('workspace.routing.status.error'), disabled: t('workspace.routing.status.disabled') },
    capabilityLabels: { supported: t('workspace.compatibility.supported'), partial: t('workspace.compatibility.partial'), unsupported: t('workspace.compatibility.unsupported'), 'target-native': t('workspace.compatibility.targetNative') },
    presentation: {
      matcherLabels: {
        service: t('inspector.matcher.service'), domain: t('inspector.matcher.domain'), 'domain-suffix': t('inspector.matcher.domainSuffix'),
        'domain-keyword': t('inspector.matcher.domainKeyword'), 'ip-cidr': t('inspector.matcher.ipCidr'), 'ip-cidr6': t('inspector.matcher.ipCidr6'),
        port: t('inspector.matcher.port'), 'source-port': t('inspector.matcher.sourcePort'), asn: t('inspector.matcher.asn'), 'geo-ip': t('inspector.matcher.geoIp'), 'geo-site': t('inspector.matcher.geoSite'), 'rule-set': t('inspector.matcher.ruleSet'),
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
    universalDnsMode: t('workspace.dns.universalMode'), universalDnsModeNone: t('workspace.dns.universalMode.none'), universalDnsModeAutomatic: t('workspace.dns.universalMode.automatic'), universalDnsModeCustom: t('workspace.dns.universalMode.custom'), universalDnsModeDescription: t('workspace.dns.universalModeDescription'),
    alwaysRealIpLabel: t('workspace.dns.alwaysRealIp.label'), alwaysRealIpDescription: t('workspace.dns.alwaysRealIp.description'), alwaysRealIpPlaceholder: t('workspace.dns.alwaysRealIp.placeholder'), alwaysRealIpUnsupported: t('workspace.dns.alwaysRealIp.unsupported'), alwaysRealIpInvalid: t('workspace.dns.alwaysRealIp.invalid'), alwaysRealIpMalformed: t('workspace.dns.alwaysRealIp.malformed'), alwaysRealIpRemove: t('workspace.dns.alwaysRealIp.remove'),
    roles: { default: t('workspace.dns.role.default'), direct: t('workspace.dns.role.direct'), fallback: t('workspace.dns.role.fallback') },
    regions: { system: t('workspace.dns.region.system'), global: t('workspace.dns.region.global'), 'mainland-china': t('workspace.dns.region.mainlandChina') },
  }
}
