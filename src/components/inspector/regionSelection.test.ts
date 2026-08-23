import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { RegionMultiSelect } from './Inspector'
import {
  canonicalizeRegionSelection,
  clearRegionSelection,
  clearRegionSelectionDraft,
  commitRegionSelectionDraft,
  createRegionSelectionDraft,
  discardRegionSelectionDraft,
  toggleRegionSelection,
  toggleRegionSelectionDraft,
} from './regionSelection'

describe('region multi-selection', () => {
  it('selects one region and then multiple regions without replacing prior choices', () => {
    const one = toggleRegionSelection([], 'HK')
    expect(one).toEqual(['HK'])
    expect(toggleRegionSelection(one, 'JP')).toEqual(['HK', 'JP'])
  })

  it('toggles a selected region off', () => {
    expect(toggleRegionSelection(['HK', 'JP'], 'HK')).toEqual(['JP'])
  })

  it('clears all selections and canonicalizes the legacy UK alias', () => {
    expect(canonicalizeRegionSelection(['UK', 'GB', 'SG'])).toEqual(['GB', 'SG'])
    expect(clearRegionSelection()).toEqual([])
  })

  it('keeps only a button trigger inside the Inspector', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(RegionMultiSelect, {
      values: ['HK', 'JP'],
      onChange: () => undefined,
    })))
    expect(html).toContain('region-picker-trigger')
    expect(html).toContain('type="button"')
    expect(html).not.toContain('type="search"')
    expect(html).not.toContain('region-picker-options')
  })

  it('uses a draft model so Done commits and Cancel or close discards', () => {
    const opened = createRegionSelectionDraft(['JP'])
    const toggled = toggleRegionSelectionDraft(opened, 'HK')
    expect(toggled.draft).toEqual(['JP', 'HK'])
    expect(commitRegionSelectionDraft(toggled)).toEqual(['JP', 'HK'])
    expect(discardRegionSelectionDraft(toggled)).toEqual(['JP'])
  })

  it('clears only the draft until Done commits the empty selection', () => {
    const opened = createRegionSelectionDraft(['JP', 'HK'])
    const cleared = clearRegionSelectionDraft(opened)
    expect(cleared.draft).toEqual([])
    expect(discardRegionSelectionDraft(cleared)).toEqual(['JP', 'HK'])
    expect(commitRegionSelectionDraft(cleared)).toEqual([])
  })
})
