import { describe, expect, it, vi } from 'vitest'
import { dismissInspectorSelection } from './ResizableWorkspace'

describe('Visual Flow inspector dismissal', () => {
  it('clears the selected node through the store action', () => {
    const selectNode = vi.fn()
    const selectEdge = vi.fn()

    dismissInspectorSelection(
      { selectedNodeId: 'dns', selectedEdgeId: null },
      { selectNode, selectEdge },
    )

    expect(selectNode).toHaveBeenCalledWith(null)
    expect(selectEdge).not.toHaveBeenCalled()
  })

  it('clears the selected edge through the store action', () => {
    const selectNode = vi.fn()
    const selectEdge = vi.fn()

    dismissInspectorSelection(
      { selectedNodeId: null, selectedEdgeId: 'edge-1' },
      { selectNode, selectEdge },
    )

    expect(selectEdge).toHaveBeenCalledWith(null)
    expect(selectNode).not.toHaveBeenCalled()
  })
})
