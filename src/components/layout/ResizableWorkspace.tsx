import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen, Plus, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import { IconButton } from '../ui/Primitives'
import {
  clampPanelWidth, fitPanelWidths, INSPECTOR_PANEL, LIBRARY_PANEL, type PanelSizeConfig,
} from './panelSizing'
import { resolveShellMode, type ShellMode } from './shellState'

const LIBRARY_WIDTH_KEY = 'proxyflow.ui.libraryWidth.v2'
const INSPECTOR_WIDTH_KEY = 'proxyflow.ui.inspectorWidth.v2'
const LIBRARY_COLLAPSED_KEY = 'proxyflow.ui.libraryCollapsed'
const LIBRARY_RAIL_WIDTH = 48

interface ResizableWorkspaceProps {
  library: ReactNode
  canvas: ReactNode
  inspector: ReactNode
}

export function ResizableWorkspace({ library, canvas, inspector }: ResizableWorkspaceProps) {
  const { t } = useI18n()
  const [libraryWidth, setLibraryWidth] = useStoredWidth(LIBRARY_WIDTH_KEY, LIBRARY_PANEL)
  const [inspectorWidth, setInspectorWidth] = useStoredWidth(INSPECTOR_WIDTH_KEY, INSPECTOR_PANEL)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [shellMode, setShellMode] = useState<ShellMode>(() => resolveShellMode(window.innerWidth))
  const [libraryCollapsed, setLibraryCollapsed] = useState(() => (
    resolveShellMode(window.innerWidth) !== 'desktop' || window.localStorage.getItem(LIBRARY_COLLAPSED_KEY) === 'true'
  ))
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId)
  const selectedEdgeId = useBuilderStore((state) => state.selectedEdgeId)
  const selectNode = useBuilderStore((state) => state.selectNode)
  const selectEdge = useBuilderStore((state) => state.selectEdge)
  const inspectorOpen = Boolean(selectedNodeId || selectedEdgeId)
  const addNodeTriggerRef = useRef<HTMLButtonElement>(null)
  const libraryPanelRef = useRef<HTMLDivElement>(null)
  const inspectorPanelRef = useRef<HTMLDivElement>(null)
  const focusReturnRef = useRef<HTMLElement | null>(null)
  const previousMobileSheetRef = useRef<'library' | 'inspector' | null>(null)
  const mobileSheet = shellMode === 'mobile'
    ? !libraryCollapsed ? 'library' : inspectorOpen ? 'inspector' : null
    : null

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth)
      const nextMode = resolveShellMode(window.innerWidth)
      setShellMode(nextMode)
      if (nextMode !== 'desktop') setLibraryCollapsed(true)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fitted = useMemo(() => {
    if (shellMode !== 'desktop') return { libraryWidth: LIBRARY_RAIL_WIDTH, inspectorWidth }
    if (libraryCollapsed) return { libraryWidth: LIBRARY_RAIL_WIDTH, inspectorWidth }
    if (!inspectorOpen) return { libraryWidth, inspectorWidth: 0 }
    return fitPanelWidths(viewportWidth - 20, libraryWidth, inspectorWidth)
  }, [inspectorOpen, inspectorWidth, libraryCollapsed, libraryWidth, shellMode, viewportWidth])
  const style = {
    '--library-width': `${fitted.libraryWidth}px`,
    '--inspector-width': `${inspectorOpen ? fitted.inspectorWidth : 0}px`,
  } as CSSProperties
  const toggleLibrary = () => {
    setLibraryCollapsed((current) => {
      const next = !current
      if (shellMode === 'desktop') window.localStorage.setItem(LIBRARY_COLLAPSED_KEY, String(next))
      return next
    })
  }
  const dismissInspector = () => dismissInspectorSelection(
    { selectedNodeId, selectedEdgeId },
    { selectNode, selectEdge },
  )

  useEffect(() => {
    if (!inspectorOpen || shellMode !== 'tablet') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      dismissInspector()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [inspectorOpen, selectedEdgeId, selectedNodeId, selectEdge, selectNode, shellMode])

  useEffect(() => {
    if (shellMode === 'mobile' && inspectorOpen && !libraryCollapsed) setLibraryCollapsed(true)
  }, [inspectorOpen, libraryCollapsed, shellMode])

  useEffect(() => {
    const previousSheet = previousMobileSheetRef.current
    if (mobileSheet && !previousSheet) focusReturnRef.current = document.activeElement as HTMLElement
    if (!mobileSheet && previousSheet) {
      const returnTarget = focusReturnRef.current
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => (
        previousSheet === 'library'
          ? addNodeTriggerRef.current
          : returnTarget?.isConnected ? returnTarget : addNodeTriggerRef.current
      )?.focus()))
      focusReturnRef.current = null
    }
    previousMobileSheetRef.current = mobileSheet
  }, [mobileSheet])

  useEffect(() => {
    if (!mobileSheet) return
    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const panel = mobileSheet === 'library' ? libraryPanelRef.current : inspectorPanelRef.current
    const focusFrame = window.requestAnimationFrame(() => panel?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        mobileSheet === 'library' ? setLibraryCollapsed(true) : dismissInspector()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(panel?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])
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
    }
  }, [mobileSheet, selectedEdgeId, selectedNodeId, selectEdge, selectNode])

  return <div
    className={`workspace${libraryCollapsed ? ' is-library-collapsed' : ''}${inspectorOpen ? ' has-inspector' : ''}`}
    data-shell-mode={shellMode}
    style={style}
  >
    {mobileSheet && <div className="visual-flow-sheet-backdrop" onMouseDown={() => mobileSheet === 'library' ? setLibraryCollapsed(true) : dismissInspector()} />}
    <div
      ref={libraryPanelRef}
      className={`visual-library-panel${libraryCollapsed ? ' is-collapsed' : ''}`}
      role={mobileSheet === 'library' ? 'dialog' : undefined}
      aria-modal={mobileSheet === 'library' ? true : undefined}
      aria-label={mobileSheet === 'library' ? t('library.title') : undefined}
    >
      <IconButton
        className="palette-toggle"
        label={libraryCollapsed ? t('library.title') : t('layout.closeLibrary')}
        aria-expanded={!libraryCollapsed}
        onClick={toggleLibrary}
      >{libraryCollapsed ? <PanelLeftOpen size={18} /> : shellMode === 'mobile' ? <X size={18} /> : <PanelLeftClose size={18} />}</IconButton>
      <div className="visual-library-content" aria-hidden={libraryCollapsed}>{library}</div>
    </div>
    {!libraryCollapsed && shellMode === 'desktop' && <ResizeHandle
      side="left"
      label={t('layout.resizeLibrary')}
      width={libraryWidth}
      config={LIBRARY_PANEL}
      onChange={setLibraryWidth}
    />}
    {canvas}
    {shellMode === 'mobile' && libraryCollapsed && !inspectorOpen && <button ref={addNodeTriggerRef} type="button" className="visual-flow-add-node" onClick={() => setLibraryCollapsed(false)}><Plus size={18} />{t('layout.addNode')}</button>}
    {inspectorOpen && shellMode === 'desktop' && <ResizeHandle
      side="right"
      label={t('layout.resizeInspector')}
      width={inspectorWidth}
      config={INSPECTOR_PANEL}
      onChange={setInspectorWidth}
    />}
    {inspectorOpen && <div
      ref={inspectorPanelRef}
      className="visual-inspector-panel"
      role={mobileSheet === 'inspector' ? 'dialog' : undefined}
      aria-modal={mobileSheet === 'inspector' ? true : undefined}
      aria-label={mobileSheet === 'inspector' ? t('inspector.title') : undefined}
    >
      <div className="visual-inspector-toolbar">
        <strong>{t('inspector.title')}</strong>
        <IconButton className="visual-inspector-dismiss" label={t('layout.closeInspector')} autoFocus={shellMode !== 'desktop'} onClick={dismissInspector}><X size={18} /></IconButton>
      </div>
      {inspector}
    </div>}
  </div>
}

