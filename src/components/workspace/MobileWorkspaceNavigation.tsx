import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Menu, X, type LucideIcon } from 'lucide-react'
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
  onOpenChange: (open: boolean) => void
  onSectionChange: (section: WorkspaceSectionId) => void
}

export function MobileWorkspaceNavigation({
  activeSection, items, open, openLabel, closeLabel, title, onOpenChange, onSectionChange,
}: MobileWorkspaceNavigationProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const activeItemRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)
  const activeItem = items.find((item) => item.id === activeSection) ?? items[0]

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) triggerRef.current?.focus()
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

  if (!activeItem) return null
  const ActiveIcon = activeItem.icon
  const drawer = open ? <div
    className="workspace-mobile-navigation-backdrop"
    onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onOpenChange(false)
    }}
  >
    <aside ref={drawerRef} id="workspace-mobile-navigation-drawer" className="workspace-mobile-navigation-drawer" role="dialog" aria-modal="true" aria-labelledby="workspace-mobile-navigation-title">
      <header>
        <strong id="workspace-mobile-navigation-title">{title}</strong>
        <button type="button" className="workspace-mobile-navigation-close" aria-label={closeLabel} onClick={() => onOpenChange(false)}><X size={18} /></button>
      </header>
      <nav aria-label={title}>
        {items.map(({ id, icon: Icon, label, count }) => <button
          ref={id === activeSection ? activeItemRef : undefined}
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

  return <div className="workspace-mobile-navigation">
    <button
      ref={triggerRef}
      type="button"
      className="workspace-mobile-navigation-trigger"
      aria-label={`${openLabel}: ${activeItem.label}`}
      aria-haspopup="dialog"
      aria-controls={open ? 'workspace-mobile-navigation-drawer' : undefined}
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
    >
      <Menu size={18} />
      <ActiveIcon className="workspace-mobile-navigation-current-icon" size={17} />
      <span>{activeItem.label}</span>
      {activeItem.count !== undefined && <small>{activeItem.count}</small>}
      <ChevronRight size={16} />
    </button>
    {drawer && (typeof document === 'undefined' ? drawer : createPortal(drawer, document.body))}
  </div>
}
