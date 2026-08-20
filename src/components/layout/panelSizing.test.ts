import { describe, expect, it } from 'vitest'
import { clampPanelWidth, fitPanelWidths, INSPECTOR_PANEL, LIBRARY_PANEL, readStoredPanelWidth } from './panelSizing'

describe('panel sizing', () => {
  it('restores valid preferences and rejects corrupt or out-of-range storage', () => {
    const storage = (value: string | null) => ({ getItem: () => value })
    expect(readStoredPanelWidth(storage('312'), 'left', LIBRARY_PANEL)).toBe(312)
    expect(readStoredPanelWidth(storage('NaN'), 'left', LIBRARY_PANEL)).toBe(220)
    expect(readStoredPanelWidth(storage('120'), 'left', LIBRARY_PANEL)).toBe(220)
    expect(readStoredPanelWidth(storage(null), 'right', INSPECTOR_PANEL)).toBe(360)
  })

  it('preserves the canvas minimum while respecting panel minimums', () => {
    expect(fitPanelWidths(1440, 360, 480)).toEqual({ libraryWidth: 360, inspectorWidth: 480 })
    expect(fitPanelWidths(1000, 360, 480)).toEqual({ libraryWidth: 240, inspectorWidth: 360 })
    expect(fitPanelWidths(800, 360, 480)).toEqual({ libraryWidth: 200, inspectorWidth: 320 })
  })

  it('clamps direct resize input to each panel boundary', () => {
    expect(clampPanelWidth(120, LIBRARY_PANEL)).toBe(200)
    expect(clampPanelWidth(900, LIBRARY_PANEL)).toBe(360)
    expect(clampPanelWidth(120, INSPECTOR_PANEL)).toBe(320)
    expect(clampPanelWidth(900, INSPECTOR_PANEL)).toBe(480)
  })
})
