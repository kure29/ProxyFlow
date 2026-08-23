import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { REGION_CATALOG } from '../../core/proxy'
import { I18nProvider } from '../../i18n'
import {
  RegionPicker,
  regionPickerEntries,
  regionPickerInitialFocusTarget,
  regionPickerSummary,
  resolveRegionPickerLayout,
  resolveRegionPickerPresentation,
  restoreRegionPickerFocus,
} from './RegionPicker'

describe('RegionPicker', () => {
  it('renders a compact button trigger without an inline search input', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(RegionPicker, {
      values: [],
      onChange: () => undefined,
    })))
    expect(html).toContain('region-picker-trigger')
    expect(html).toContain('type="button"')
    expect(html).not.toContain('type="search"')
    expect(html).not.toContain('region-picker-options')
  })

  it('keeps the complete catalog available while bounding the normal list to about five rows', () => {
    const entries = regionPickerEntries('', 'en-US')
    const layout = resolveRegionPickerLayout(932, 'sheet')
    expect(entries).toHaveLength(REGION_CATALOG.length)
    expect(entries.slice(0, 5).map((entry) => entry.code)).toEqual(['HK', 'JP', 'SG', 'US', 'CN'])
    expect(layout.listHeight).toBe(240)
    expect(layout.approximateVisibleItems).toBe(5)
  })

  it('searches both localized names and ISO codes without case sensitivity', () => {
    expect(regionPickerEntries('日本', 'zh-CN')[0]?.code).toBe('JP')
    expect(regionPickerEntries('Japan', 'zh-CN')[0]?.code).toBe('JP')
    expect(regionPickerEntries('jp', 'en-US')[0]?.code).toBe('JP')
    expect(regionPickerEntries('JP', 'en-US')[0]?.code).toBe('JP')
  })

  it('shrinks only the list when the keyboard reduces available height and restores it on close', () => {
    const normal = resolveRegionPickerLayout(932, 'sheet')
    const keyboard = resolveRegionPickerLayout(520, 'sheet')
    const restored = resolveRegionPickerLayout(932, 'sheet')
    expect(normal.approximateVisibleItems).toBe(5)
    expect(keyboard.approximateVisibleItems).toBeGreaterThan(3)
    expect(keyboard.approximateVisibleItems).toBeLessThan(5)
    expect(keyboard.panelHeight).toBe(228 + keyboard.listHeight)
    expect(restored).toEqual(normal)
  })

  it('uses a mobile/tablet sheet and a compact desktop popover', () => {
    expect(resolveRegionPickerPresentation(430)).toBe('sheet')
    expect(resolveRegionPickerPresentation(768)).toBe('sheet')
    expect(resolveRegionPickerPresentation(1024)).toBe('popover')
    expect(resolveRegionPickerPresentation(1440)).toBe('popover')
    expect(resolveRegionPickerLayout(500, 'popover').approximateVisibleItems).toBe(5)
  })

  it('does not auto-focus Search when a mobile picker opens', () => {
    expect(regionPickerInitialFocusTarget('sheet')).toBe('panel')
    expect(regionPickerInitialFocusTarget('popover')).toBe('panel')
  })

  it('summarizes committed selections without growing the trigger', () => {
    const countLabel = (count: number) => `${count} selected`
    expect(regionPickerSummary([], 'en-US', 'Choose regions', countLabel)).toBe('Choose regions')
    expect(regionPickerSummary(['JP'], 'en-US', 'Choose regions', countLabel)).toBe('🇯🇵 Japan')
    expect(regionPickerSummary(['JP', 'HK'], 'en-US', 'Choose regions', countLabel)).toBe('🇯🇵 Japan · 🇭🇰 Hong Kong SAR China')
    expect(regionPickerSummary(['JP', 'HK', 'US'], 'en-US', 'Choose regions', countLabel)).toBe('3 selected')
  })

  it('restores focus to the trigger after close', () => {
    const focus = vi.fn()
    const schedule = vi.fn((callback: () => void) => callback())
    restoreRegionPickerFocus({ focus }, schedule)
    expect(schedule).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
  })
})
