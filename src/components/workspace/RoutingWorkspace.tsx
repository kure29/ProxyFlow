import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, CheckCircle2, ChevronLeft, CircleOff,
  Copy, GripVertical, MoreHorizontal, Pencil, Plus, Search, Trash2, X,
} from 'lucide-react'
import type { CapabilityDeclaration, CapabilityStatus } from '../../core/capabilities'
import {
  CUSTOM_ROUTE_MATCHERS, presentRoutingRule, sumKnownRuleCounts,
  type CustomRouteMatcherKind, type RoutingIssueLike, type RoutingPresentationCopy,
  type RoutingRuleStatus,
} from '../../core/routing/routePresentation'
import type { WorkspaceNodeItem, WorkspaceRoutingItem } from '../../core/workspace'
import type { BlockNodeData, BlockType, GraphNode, RouteMatcherKind, ServiceDefinition } from '../../types/project'
import { AssetIcon } from '../icons/AssetIcon'

type AddStage = 'closed' | 'kind' | 'service' | 'custom'
export type RoutingCapabilityMap = Partial<Record<RouteMatcherKind, CapabilityDeclaration>>

export interface RoutingWorkspaceCopy {
  rulesLabel: string
  addRule: string
  chooseRuleKind: string
  serviceRule: string
  serviceRuleDescription: string
  customRule: string
  customRuleDescription: string
  chooseService: string
  searchServices: string
  noServices: string
  chooseMatcher: string
  back: string
  close: string
  serviceMatcher: string
  customMatcher: string
  finalRoute: string
  target: string
  moveUp: string
  moveDown: string
  dragRule: string
  more: string
  edit: string
  duplicate: string
  delete: string
  cancel: string
  unsupportedByTarget: string
  statusLabels: Record<RoutingRuleStatus, string>
  capabilityLabels: Record<CapabilityStatus, string>
  presentation: RoutingPresentationCopy
}

export interface RoutingWorkspaceProps {
  items: readonly WorkspaceRoutingItem[]
  finals?: readonly WorkspaceNodeItem[]
  services: readonly ServiceDefinition[]
  issues?: readonly RoutingIssueLike[]
  capabilities?: RoutingCapabilityMap
  copy: RoutingWorkspaceCopy
  onCreate: (blockType: BlockType, data?: Partial<BlockNodeData>) => void
  onMove: (nodeId: string, direction: 'up' | 'down') => void
  onMoveToIndex: (nodeId: string, targetIndex: number) => void
  onEdit: (item: WorkspaceNodeItem) => void
  onDuplicate: (item: WorkspaceNodeItem) => void
  onDelete: (item: WorkspaceNodeItem) => void
  getNodeTitle?: (node: GraphNode) => string
  getTargetSummary?: (node: GraphNode, fallback: string) => string
}

