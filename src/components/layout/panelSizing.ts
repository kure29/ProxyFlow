export interface PanelSizeConfig {
  defaultWidth: number
  minWidth: number
  maxWidth: number
}

export const LIBRARY_PANEL: PanelSizeConfig = { defaultWidth: 300, minWidth: 260, maxWidth: 520 }
export const INSPECTOR_PANEL: PanelSizeConfig = { defaultWidth: 390, minWidth: 320, maxWidth: 620 }
export const MIN_CANVAS_WIDTH = 480

export function clampPanelWidth(width: number, config: PanelSizeConfig) {
  if (!Number.isFinite(width)) return config.defaultWidth
  return Math.min(config.maxWidth, Math.max(config.minWidth, Math.round(width)))
}

export function readStoredPanelWidth(storage: Pick<Storage, 'getItem'>, key: string, config: PanelSizeConfig) {
  const raw = storage.getItem(key)
  if (raw === null || raw.trim() === '') return config.defaultWidth
  const width = Number(raw)
  return Number.isFinite(width) && width >= config.minWidth && width <= config.maxWidth
    ? Math.round(width)
    : config.defaultWidth
}

export function fitPanelWidths(
  availableWidth: number,
  libraryWidth: number,
  inspectorWidth: number,
  canvasMinWidth = MIN_CANVAS_WIDTH,
) {
  const maximumPanelsWidth = Math.max(0, availableWidth - canvasMinWidth)
  if (libraryWidth + inspectorWidth <= maximumPanelsWidth) return { libraryWidth, inspectorWidth }
  const minimumPanelsWidth = LIBRARY_PANEL.minWidth + INSPECTOR_PANEL.minWidth
  if (maximumPanelsWidth <= minimumPanelsWidth) {
    return { libraryWidth: LIBRARY_PANEL.minWidth, inspectorWidth: INSPECTOR_PANEL.minWidth }
  }
  const excess = libraryWidth + inspectorWidth - maximumPanelsWidth
  const libraryCapacity = Math.max(0, libraryWidth - LIBRARY_PANEL.minWidth)
  const inspectorCapacity = Math.max(0, inspectorWidth - INSPECTOR_PANEL.minWidth)
  const totalCapacity = libraryCapacity + inspectorCapacity
  const libraryReduction = totalCapacity === 0 ? 0 : excess * (libraryCapacity / totalCapacity)
  return {
    libraryWidth: Math.round(Math.max(LIBRARY_PANEL.minWidth, libraryWidth - libraryReduction)),
    inspectorWidth: Math.round(Math.max(INSPECTOR_PANEL.minWidth, maximumPanelsWidth - Math.max(LIBRARY_PANEL.minWidth, libraryWidth - libraryReduction))),
  }
}
