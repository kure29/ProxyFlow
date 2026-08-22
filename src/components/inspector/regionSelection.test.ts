import { describe, expect, it } from 'vitest'
import { canonicalizeRegionSelection, clearRegionSelection, toggleRegionSelection } from './regionSelection'

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
})