export function RoutingWorkspace({
  items,
  finals = [],
  services,
  issues = [],
  capabilities = {},
  copy,
  onCreate,
  onMove,
  onMoveToIndex,
  onEdit,
  onDuplicate,
  onDelete,
  getNodeTitle,
  getTargetSummary,
}: RoutingWorkspaceProps) {
  const [stage, setStage] = useState<AddStage>('closed')
  const [serviceQuery, setServiceQuery] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [actionItem, setActionItem] = useState<{ item: WorkspaceNodeItem; index: number; title: string; final: boolean } | null>(null)
  const addRootRef = useRef<HTMLDivElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const addPopoverRef = useRef<HTMLDivElement>(null)
  const actionSheetRef = useRef<HTMLElement>(null)
  const actionReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const visibleServices = useMemo(
    () => filterRoutingServices(services, serviceQuery),
    [serviceQuery, services],
  )

  useEffect(() => {
    if (stage === 'closed') return
    const mobileSheet = window.matchMedia('(max-width: 767px)').matches
    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    if (mobileSheet) {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    }
    const focusFrame = window.requestAnimationFrame(() => {
      const selector = stage === 'service'
        ? 'input:not(:disabled)'
        : '.routing-kind-choices button:not(:disabled), .routing-matcher-choices button:not(:disabled)'
      addPopoverRef.current?.querySelector<HTMLElement>(selector)?.focus()
    })
    const close = (event: PointerEvent) => {
      if (!addRootRef.current?.contains(event.target as Node)) setStage('closed')
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setStage('closed')
      addButtonRef.current?.focus()
    }
    const trapFocus = (event: KeyboardEvent) => {
      if (!mobileSheet || event.key !== 'Tab') return
      const focusable = Array.from(addPopoverRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('keydown', trapFocus)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('keydown', trapFocus)
      if (mobileSheet) {
        document.body.style.overflow = previousBodyOverflow
        document.documentElement.style.overflow = previousRootOverflow
      }
    }
  }, [stage])

  useEffect(() => {
    if (!actionItem) return
    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => actionSheetRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setActionItem(null); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(actionSheetRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousRootOverflow
      window.requestAnimationFrame(() => actionReturnFocusRef.current?.focus())
    }
  }, [actionItem])

  const closeAddPopover = (returnFocus = true) => {
    setStage('closed')
    if (returnFocus) window.requestAnimationFrame(() => addButtonRef.current?.focus())
  }

  const createServiceRule = (service: ServiceDefinition) => {
    onCreate('service-rule', createServiceRuleData(service))
    setServiceQuery('')
    closeAddPopover()
  }

  const createCustomRule = (matcher: CustomRouteMatcherKind) => {
    onCreate('custom-rule', createCustomRuleData(matcher, copy.customRule))
    closeAddPopover()
  }

  const dropAt = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault()
    const nodeId = draggingId || event.dataTransfer.getData('text/plain')
    if (nodeId && items.some((item) => item.node.id === nodeId)) onMoveToIndex(nodeId, targetIndex)
    setDraggingId(null)
  }
  const openActions = (trigger: HTMLButtonElement, item: WorkspaceNodeItem, index: number, title: string, final: boolean) => {
    if (!window.matchMedia('(max-width: 767px)').matches) { onEdit(item); return }
    actionReturnFocusRef.current = trigger
    setActionItem({ item, index, title, final })
  }

  return <section className="routing-workspace" aria-label={copy.rulesLabel}>
    <header className="routing-workspace-heading">
      <div className="routing-add" ref={addRootRef} onBlur={(event) => {
        if (stage !== 'closed' && !event.currentTarget.contains(event.relatedTarget as Node | null)) setStage('closed')
      }}>
        <button ref={addButtonRef} type="button" className="primary-action" aria-haspopup="dialog" aria-controls={stage === 'closed' ? undefined : 'routing-add-popover'} aria-expanded={stage !== 'closed'} onClick={() => stage === 'closed' ? setStage('kind') : closeAddPopover()}>
          <Plus size={16} />{copy.addRule}
        </button>
        {stage !== 'closed' && <div className="routing-add-sheet-backdrop" onMouseDown={() => closeAddPopover()} />}
        {stage !== 'closed' && <div ref={addPopoverRef} id="routing-add-popover" className="routing-add-popover" role="dialog" aria-label={stage === 'kind' ? copy.chooseRuleKind : stage === 'service' ? copy.chooseService : copy.chooseMatcher}>
          <header>
            {stage !== 'kind' && <button type="button" className="icon-button" aria-label={copy.back} title={copy.back} onClick={() => setStage('kind')}><ChevronLeft size={17} /></button>}
            <strong>{stage === 'kind' ? copy.chooseRuleKind : stage === 'service' ? copy.chooseService : copy.chooseMatcher}</strong>
            <button type="button" className="icon-button" aria-label={copy.close} title={copy.close} onClick={() => closeAddPopover()}><X size={17} /></button>
          </header>
          {stage === 'kind' && <RuleKindChoices capabilities={capabilities} copy={copy} onSelect={setStage} />}
          {stage === 'service' && <ServiceChoices services={visibleServices} query={serviceQuery} capability={capabilities.service} copy={copy} onQueryChange={setServiceQuery} onSelect={createServiceRule} />}
          {stage === 'custom' && <CustomMatcherChoices capabilities={capabilities} copy={copy} onSelect={createCustomRule} />}
        </div>}
      </div>
    </header>

    <div className="routing-rule-list" role="list">
      {items.map((item, index) => {
        const presentation = presentRoutingRule(item.node, services, issues, copy.presentation)
        const unsupported = Boolean(presentation.matcherKind && capabilityUnavailable(capabilities[presentation.matcherKind]))
        const status = routingRuleStatusForCapability(presentation.status, presentation.matcherKind, capabilities)
        const title = getNodeTitle?.(item.node) ?? presentation.title
        const target = getTargetSummary?.(item.node, presentation.targetSummary) ?? presentation.targetSummary
        return <article
          className="routing-rule-row"
          data-status={status}
          key={item.node.id}
          role="listitem"
          onDragOver={(event) => { if (draggingId && draggingId !== item.node.id) event.preventDefault() }}
          onDrop={(event) => dropAt(event, index)}
        >
          <button
            type="button"
            className="routing-drag-handle"
            draggable
            aria-label={`${copy.dragRule}: ${title}`}
            title={copy.dragRule}
            onDragStart={(event) => {
              setDraggingId(item.node.id)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', item.node.id)
            }}
            onDragEnd={() => setDraggingId(null)}
          ><GripVertical size={17} /></button>
          <span className="routing-rule-order">{index + 1}</span>
          <div className="routing-rule-summary">
            <strong>{title}</strong>
            <span><b>{presentation.intent === 'service' ? copy.serviceMatcher : copy.customMatcher}</b><code>{presentation.matcherSummary}</code></span>
          </div>
          <button type="button" className="routing-rule-target" aria-label={`${copy.target}: ${target}`} onClick={() => onEdit(item)}><small>{copy.target}</small><span><ArrowRight size={14} /><strong>{target}</strong></span></button>
          <RuleStatus status={status} label={unsupported ? copy.unsupportedByTarget : copy.statusLabels[status]} />
          <div className="routing-rule-actions">
            <button type="button" className="icon-button" disabled={index === 0} aria-label={`${copy.moveUp}: ${title}`} title={copy.moveUp} onClick={() => onMove(item.node.id, 'up')}><ArrowUp size={15} /></button>
            <button type="button" className="icon-button" disabled={index === items.length - 1} aria-label={`${copy.moveDown}: ${title}`} title={copy.moveDown} onClick={() => onMove(item.node.id, 'down')}><ArrowDown size={15} /></button>
            <button type="button" className="icon-button" aria-label={`${copy.more}: ${title}`} title={copy.more} onClick={(event) => openActions(event.currentTarget, item, index, title, false)}><MoreHorizontal size={17} /></button>
          </div>
        </article>
      })}
      {finals.map((item) => {
        const title = getNodeTitle?.(item.node) ?? item.node.data.title
        const targetFallback = finalTarget(item.node, copy.presentation.targetMissing)
        const target = getTargetSummary?.(item.node, targetFallback) ?? targetFallback
        const status = finalStatus(item.node, issues)
        return <article className="routing-rule-row is-final" data-status={status} key={item.node.id} role="listitem">
          <span className="routing-rule-order">F</span>
          <div className="routing-rule-summary"><strong>{title}</strong><span><b>{copy.finalRoute}</b></span></div>
          <button type="button" className="routing-rule-target" aria-label={`${copy.target}: ${target}`} onClick={() => onEdit(item)}><small>{copy.target}</small><span><ArrowRight size={14} /><strong>{target}</strong></span></button>
          <RuleStatus status={status} label={copy.statusLabels[status]} />
          <div className="routing-rule-actions"><button type="button" className="icon-button" aria-label={`${copy.more}: ${title}`} title={copy.more} onClick={(event) => openActions(event.currentTarget, item, -1, title, true)}><MoreHorizontal size={17} /></button></div>
        </article>
      })}
    </div>
    {actionItem && <div className="routing-action-sheet-backdrop" onMouseDown={() => setActionItem(null)}>
      <aside ref={actionSheetRef} className="routing-action-sheet" role="dialog" aria-modal="true" aria-label={`${copy.more}: ${actionItem.title}`} onMouseDown={(event) => event.stopPropagation()}>
        <header><span /><strong>{actionItem.title}</strong></header>
        <div>
          <button type="button" onClick={() => { onEdit(actionItem.item); setActionItem(null) }}><Pencil size={17} />{copy.edit}</button>
          {!actionItem.final && <button type="button" onClick={() => { onDuplicate(actionItem.item); setActionItem(null) }}><Copy size={17} />{copy.duplicate}</button>}
          {!actionItem.final && <button type="button" disabled={actionItem.index === 0} onClick={() => { onMove(actionItem.item.node.id, 'up'); setActionItem(null) }}><ArrowUp size={17} />{copy.moveUp}</button>}
          {!actionItem.final && <button type="button" disabled={actionItem.index === items.length - 1} onClick={() => { onMove(actionItem.item.node.id, 'down'); setActionItem(null) }}><ArrowDown size={17} />{copy.moveDown}</button>}
          <button type="button" className="danger" disabled={Boolean(actionItem.item.node.data.protected)} onClick={() => { onDelete(actionItem.item); setActionItem(null) }}><Trash2 size={17} />{copy.delete}</button>
        </div>
        <button type="button" className="routing-action-sheet-cancel" onClick={() => setActionItem(null)}>{copy.cancel}</button>
      </aside>
    </div>}
  </section>
}

