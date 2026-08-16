import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import {
  clampPanelWidth, fitPanelWidths, INSPECTOR_PANEL, LIBRARY_PANEL, type PanelSizeConfig,
} from './panelSizing'

const LIBRARY_WIDTH_KEY = 'proxyflow.ui.libraryWidth'
const INSPECTOR_WIDTH_KEY = 'proxyflow.ui.inspectorWidth'

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

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fitted = useMemo(
    () => fitPanelWidths(viewportWidth - 20, libraryWidth, inspectorWidth),
    [inspectorWidth, libraryWidth, viewportWidth],
  )
  const style = {
    '--library-width': `${fitted.libraryWidth}px`,
    '--inspector-width': `${fitted.inspectorWidth}px`,
  } as CSSProperties

  return <div className="workspace" style={style}>
    {library}
    <ResizeHandle
      side="left"
      label={t('layout.resizeLibrary')}
      width={libraryWidth}
      config={LIBRARY_PANEL}
      onChange={setLibraryWidth}
    />
    {canvas}
    <ResizeHandle
      side="right"
      label={t('layout.resizeInspector')}
      width={inspectorWidth}
      config={INSPECTOR_PANEL}
      onChange={setInspectorWidth}
    />
    {inspector}
  </div>
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
