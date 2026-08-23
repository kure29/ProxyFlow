import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Circle, CircleDot, Square, SquareCheckBig, X } from 'lucide-react'
import { resolveShellMode } from '../layout/shellState'
import { positionViewportPopover, readPopoverViewport } from '../ui/viewportPopover'
import { lockWorkspaceDocumentScroll } from './workspaceEditorLifecycle'
import {
  observeWorkspaceViewport,
  readWorkspaceViewportGeometry,
  type WorkspaceViewportGeometry,
} from './workspaceEditorViewport'

export type NodeInputPickerMode = 'single' | 'multiple'

export interface NodeInputPickerCandidate {
  id: string
  label: string
  meta?: string
  disabled?: boolean
  unavailable?: boolean
}

interface NodeInputPickerProps {
  mode: NodeInputPickerMode
  selectedIds: readonly string[]
  candidates: readonly NodeInputPickerCandidate[]
  label: string
  summary: string
  searchPlaceholder: string
  emptyMessage: string
  cancelLabel: string
  doneLabel: (count: number) => string
  closeLabel: string
  unavailableLabel: string
  onChange: (selectedIds: string[]) => void
}

interface PickerPosition {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

export function normalizeNodeInputSelection(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))]
}

export function toggleNodeInputSelection(
  mode: NodeInputPickerMode,
  selectedIds: readonly string[],
  candidateId: string,
  disabled = false,
): string[] {
  const selected = normalizeNodeInputSelection(selectedIds)
  const alreadySelected = selected.includes(candidateId)
  if (disabled && !alreadySelected) return selected
  if (mode === 'single') return candidateId ? [candidateId] : []
  return alreadySelected
    ? selected.filter((id) => id !== candidateId)
    : normalizeNodeInputSelection([...selected, candidateId])
}

export function resolveNodeInputPickerPresentation(width: number): 'popover' | 'sheet' {
  return resolveShellMode(width) === 'desktop' ? 'popover' : 'sheet'
}

export function shouldDismissNodeInputPicker(key: string): boolean {
  return key === 'Escape'
}