function RuleKindChoices({ capabilities, copy, onSelect }: {
  capabilities: RoutingCapabilityMap
  copy: RoutingWorkspaceCopy
  onSelect: (stage: 'service' | 'custom') => void
}) {
  const serviceUnavailable = capabilityUnavailable(capabilities.service)
  const customUnavailable = CUSTOM_ROUTE_MATCHERS.every((matcher) => capabilityUnavailable(capabilities[matcher]))
  return <div className="routing-kind-choices">
    <button type="button" disabled={serviceUnavailable} onClick={() => onSelect('service')}>
      <span><strong>{copy.serviceRule}</strong><small>{copy.serviceRuleDescription}</small></span>
      <CapabilityBadge capability={capabilities.service} copy={copy} />
    </button>
    <button type="button" disabled={customUnavailable} onClick={() => onSelect('custom')}>
      <span><strong>{copy.customRule}</strong><small>{copy.customRuleDescription}</small></span>
      {customUnavailable && <b data-capability="unsupported">{copy.capabilityLabels.unsupported}</b>}
    </button>
  </div>
}

function ServiceChoices({ services, query, capability, copy, onQueryChange, onSelect }: {
  services: readonly ServiceDefinition[]
  query: string
  capability?: CapabilityDeclaration
  copy: RoutingWorkspaceCopy
  onQueryChange: (value: string) => void
  onSelect: (service: ServiceDefinition) => void
}) {
  return <div className="routing-service-choices">
    <label><span className="visually-hidden">{copy.searchServices}</span><Search size={16} /><input autoFocus type="search" value={query} placeholder={copy.searchServices} onChange={(event) => onQueryChange(event.target.value)} /></label>
    <div role="listbox" aria-label={copy.chooseService}>{services.map((service) => {
      const ruleCount = sumKnownRuleCounts([service])
      return <button type="button" role="option" aria-selected="false" disabled={capabilityUnavailable(capability)} key={service.id} onClick={() => onSelect(service)}>
        <AssetIcon className="service-avatar" src={service.icon} darkSrc={service.iconDark} fallback={service.name.slice(0, 1)} />
        <span><strong>{service.name}</strong>{ruleCount !== undefined && <small>{copy.presentation.ruleCount(ruleCount)}</small>}</span>
        <ArrowRight size={15} />
      </button>
    })}{services.length === 0 && <p>{copy.noServices}</p>}</div>
  </div>
}

