import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, Search, X } from 'lucide-react'
import {
  DEFAULT_REGION_CODES,
  REGION_CATALOG,
  regionFlag,
  regionLabelForLocale,
  searchRegions,
  type RegionCatalogEntry,
  type RegionCode,
  type RegionDisplayLocale,
} from '../../core/proxy'
import { useI18n } from '../../i18n'
import { resolveShellMode } from '../layout/shellState'
import { positionViewportPopover, readPopoverViewport } from '../ui/viewportPopover'
import { lockWorkspaceDocumentScroll } from '../workspace/workspaceEditorLifecycle'
import {
  observeWorkspaceViewport,
  readWorkspaceViewportGeometry,
  type WorkspaceViewportGeometry,
} from '../workspace/workspaceEditorViewport'
import {
  clearRegionSelectionDraft,
  commitRegionSelectionDraft,
  createRegionSelectionDraft,
  toggleRegionSelectionDraft,
  type RegionSelectionDraft,
} from './regionSelection'

interface RegionPickerProps {
  values: RegionCode[]
  onChange: (values: RegionCode[]) => void
}

interface PickerPosition {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

export interface RegionPickerLayout {
  panelHeight: number
  listHeight: number
  approximateVisibleItems: number
}

const REGION_ROW_HEIGHT = 48
const REGION_PICKER_FIXED_HEIGHT = 228
const REGION_PICKER_DESIRED_LIST_HEIGHT = REGION_ROW_HEIGHT * 5
const REGION_PICKER_DESIRED_HEIGHT = REGION_PICKER_FIXED_HEIGHT + REGION_PICKER_DESIRED_LIST_HEIGHT

export function resolveRegionPickerPresentation(width: number): 'popover' | 'sheet' {
  return resolveShellMode(width) === 'desktop' ? 'popover' : 'sheet'
}

export function resolveRegionPickerLayout(
  availableHeight: number,
  presentation: 'popover' | 'sheet',
): RegionPickerLayout {
  const safeHeight = Math.max(1, Math.floor(availableHeight))
  const presentationHeight = presentation === 'sheet'
    ? Math.floor(safeHeight * 0.86)
    : safeHeight
  const panelHeight = Math.min(REGION_PICKER_DESIRED_HEIGHT, Math.max(1, presentationHeight))
  const listHeight = Math.max(0, Math.min(
    REGION_PICKER_DESIRED_LIST_HEIGHT,
    panelHeight - REGION_PICKER_FIXED_HEIGHT,
  ))
  return {
    panelHeight,
    listHeight,
    approximateVisibleItems: listHeight / REGION_ROW_HEIGHT,
  }
}

export function regionPickerEntries(query: string, locale: RegionDisplayLocale): RegionCatalogEntry[] {
  if (query.trim()) return searchRegions(query, locale)
  const priority = new Map(DEFAULT_REGION_CODES.map((code, index) => [code, index]))
  return [...REGION_CATALOG].sort((left, right) => {
    const leftPriority = priority.get(left.code as (typeof DEFAULT_REGION_CODES)[number])
    const rightPriority = priority.get(right.code as (typeof DEFAULT_REGION_CODES)[number])
    if (leftPriority !== undefined || rightPriority !== undefined) {
      if (leftPriority === undefined) return 1
      if (rightPriority === undefined) return -1
      return leftPriority - rightPriority
    }
    return left.code.localeCompare(right.code)
  })
}

export function regionPickerSummary(
  values: readonly RegionCode[],
  locale: RegionDisplayLocale,
  emptyLabel: string,
  countLabel: (count: number) => string,
): string {
  const canonical = createRegionSelectionDraft(values).committed
  if (!canonical.length) return emptyLabel
  if (canonical.length >= 3) return countLabel(canonical.length)
  return canonical
    .map((code) => `${regionFlag(code)} ${regionLabelForLocale(code, locale)}`)
    .join(' · ')
}

export function regionPickerInitialFocusTarget(_presentation: 'popover' | 'sheet'): 'panel' {
  return 'panel'
}

export function restoreRegionPickerFocus(
  trigger: Pick<HTMLElement, 'focus'> | null,
  schedule: (callback: () => void) => unknown,
) {
  schedule(() => trigger?.focus())
}

export function RegionPicker({ values, onChange }: RegionPickerProps) {
  const { locale, t } = useI18n()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const rowRefs = useRef(new Map<RegionCode, HTMLButtonElement>())
  const [open, setOpen] = useState(false)
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && resolveRegionPickerPresentation(window.innerWidth) === 'sheet'
  ))
  const [selection, setSelection] = useState<RegionSelectionDraft>(() => (
    createRegionSelectionDraft(values)
  ))
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PickerPosition | null>(null)
  const [viewport, setViewport] = useState<WorkspaceViewportGeometry>(() => (
    typeof window === 'undefined'
      ? { height: 800, offsetTop: 0 }
      : readWorkspaceViewportGeometry(window)
  ))
  const presentation = compact ? 'sheet' : 'popover'
  const entries = useMemo(() => regionPickerEntries(query, locale), [locale, query])
  const availableHeight = compact ? viewport.height : position?.maxHeight ?? REGION_PICKER_DESIRED_HEIGHT
  const layout = resolveRegionPickerLayout(availableHeight, presentation)

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger || compact) return
    setPosition(positionViewportPopover(trigger.getBoundingClientRect(), readPopoverViewport(), {
      preferredWidth: 380,
      maxHeight: 500,
      minPreferredHeight: 320,
      viewportPadding: 12,
      gap: 8,
      matchAnchorWidth: true,
    }))
  }

  const restoreFocus = () => {
    restoreRegionPickerFocus(triggerRef.current, (callback) => window.requestAnimationFrame(callback))
  }

  const close = () => {
    setOpen(false)
    setQuery('')
    restoreFocus()
  }

  const cancel = () => {
    setSelection(createRegionSelectionDraft(values))
    close()
  }

  const openPicker = () => {
    setSelection(createRegionSelectionDraft(values))
    setQuery('')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) setSelection(createRegionSelectionDraft(values))
  }, [open, values])

  useEffect(() => {
    const updatePresentation = () => setCompact(resolveRegionPickerPresentation(window.innerWidth) === 'sheet')
    window.addEventListener('resize', updatePresentation)
    return () => window.removeEventListener('resize', updatePresentation)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const frame = window.requestAnimationFrame(() => {
      if (regionPickerInitialFocusTarget(presentation) === 'panel') panelRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [compact, open])

  useEffect(() => {
    if (!open) return
    const stopObserving = observeWorkspaceViewport(window, (geometry) => {
      setViewport(geometry)
      updatePosition()
    })
    const onScroll = () => updatePosition()
    window.addEventListener('scroll', onScroll, true)
    return () => {
      stopObserving()
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [compact, open])

  useEffect(() => {
    if (!open || !compact) return
    return lockWorkspaceDocumentScroll(window, document)
  }, [compact, open])

  useEffect(() => {
    if (!open || compact) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) cancel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [compact, open, values])

  const focusRegion = (direction: 'first' | 'last' | 'next' | 'previous') => {
    if (!entries.length) return
    const activeCode = [...rowRefs.current.entries()].find(([, row]) => row === document.activeElement)?.[0]
    const currentIndex = entries.findIndex((entry) => entry.code === activeCode)
    let nextIndex = 0
    if (direction === 'last') nextIndex = entries.length - 1
    else if (direction === 'next') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % entries.length
    else if (direction === 'previous') nextIndex = currentIndex < 0
      ? entries.length - 1
      : (currentIndex - 1 + entries.length) % entries.length
    rowRefs.current.get(entries[nextIndex].code as RegionCode)?.focus()
  }

  const onPanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusRegion(event.key === 'ArrowDown' ? 'next' : 'previous')
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusRegion(event.key === 'Home' ? 'first' : 'last')
      return
    }
    if (event.key !== 'Tab' || !compact) return
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const summary = regionPickerSummary(
    values,
    locale,
    t('inspector.filterRegionTriggerEmpty'),
    (count) => t('inspector.filterSelectedCount', { count }),
  )
  const panelStyle = compact ? {
    top: viewport.offsetTop + viewport.height - layout.panelHeight,
    height: layout.panelHeight,
  } : position ? {
    ...position,
    height: layout.panelHeight,
    maxHeight: layout.panelHeight,
  } : undefined
  const backdropStyle = compact ? {
    top: viewport.offsetTop,
    height: viewport.height,
  } : undefined
  const listStyle: CSSProperties = { height: layout.listHeight, maxHeight: layout.listHeight }
  const canRender = compact || position

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="region-picker-trigger"
      aria-label={t('inspector.filterRegionPickerTitle')}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => open ? cancel() : openPicker()}
    >
      {!values.length && <Search size={16} aria-hidden="true" />}
      <span>{summary}</span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
    {open && canRender && createPortal(<>
      {compact && <div
        className="region-picker-backdrop"
        style={backdropStyle}
        role="presentation"
        onPointerDown={cancel}
      />}
      <section
        ref={panelRef}
        className={`region-picker-panel is-${presentation}`}
        style={panelStyle}
        role="dialog"
        aria-modal={compact ? true : undefined}
        aria-label={t('inspector.filterRegionPickerTitle')}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={onPanelKeyDown}
      >
        <header className="region-picker-header">
          <strong>{t('inspector.filterRegionPickerTitle')}</strong>
          <button type="button" aria-label={t('inspector.filterRegionClose')} onClick={cancel}><X size={18} /></button>
        </header>
        <label className="region-picker-search">
          <span className="sr-only">{t('inspector.filterRegionSearch')}</span>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            placeholder={t('inspector.filterRegionSearch')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="region-picker-selection-summary">
          <span>{t('inspector.filterSelectedCount', { count: selection.draft.length })}</span>
          <button
            type="button"
            disabled={!selection.draft.length}
            onClick={() => setSelection((current) => clearRegionSelectionDraft(current))}
          >
            {t('inspector.filterClear')}
          </button>
        </div>
        <div
          className="region-picker-options"
          style={listStyle}
          role="listbox"
          aria-label={t('inspector.filterRegionPickerTitle')}
          aria-multiselectable="true"
        >
          {entries.map((entry) => {
            const code = entry.code as RegionCode
            const selected = selection.draft.includes(code)
            return <button
              ref={(row) => {
                if (row) rowRefs.current.set(code, row)
                else rowRefs.current.delete(code)
              }}
              type="button"
              role="option"
              aria-selected={selected}
              className={selected ? 'is-selected' : ''}
              key={code}
              onClick={() => setSelection((current) => toggleRegionSelectionDraft(current, code))}
            >
              <span>{entry.flag}</span>
              <strong>{locale === 'zh-CN' ? entry.zh : entry.en}</strong>
              <code>{code}</code>
              {selected && <Check size={16} aria-hidden="true" />}
            </button>
          })}
          {!entries.length && <span className="region-picker-empty">{t('inspector.filterNoRegions')}</span>}
        </div>
        <footer className="region-picker-footer">
          <button type="button" onClick={cancel}>{t('workspace.cancel')}</button>
          <button type="button" className="is-primary" onClick={() => {
            onChange(commitRegionSelectionDraft(selection))
            close()
          }}>{t('inspector.filterRegionDone', { count: selection.draft.length })}</button>
        </footer>
      </section>
    </>, document.body)}
  </>
}
