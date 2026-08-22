import { describe, expect, it } from 'vitest'
import { initialProductNavigationState, productNavigationReducer } from './productNavigationModel'

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
})