function CustomMatcherChoices({ capabilities, copy, onSelect }: {
  capabilities: RoutingCapabilityMap
  copy: RoutingWorkspaceCopy
  onSelect: (matcher: CustomRouteMatcherKind) => void
}) {
  return <div className="routing-matcher-choices">{CUSTOM_ROUTE_MATCHERS.map((matcher) => {
    const capability = capabilities[matcher]
    return <button type="button" disabled={capabilityUnavailable(capability)} key={matcher} onClick={() => onSelect(matcher)}>
      <span><strong>{copy.presentation.matcherLabels[matcher]}</strong><small>{copy.customRuleDescription}</small></span>
      <CapabilityBadge capability={capability} copy={copy} />
    </button>
  })}</div>
}

function CapabilityBadge({ capability, copy }: { capability?: CapabilityDeclaration; copy: RoutingWorkspaceCopy }) {
  if (!capability || capability.status === 'supported') return <ArrowRight size={15} />
  return <b data-capability={capability.status}>{copy.capabilityLabels[capability.status]}</b>
}

function RuleStatus({ status, label }: { status: RoutingRuleStatus; label: string }) {
  const Icon = status === 'ready' ? CheckCircle2 : status === 'disabled' ? CircleOff : AlertTriangle
  return <span className="routing-rule-status" data-status={status}><Icon size={14} /><span>{label}</span></span>
}

