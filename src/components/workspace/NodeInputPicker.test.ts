import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  NodeInputPicker,
  normalizeNodeInputSelection,
  resolveNodeInputPickerPresentation,
  restoreNodeInputPickerFocus,
  shouldDismissNodeInputPicker,
  toggleNodeInputSelection,
} from './NodeInputPicker'

describe('NodeInputPicker', () => {
  it('keeps single mode single-input and supports clearing the selection', () => {
    expect(toggleNodeInputSelection('single', ['source-a'], 'source-b')).toEqual(['source-b'])
    expect(toggleNodeInputSelection('single', ['source-a'], '')).toEqual([])
  })

  it('adds and removes multiple inputs without duplicate ids', () => {
    expect(toggleNodeInputSelection('multiple', ['source-a'], 'source-b')).toEqual(['source-a', 'source-b'])
    expect(toggleNodeInputSelection('multiple', ['source-a', 'source-b'], 'source-a')).toEqual(['source-b'])
    expect(normalizeNodeInputSelection(['source-a', 'source-a', '', 'source-b'])).toEqual(['source-a', 'source-b'])
  })

  it('does not select a disabled candidate but allows a retained selection to be removed', () => {
    expect(toggleNodeInputSelection('multiple', ['source-a'], 'source-b', true)).toEqual(['source-a'])
    expect(toggleNodeInputSelection('multiple', ['source-a'], 'source-a', true)).toEqual([])
  })

  it('uses a popover on desktop and a sheet on mobile and tablet widths', () => {
    expect(resolveNodeInputPickerPresentation(1440)).toBe('popover')
    expect(resolveNodeInputPickerPresentation(1024)).toBe('popover')
    expect(resolveNodeInputPickerPresentation(768)).toBe('sheet')
    expect(resolveNodeInputPickerPresentation(430)).toBe('sheet')
  })

  it('dismisses on Escape and restores focus through the supplied scheduler', () => {
    expect(shouldDismissNodeInputPicker('Escape')).toBe(true)
    expect(shouldDismissNodeInputPicker('Enter')).toBe(false)
    const focus = vi.fn()
    const schedule = vi.fn((callback: () => void) => callback())
    restoreNodeInputPickerFocus({ focus }, schedule)
    expect(schedule).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('renders one reusable full-row trigger without native checkbox UI', () => {
    const html = renderToStaticMarkup(createElement(NodeInputPicker, {
      mode: 'multiple',
      selectedIds: ['source-a'],
      candidates: [{ id: 'source-a', label: 'Source A' }],
      label: 'Choose node source',
      summary: '1 source selected',
      searchPlaceholder: 'Search',
      emptyMessage: 'Empty',
      cancelLabel: 'Cancel',
      doneLabel: (count: number) => `Done · ${count}`,
      closeLabel: 'Close',
      unavailableLabel: 'Unavailable',
      onChange: () => undefined,
    }))
    expect(html).toContain('node-input-picker-trigger')
    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).not.toContain('type="checkbox"')
  })
})
