import { describe, expect, it } from 'vitest'
import { initialProductNavigationState, productNavigationGroupFor, productNavigationGroups, productNavigationReducer, productNodeTabs, productPrimarySections, productSecondarySections, workspaceSectionForNode } from './productNavigationModel'
import { demoNodes } from '../../data/demoProject'

describe('product navigation model', () => {
  it('starts a project in the source-first configuration workflow', () => {
    expect(initialProductNavigationState).toMatchObject({
      workspaceSection: 'sources',
      lastNodeSection: 'sources',
    })
  })

  it('keeps the internal Canvas state isolated and returns to Workspace on section navigation', () => {
    const configured = productNavigationReducer(initialProductNavigationState, { type: 'open-section', section: 'routing' })
    const internalCanvas = productNavigationReducer(configured, { type: 'set-view', view: 'visual-flow' })
    expect(internalCanvas).toEqual({ ...configured, view: 'visual-flow' })
    expect(productNavigationReducer(internalCanvas, { type: 'open-section', section: 'routing' })).toEqual(configured)
  })

  it('updates lastNodeSection only when entering a node section', () => {
    const initial = productNavigationReducer(initialProductNavigationState, { type: 'open-section', section: 'sources' })
    expect(initial.lastNodeSection).toBe('sources')
    expect(productNavigationReducer(initial, { type: 'open-section', section: 'inspect' }).lastNodeSection).toBe('sources')
  })

  it('maps Settings to the existing DNS section without changing navigation state elsewhere', () => {
    const before = { ...initialProductNavigationState }
    const settings = productNavigationReducer(before, { type: 'open-section', section: 'dns' })
    expect(settings).toMatchObject({ view: 'workspace', workspaceSection: 'dns', lastNodeSection: 'sources' })
    expect(before).toEqual(initialProductNavigationState)
  })

  it('keeps the consolidated IA as UI-only groupings over existing sections', () => {
    expect(productNavigationGroups).toEqual([
      { id: 'nodes', sections: ['sources', 'proxies'] },
      { id: 'processing', sections: ['processing'] },
      { id: 'strategies', sections: ['strategies'] },
      { id: 'routing', sections: ['routing'] },
      { id: 'settings', sections: ['dns'] },
      { id: 'output', sections: ['export'] },
      { id: 'diagnostics', sections: ['inspect'] },
    ])
    expect(productNavigationGroupFor('proxies')).toBe('nodes')
    expect(productNavigationGroupFor('processing')).toBe('processing')
    expect(productNavigationGroupFor('strategies')).toBe('strategies')
    expect(productNavigationGroupFor('dns')).toBe('settings')
    expect(productNavigationGroupFor('export')).toBe('output')
    expect(productNavigationGroupFor('inspect')).toBe('diagnostics')
    expect(productNavigationGroupFor('overview')).toBeNull()
  })

  it('keeps Sources and proxy inventory nested while retaining section ids', () => {
    expect(productNodeTabs).toEqual([
      { section: 'sources', label: 'workspace.subscriptionSources' },
      { section: 'proxies', label: 'workspace.proxyInventory' },
    ])
  })

  it('exposes the consolidated authoring stages and secondary surfaces', () => {
    expect(productPrimarySections).toEqual(['sources', 'processing', 'strategies', 'routing', 'dns', 'export'])
    expect(productSecondarySections).toEqual(['overview', 'inspect'])
    expect(new Set([
      ...productPrimarySections,
      ...productSecondarySections,
      ...productNodeTabs.map(({ section }) => section),
    ])).toEqual(new Set(['overview', 'sources', 'proxies', 'processing', 'strategies', 'routing', 'dns', 'inspect', 'export']))
  })

  it('routes diagnostic node locations into Structured Workspace sections', () => {
    const sections = Object.fromEntries(demoNodes.map((node) => [node.data.category, workspaceSectionForNode(node)]))
    expect(sections).toMatchObject({
      source: 'sources', processing: 'processing', strategy: 'strategies', chain: 'strategies',
      routing: 'routing', dns: 'dns', output: 'export',
    })
  })
})