export function restoreNodeInputPickerFocus(
  trigger: Pick<HTMLElement, 'focus'> | null,
  schedule: (callback: () => void) => unknown,
) {
  schedule(() => trigger?.focus())
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function NodeInputPicker({
  mode,
  selectedIds,
  candidates,
  label,
  summary,
  searchPlaceholder,
  emptyMessage,
  cancelLabel,
  doneLabel,
  closeLabel,
  unavailableLabel,
  onChange,
}: NodeInputPickerProps) {
  const listboxId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const [open, setOpen] = useState(false)
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && resolveNodeInputPickerPresentation(window.innerWidth) === 'sheet'
  ))
  const [draftIds, setDraftIds] = useState(() => normalizeNodeInputSelection(selectedIds))
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PickerPosition | null>(null)
  const [viewport, setViewport] = useState<WorkspaceViewportGeometry>(() => (
    typeof window === 'undefined'
      ? { height: 800, offsetTop: 0 }
      : readWorkspaceViewportGeometry(window)
  ))

  const visibleCandidates = useMemo(() => {
    const normalizedQuery = normalizeSearch(query)
    if (!normalizedQuery) return candidates
    return candidates.filter((candidate) => (
      `${candidate.label} ${candidate.meta ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
    ))
  }, [candidates, query])

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger || compact) return
    setPosition(positionViewportPopover(trigger.getBoundingClientRect(), readPopoverViewport(), {
      preferredWidth: 360,
      maxHeight: 480,
      minPreferredHeight: 260,
      viewportPadding: 12,
      gap: 8,
      matchAnchorWidth: true,
    }))
  }

  const restoreTriggerFocus = () => {
    restoreNodeInputPickerFocus(triggerRef.current, (callback) => window.requestAnimationFrame(callback))
  }

  const close = (restoreFocus = true) => {
    setOpen(false)
    setQuery('')
    if (restoreFocus) restoreTriggerFocus()
  }

  const cancel = () => {
    setDraftIds(normalizeNodeInputSelection(selectedIds))
    close()
  }

  const openPicker = () => {
    setDraftIds(normalizeNodeInputSelection(selectedIds))
    setQuery('')
    setOpen(true)
  }

  const choose = (candidate: NodeInputPickerCandidate) => {
    const next = toggleNodeInputSelection(mode, draftIds, candidate.id, candidate.disabled)
    setDraftIds(next)
    if (mode === 'single') {
      onChange(next)
      close()
    }
  }

  useEffect(() => {
    if (!open) setDraftIds(normalizeNodeInputSelection(selectedIds))
  }, [open, selectedIds])

  useEffect(() => {
    const updatePresentation = () => setCompact(resolveNodeInputPickerPresentation(window.innerWidth) === 'sheet')
    window.addEventListener('resize', updatePresentation)
    return () => window.removeEventListener('resize', updatePresentation)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const frame = window.requestAnimationFrame(() => {
      if (candidates.length > 6) searchRef.current?.focus()
      else panelRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [compact, open])

  useEffect(() => {
    if (!open) return
    const stopObservingViewport = observeWorkspaceViewport(window, (geometry) => {
      setViewport(geometry)
      updatePosition()
    })
    const onScroll = () => updatePosition()
    window.addEventListener('scroll', onScroll, true)
    return () => {
      stopObservingViewport()
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
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [compact, open])

  const focusCandidate = (direction: 'first' | 'last' | 'next' | 'previous') => {
    const selectable = visibleCandidates.filter((candidate) => (
      !candidate.disabled || draftIds.includes(candidate.id)
    ))
    if (!selectable.length) return
    const activeId = [...rowRefs.current.entries()].find(([, element]) => element === document.activeElement)?.[0]
    const activeIndex = selectable.findIndex((candidate) => candidate.id === activeId)
    let nextIndex = 0
    if (direction === 'last') nextIndex = selectable.length - 1
    else if (direction === 'next') nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % selectable.length
    else if (direction === 'previous') nextIndex = activeIndex < 0
      ? selectable.length - 1
      : (activeIndex - 1 + selectable.length) % selectable.length
    rowRefs.current.get(selectable[nextIndex].id)?.focus()
  }

  const onPanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation()
    if (shouldDismissNodeInputPicker(event.key)) {
      event.preventDefault()
      cancel()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusCandidate(event.key === 'ArrowDown' ? 'next' : 'previous')
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusCandidate(event.key === 'Home' ? 'first' : 'last')
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

  const popoverStyle: CSSProperties | undefined = compact ? {
    top: viewport.offsetTop + Math.max(0, viewport.height - Math.min(620, viewport.height * 0.78)),
    maxHeight: Math.min(620, viewport.height * 0.78),
  } : position ?? undefined
  const backdropStyle = compact ? {
    top: viewport.offsetTop,
    height: viewport.height,
  } : undefined
  const canRenderPanel = compact || position

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="node-input-picker-trigger"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      onClick={() => open ? close(false) : openPicker()}
      onKeyDown={(event) => {
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault()
          openPicker()
        }
      }}
    >
      <span>{summary}</span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
    {open && canRenderPanel && createPortal(<>
      {compact && <div
        className="node-input-picker-backdrop"
        style={backdropStyle}
        role="presentation"
        onPointerDown={cancel}
      />}
      <section
        ref={panelRef}
        className={`node-input-picker-panel ${compact ? 'is-sheet' : 'is-popover'}`}
        style={popoverStyle}
        role={compact ? 'dialog' : 'presentation'}
        aria-modal={compact ? true : undefined}
        aria-label={label}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={onPanelKeyDown}
      >
        <header className="node-input-picker-header">
          <strong>{label}</strong>
          <button type="button" aria-label={closeLabel} onClick={cancel}><X size={18} /></button>
        </header>
        {candidates.length > 6 && <label className="node-input-picker-search">
          <span className="sr-only">{searchPlaceholder}</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            enterKeyHint="search"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>}
        <div
          id={listboxId}
          className="node-input-picker-options"
          role="listbox"
          aria-label={label}
          aria-multiselectable={mode === 'multiple' ? true : undefined}
        >
          {visibleCandidates.length === 0 && <span className="node-input-picker-empty">{emptyMessage}</span>}
          {visibleCandidates.map((candidate) => {
            const selected = draftIds.includes(candidate.id)
            const disabled = Boolean(candidate.disabled && !selected)
            return <button
              ref={(element) => {
                if (element) rowRefs.current.set(candidate.id, element)
                else rowRefs.current.delete(candidate.id)
              }}
              type="button"
              role="option"
              aria-selected={selected}
              className={`${selected ? 'is-selected' : ''}${candidate.unavailable ? ' is-unavailable' : ''}`}
              disabled={disabled}
              key={candidate.id || '__no-input__'}
              onClick={() => choose(candidate)}
            >
              <span className="node-input-picker-mark" aria-hidden="true">
                {mode === 'single'
                  ? selected ? <CircleDot size={17} /> : <Circle size={16} />
                  : selected ? <SquareCheckBig size={17} /> : <Square size={16} />}
              </span>
              <span className="node-input-picker-copy">
                <strong>{candidate.label}</strong>
                {(candidate.meta || candidate.unavailable) && <small>
                  {candidate.unavailable ? unavailableLabel : candidate.meta}
                </small>}
              </span>
            </button>
          })}
        </div>
        {mode === 'multiple' && <footer className="node-input-picker-footer">
          <button type="button" onClick={cancel}>{cancelLabel}</button>
          <button type="button" className="is-primary" onClick={() => {
            onChange(normalizeNodeInputSelection(draftIds))
            close()
          }}>{doneLabel(draftIds.length)}</button>
        </footer>}
      </section>
    </>, document.body)}
  </>
}
