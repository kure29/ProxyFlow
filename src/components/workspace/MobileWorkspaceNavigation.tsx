import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Boxes, Check, GitBranch, Home, MoreHorizontal, Route, type LucideIcon } from 'lucide-react'
import type { WorkspaceSectionId } from '../../core/workspace'
import {
  isNodeSection, resolveMobilePrimarySection, resolveNodeSection,
  type MobilePrimarySection,
} from './mobileWorkspaceNavigationModel'

export interface MobileWorkspaceNavigationItem {
  id: WorkspaceSectionId
  icon: LucideIcon
  label: string
  count?: number
}

interface MobileWorkspaceNavigationProps {
  activeSection: WorkspaceSectionId
  lastNodeSection: WorkspaceSectionId
  items: readonly MobileWorkspaceNavigationItem[]
  labels: {
    title: string
    home: string
    nodes: string
    strategies: string
    routing: string
    more: string
  }
  onSectionChange: (section: WorkspaceSectionId) => void
}

type PopupPanel = 'nodes' | 'more'

export function MobileWorkspaceNavigation({
  activeSection, lastNodeSection, items, labels, onSectionChange,
}: MobileWorkspaceNavigationProps) {
  const [openPanel, setOpenPanel] = useState<PopupPanel | null>(null)
  const rootRef = useRef<HTMLElement>(null)
  const nodesTriggerRef = useRef<HTMLButtonElement>(null)
  const moreTriggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const popupId = useId()
  const activePrimary = resolveMobilePrimarySection(activeSection)
  const nodeItems = items.filter(({ id }) => isNodeSection(id))
  const moreItems = items.filter(({ id }) => id === 'dns' || id === 'inspect' || id === 'export')
  const popupItems = openPanel === 'nodes' ? nodeItems : moreItems

  const closePopup = (returnFocus = true) => {
    const trigger = openPanel === 'nodes' ? nodesTriggerRef.current : moreTriggerRef.current
    setOpenPanel(null)
    if (returnFocus) window.requestAnimationFrame(() => trigger?.focus())
  }

  useEffect(() => {
    if (!openPanel) return
    const focusFrame = window.requestAnimationFrame(() => {
      const current = popupRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      const first = popupRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')
      ;(current ?? first)?.focus()
    })
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closePopup(true)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closePopup(true)
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [openPanel])

  const selectSection = (section: WorkspaceSectionId) => {
    onSectionChange(section)
    closePopup(true)
  }
  const navigatePopup = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'))
    if (!options.length) return
    event.preventDefault()
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
        : event.key === 'ArrowUp' ? (current <= 0 ? options.length - 1 : current - 1)
          : (current + 1) % options.length
    options[next]?.focus()
  }
  const pressPrimary = (section: MobilePrimarySection) => {
    if (section === 'nodes') {
      if (activePrimary === 'nodes') setOpenPanel((current) => current === 'nodes' ? null : 'nodes')
      else { setOpenPanel(null); onSectionChange(resolveNodeSection(activeSection, lastNodeSection)) }
      return
    }
    if (section === 'more') {
      setOpenPanel((current) => current === 'more' ? null : 'more')
      return
    }
    setOpenPanel(null)
    onSectionChange(section === 'home' ? 'overview' : section)
  }
  const controls: Array<{ id: MobilePrimarySection; icon: LucideIcon; label: string }> = [
    { id: 'home', icon: Home, label: labels.home },
    { id: 'nodes', icon: Boxes, label: labels.nodes },
    { id: 'strategies', icon: GitBranch, label: labels.strategies },
    { id: 'routing', icon: Route, label: labels.routing },
    { id: 'more', icon: MoreHorizontal, label: labels.more },
  ]

  return <nav ref={rootRef} className="workspace-mobile-navigation" aria-label={labels.title}>
    {openPanel && <div
      ref={popupRef}
      id={popupId}
      className="workspace-mobile-navigation-popup"
      data-panel={openPanel}
      role="menu"
      aria-label={openPanel === 'nodes' ? labels.nodes : labels.more}
      onKeyDown={navigatePopup}
    >
      {popupItems.map(({ id, icon: Icon, label, count }) => <button
        type="button"
        role="menuitemradio"
        aria-checked={id === activeSection}
        key={id}
        onClick={() => selectSection(id)}
      >
        <Icon size={17} />
        <span>{label}</span>
        {count !== undefined && <small>{count}</small>}
        {id === activeSection && <Check size={16} aria-hidden="true" />}
      </button>)}
    </div>}
    {controls.map(({ id, icon: Icon, label }) => {
      const popupLauncher = id === 'nodes' || id === 'more'
      const expanded = openPanel === id
      return <button
        ref={id === 'nodes' ? nodesTriggerRef : id === 'more' ? moreTriggerRef : undefined}
        type="button"
        className={activePrimary === id ? 'is-active' : ''}
        aria-current={activePrimary === id ? 'page' : undefined}
        aria-haspopup={popupLauncher ? 'menu' : undefined}
        aria-controls={expanded ? popupId : undefined}
        aria-expanded={popupLauncher ? expanded : undefined}
        key={id}
        onClick={() => pressPrimary(id)}
      ><Icon size={19} /><span>{label}</span></button>
    })}
  </nav>
}
