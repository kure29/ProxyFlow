import { describe, expect, it } from 'vitest'
import { initialProductNavigationState, productNavigationGroupFor, productNavigationGroups, productNavigationReducer, productNodeTabs } from './productNavigationModel'

describe('product navigation model', () => {
  it('starts a project in the source-first Nodes workflow', () => {
    expect(initialProductNavigationState).toMatchObject({
      workspaceSection: 'sources',
      lastNodeSection: 'sources',
    })
  })

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

  it('keeps the final IA as UI-only groupings over existing sections', () => {
    expect(productNavigationGroups).toEqual([
      { id: 'nodes', sections: ['sources', 'proxies', 'processing'] },
      { id: 'strategies', sections: ['strategies'] },
      { id: 'routing', sections: ['routing'] },
      { id: 'output', sections: ['export'] },
      { id: 'diagnostics', sections: ['inspect'] },
      { id: 'advanced', sections: ['dns'] },
    ])
    expect(productNavigationGroupFor('proxies')).toBe('nodes')
    expect(productNavigationGroupFor('strategies')).toBe('strategies')
    expect(productNavigationGroupFor('export')).toBe('output')
    expect(productNavigationGroupFor('overview')).toBeNull()
  })

  it('keeps the Nodes tabs source-first while retaining existing section ids', () => {
    expect(productNodeTabs).toEqual([
      { section: 'sources', label: 'workspace.subscriptionSources' },
      { section: 'proxies', label: 'workspace.nodeList' },
      { section: 'processing', label: 'workspace.processing' },
    ])
  })
})
