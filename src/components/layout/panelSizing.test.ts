import { describe, expect, it } from 'vitest'
import { clampPanelWidth, fitPanelWidths, INSPECTOR_PANEL, LIBRARY_PANEL, readStoredPanelWidth } from './panelSizing'

describe('panel sizing', () => {
  it('restores valid preferences and rejects corrupt or out-of-range storage', () => {
    const storage = (value: string | null) => ({ getItem: () => value })
    expect(readStoredPanelWidth(storage('412'), 'left', LIBRARY_PANEL)).toBe(412)
    expect(readStoredPanelWidth(storage('NaN'), 'left', LIBRARY_PANEL)).toBe(300)
    expect(readStoredPanelWidth(storage('120'), 'left', LIBRARY_PANEL)).toBe(300)
    expect(readStoredPanelWidth(storage(null), 'right', INSPECTOR_PANEL)).toBe(390)
  })

  it('preserves the canvas minimum while respecting panel minimums', () => {
    expect(fitPanelWidths(1440, 520, 620)).toEqual({ libraryWidth: 436, inspectorWidth: 524 })
    expect(fitPanelWidths(1920, 520, 620)).toEqual({ libraryWidth: 520, inspectorWidth: 620 })
    expect(fitPanelWidths(1000, 520, 620)).toEqual({ libraryWidth: 260, inspectorWidth: 320 })
  })

  it('clamps direct resize input to each panel boundary', () => {
    expect(clampPanelWidth(120, LIBRARY_PANEL)).toBe(260)
    expect(clampPanelWidth(900, LIBRARY_PANEL)).toBe(520)
    expect(clampPanelWidth(120, INSPECTOR_PANEL)).toBe(320)
    expect(clampPanelWidth(900, INSPECTOR_PANEL)).toBe(620)
  })
})
