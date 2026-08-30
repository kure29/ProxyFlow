import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { demoEdges, demoNodes } from '../../data/demoProject'
import { I18nProvider } from '../../i18n'
import type { GraphNode } from '../../types/project'
import {
  resolveWorkspaceInputCandidates,
  resolveWorkspaceInputMode,
  shouldPortalWorkspaceEditor,
  WorkspaceEditorToolbar,
} from './WorkspaceNodeEditor'

function withBlockType(node: GraphNode, blockType: GraphNode['data']['blockType'], category = node.data.category): GraphNode {
  return { ...node, data: { ...node.data, blockType, category } }
}

describe('WorkspaceNodeEditor input semantics', () => {
  const filter = demoNodes.find((node) => node.id === 'hk-filter')!
  const strategy = demoNodes.find((node) => node.id === 'hk-auto')!

  it('keeps ordinary processing types single-input', () => {
    for (const blockType of ['filter', 'rename', 'sort', 'deduplicate', 'limit'] as const) {
      expect(resolveWorkspaceInputMode(withBlockType(filter, blockType))).toBe('single')
    }
  })

  it('keeps Merge and every input-based Strategy multi-input', () => {
    expect(resolveWorkspaceInputMode(withBlockType(filter, 'merge'))).toBe('multiple')
    for (const blockType of ['manual-select', 'auto-select', 'fallback', 'load-balance'] as const) {
      expect(resolveWorkspaceInputMode(withBlockType(strategy, blockType, 'strategy'))).toBe('multiple')
    }
  })

  it('does not apply the picker to Proxy Chain hop semantics', () => {
    const chain = demoNodes.find((node) => node.id === 'us-via-hk')!
    expect(resolveWorkspaceInputMode(chain)).toBeNull()
  })

  it('portals mobile and tablet editors above the application chrome', () => {
    expect(shouldPortalWorkspaceEditor('mobile')).toBe(true)
    expect(shouldPortalWorkspaceEditor('tablet')).toBe(true)
    expect(shouldPortalWorkspaceEditor('desktop')).toBe(false)
  })

  it('keeps invalid candidates visible and marks retained invalid connections explicitly', () => {
    const downstreamEdge = {
      ...demoEdges[0],
      id: 'processing-downstream',
      source: 'hk-filter',
      target: 'us-filter',
    }
    const candidates = resolveWorkspaceInputCandidates(
      demoNodes,
      [...demoEdges, downstreamEdge],
      'hk-filter',
      ['us-filter'],
    )
    const downstream = candidates.find((candidate) => candidate.node.id === 'us-filter')
    expect(downstream).toMatchObject({ disabled: true, unavailable: true })
    expect(candidates.some((candidate) => candidate.node.data.category === 'strategy')).toBe(false)
  })

  it('retains a historically selected non-candidate node instead of silently dropping its connection', () => {
    const candidates = resolveWorkspaceInputCandidates(demoNodes, demoEdges, 'hk-filter', ['hk-auto'])
    expect(candidates.find((candidate) => candidate.node.id === 'hk-auto')).toMatchObject({
      disabled: true,
      unavailable: true,
    })
  })

  it('keeps editing controls without exposing Show in Flow', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceEditorToolbar, {
      title: 'Processing step', onClose: () => undefined,
    })))
    expect(html).toContain('Processing step')
    expect(html).toContain('Close Workspace editor')
    expect(html).not.toContain('Show in Visual Flow')
    expect(html).not.toContain('Blueprint')
  })
})