export function filterRoutingServices(services: readonly ServiceDefinition[], query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return [...services]
  return services.filter((service) => [service.id, service.name, service.category, service.description]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase().includes(normalized)))
}

export function capabilityUnavailable(capability: CapabilityDeclaration | undefined) {
  return capability?.status === 'unsupported'
}

export function routingRuleStatusForCapability(
  status: RoutingRuleStatus,
  matcherKind: RouteMatcherKind | undefined,
  capabilities: RoutingCapabilityMap,
): RoutingRuleStatus {
  if (status === 'disabled' || !matcherKind) return status
  return capabilityUnavailable(capabilities[matcherKind]) ? 'error' : status
}

export function createServiceRuleData(service: ServiceDefinition): Partial<BlockNodeData> {
  return {
    title: service.name,
    titleKey: undefined,
    routeMatcherKind: 'service',
    services: [service.id],
  }
}

export function createCustomRuleData(matcher: CustomRouteMatcherKind, title: string): Partial<BlockNodeData> {
  return {
    title,
    titleKey: undefined,
    routeMatcherKind: matcher,
    routeMatcherValue: matcher === 'port' ? undefined : '',
    routeMatcherPort: undefined,
    ruleSource: 'custom',
  }
}

function finalTarget(node: GraphNode, missing: string) {
  if (node.data.targetKind === 'direct') return 'DIRECT'
  if (node.data.targetKind === 'reject') return 'REJECT'
  return node.data.targetLabel?.trim() || node.data.targetId?.trim() || missing
}

function finalStatus(node: GraphNode, issues: readonly RoutingIssueLike[]): RoutingRuleStatus {
  if (node.data.disabled) return 'disabled'
  const relevant = issues.filter((issue) => issue.nodeId === node.id)
  if (relevant.some((issue) => issue.severity === 'error')) return 'error'
  if (relevant.some((issue) => issue.severity === 'warning')) return 'warning'
  return finalTarget(node, '') ? 'ready' : 'error'
}