export function dismissInspectorSelection(
  selection: { selectedNodeId: string | null; selectedEdgeId: string | null },
  actions: {
    selectNode: (id: string | null) => void
    selectEdge: (id: string | null) => void
  },
) {
  if (selection.selectedNodeId) actions.selectNode(null)
  else if (selection.selectedEdgeId) actions.selectEdge(null)
}

function useStoredWidth(key: string, config: PanelSizeConfig) {
  const [width, setWidth] = useState(() => {
    const raw = window.localStorage.getItem(key)
    const numeric = raw === null || raw.trim() === '' ? config.defaultWidth : Number(raw)
    return Number.isFinite(numeric) && numeric >= config.minWidth && numeric <= config.maxWidth
      ? Math.round(numeric)
      : config.defaultWidth
  })
  const update = (nextWidth: number) => {
    const safeWidth = clampPanelWidth(nextWidth, config)
    setWidth(safeWidth)
    window.localStorage.setItem(key, String(safeWidth))
  }
  return [width, update] as const
}

function ResizeHandle({ side, label, width, config, onChange }: {
  side: 'left' | 'right'
  label: string
  width: number
  config: PanelSizeConfig
  onChange: (width: number) => void
}) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = width
    document.body.classList.add('is-resizing-panel')
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX
      onChange(startWidth + (side === 'left' ? delta : -delta))
    }
    const onEnd = () => {
      document.body.classList.remove('is-resizing-panel')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd, { once: true })
    window.addEventListener('pointercancel', onEnd, { once: true })
  }
  return <div
    className={`panel-resizer panel-resizer--${side}`}
    role="separator"
    aria-label={label}
    aria-orientation="vertical"
    aria-valuemin={config.minWidth}
    aria-valuemax={config.maxWidth}
    aria-valuenow={width}
    tabIndex={0}
    onPointerDown={onPointerDown}
    onDoubleClick={() => onChange(config.defaultWidth)}
    onKeyDown={(event) => {
      if (event.key === 'Home') onChange(config.minWidth)
      else if (event.key === 'End') onChange(config.maxWidth)
      else if (event.key === 'ArrowLeft') onChange(width + (side === 'left' ? -16 : 16))
      else if (event.key === 'ArrowRight') onChange(width + (side === 'left' ? 16 : -16))
      else return
      event.preventDefault()
    }}
  ><span /></div>
}
