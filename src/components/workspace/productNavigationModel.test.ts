import { describe, expect, it } from 'vitest'
import { initialProductNavigationState, productNavigationGroupFor, productNavigationGroups, productNavigationReducer } from './productNavigationModel'

describe('product navigation model', () => {
  it('preserves the configuration section across Blueprint mode', () => {
    const configured = productNavigationReducer(initialProductNavigationState, { type: 'open-section', section: 'routing' })
    const blueprint = productNavigationReducer(configured, { type: 'set-view', view: 'visual-flow' })
    expect(blueprint).toEqual({ ...configured, view: 'visual-flow' })
    expect(productNavigationReducer(blueprint, { type: 'set-view', view: 'workspace' })).toEqual(configured)
  })

  it('updates lastNodeSection only when entering a node section', () => {
    const initial = productNavigationReducer(initialProductNavigationState, { type: 'open-section', section: 'sources' })
    expect(initial.lastNodeSection).toBe('sources')
    expect(productNavigationReducer(initial, { type: 'open-section', section: 'inspect' }).lastNodeSection).toBe('sources')
  })

  it('keeps the simplified IA as UI-only groupings over existing sections', () => {
    expect(productNavigationGroups).toEqual([
      { id: 'shared-policy', sections: ['sources', 'proxies', 'processing', 'strategies', 'routing'] },
      { id: 'client-output', sections: ['export'] },
      { id: 'review-advanced', sections: ['inspect', 'dns'] },
    ])
    expect(productNavigationGroupFor('strategies')).toBe('shared-policy')
    expect(productNavigationGroupFor('export')).toBe('client-output')
    expect(productNavigationGroupFor('overview')).toBeNull()
  })
})
