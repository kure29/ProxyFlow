import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, X, type LucideIcon } from 'lucide-react'
import type { WorkspaceSectionId } from '../../core/workspace'
import { activateMobileWorkspaceSection } from './mobileWorkspaceNavigationModel'

export interface MobileWorkspaceNavigationItem {
  id: WorkspaceSectionId
  icon: LucideIcon
  label: string
  count?: number
}

interface MobileWorkspaceNavigationProps {
  activeSection: WorkspaceSectionId
  items: readonly MobileWorkspaceNavigationItem[]
  open: boolean
  openLabel: string
  closeLabel: string
  title: string
  inputLabel: string
  moreLabel: string
  onOpenChange: (open: boolean) => void
  onSectionChange: (section: WorkspaceSectionId) => void
}

export function MobileWorkspaceNavigation({
  activeSection, items, open, openLabel, closeLabel, title, inputLabel, moreLabel, onOpenChange, onSectionChange,
}: MobileWorkspaceNavigationProps) {
  const inputTriggerRef = useRef<HTMLButtonElement>(null)
  const moreTriggerRef = useRef<HTMLButtonElement>(null)
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const activeItemRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)
  const [panel, setPanel] = useState<'input' | 'more'>('more')
  const inputItems = items.filter(({ id }) => id === 'sources' || id === 'proxies')
  const primaryItems = items.filter(({ id }) => id === 'processing' || id === 'strategies' || id === 'routing')
  const moreItems = items.filter(({ id }) => !inputItems.some((item) => item.id === id) && !primaryItems.some((item) => item.id === id))
  const drawerItems = panel === 'input' ? inputItems : moreItems
  const inputActive = inputItems.some(({ id }) => id === activeSection)
  const moreActive = moreItems.some(({ id }) => id === activeSection)

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) lastTriggerRef.current?.focus()
      wasOpenRef.current = false
      return
    }

    wasOpenRef.current = true
    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => activeItemRef.current?.focus())
    const handleDrawerKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const desktopQuery = window.matchMedia('(min-width: 1200px)')
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) onOpenChange(false)
    }
    window.addEventListener('keydown', handleDrawerKeyboard)
    desktopQuery.addEventListener('change', closeAtDesktop)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleDrawerKeyboard)
      desktopQuery.removeEventListener('change', closeAtDesktop)
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousRootOverflow
    }
  }, [onOpenChange, open])

  if (!items.length) return null
  const InputIcon = inputItems.find(({ id }) => id === activeSection)?.icon ?? inputItems[0]?.icon
  const openPanel = (nextPanel: 'input' | 'more') => {
    setPanel(nextPanel)
    lastTriggerRef.current = nextPanel === 'input' ? inputTriggerRef.current : moreTriggerRef.current
    onOpenChange(true)
  }
  const drawerHasActiveItem = drawerItems.some(({ id }) => id === activeSection)
  const drawer = open ? <div
    className="workspace-mobile-navigation-backdrop"
    onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onOpenChange(false)
    }}
  >
    <aside ref={drawerRef} id="workspace-mobile-navigation-drawer" className="workspace-mobile-navigation-drawer" role="dialog" aria-modal="true" aria-labelledby="workspace-mobile-navigation-title">
      <header>
        <strong id="workspace-mobile-navigation-title">{panel === 'input' ? inputLabel : title}</strong>
        <button type="button" className="workspace-mobile-navigation-close" aria-label={closeLabel} onClick={() => onOpenChange(false)}><X size={18} /></button>
      </header>
      <nav aria-label={title}>
        {drawerItems.map(({ id, icon: Icon, label, count }, index) => <button
          ref={id === activeSection || (index === 0 && !drawerHasActiveItem) ? activeItemRef : undefined}
          type="button"
          className={id === activeSection ? 'is-active' : ''}
          aria-label={count === undefined ? label : `${label}: ${count}`}
          aria-current={id === activeSection ? 'page' : undefined}
          key={id}
          onClick={() => activateMobileWorkspaceSection(id, onSectionChange, () => onOpenChange(false))}
        >
          <Icon size={18} />
          <span>{label}</span>
          {count !== undefined && <small aria-hidden="true">{count}</small>}
        </button>)}
      </nav>
    </aside>
  </div> : null

  return <nav className="workspace-mobile-navigation" aria-label={title}>
    <button
      ref={inputTriggerRef}
      type="button"
      className={inputActive ? 'is-active' : ''}
      aria-label={`${openLabel}: ${inputLabel}`}
      aria-haspopup="dialog"
      aria-controls={open ? 'workspace-mobile-navigation-drawer' : undefined}
      aria-expanded={open && panel === 'input'}
      aria-current={inputActive ? 'page' : undefined}
      onClick={() => open && panel === 'input' ? onOpenChange(false) : openPanel('input')}
    >
      {InputIcon && <InputIcon size={19} />}
      <span>{inputLabel}</span>
    </button>
    {primaryItems.map(({ id, icon: Icon, label }) => <button
      type="button"
      className={id === activeSection ? 'is-active' : ''}
      aria-current={id === activeSection ? 'page' : undefined}
      key={id}
      onClick={() => activateMobileWorkspaceSection(id, onSectionChange, () => onOpenChange(false))}
    ><Icon size={19} /><span>{label}</span></button>)}
    <button
      ref={moreTriggerRef}
      type="button"
      className={moreActive ? 'is-active' : ''}
      aria-label={`${openLabel}: ${moreLabel}`}
      aria-haspopup="dialog"
      aria-controls={open ? 'workspace-mobile-navigation-drawer' : undefined}
      aria-expanded={open && panel === 'more'}
      aria-current={moreActive ? 'page' : undefined}
      onClick={() => open && panel === 'more' ? onOpenChange(false) : openPanel('more')}
    ><MoreHorizontal size={20} /><span>{moreLabel}</span></button>
    {drawer && (typeof document === 'undefined' ? drawer : createPortal(drawer, document.body))}
  </nav>
}
