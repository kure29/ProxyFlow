import { describe, expect, it, vi } from 'vitest'
import { lockWorkspaceDocumentScroll, shouldDismissWorkspaceEditor } from './workspaceEditorLifecycle'

describe('workspace editor lifecycle', () => {
  it('dismisses the inspector when navigating to a different workspace page', () => {
    expect(shouldDismissWorkspaceEditor('sources', 'processing')).toBe(true)
    expect(shouldDismissWorkspaceEditor('routing', 'inspect')).toBe(true)
  })

  it('keeps same-page item replacement under the existing editor flow', () => {
    expect(shouldDismissWorkspaceEditor('strategies', 'strategies')).toBe(false)
  })

  it('restores body scroll state and position after the editor closes', () => {
    const bodyStyle = { left: '', overflow: '', overscrollBehavior: '', position: '', top: '', width: '' }
    const rootStyle = { left: '', overflow: 'auto', overscrollBehavior: '', position: '', top: '', width: '' }
    const scrollTo = vi.fn()
    const release = lockWorkspaceDocumentScroll(
      { scrollX: 4, scrollY: 280, scrollTo },
      { body: { style: bodyStyle }, documentElement: { style: rootStyle } },
    )

    expect(bodyStyle).toMatchObject({ position: 'fixed', top: '-280px', left: '-4px', width: '100%' })
    expect(rootStyle.overflow).toBe('hidden')
    release()
    expect(bodyStyle).toMatchObject({ position: '', top: '', left: '', width: '', overflow: '' })
    expect(rootStyle.overflow).toBe('auto')
    expect(scrollTo).toHaveBeenCalledWith(4, 280)
  })

  it('keeps nested modal locks active until every owner has cleaned up', () => {
    const style = () => ({ left: '', overflow: '', overscrollBehavior: '', position: '', top: '', width: '' })
    const bodyStyle = style()
    const rootStyle = style()
    const documentObject = { body: { style: bodyStyle }, documentElement: { style: rootStyle } }
    const scrollTo = vi.fn()
    const windowObject = { scrollX: 0, scrollY: 120, scrollTo }
    const releaseEditor = lockWorkspaceDocumentScroll(windowObject, documentObject)
    const releasePicker = lockWorkspaceDocumentScroll(windowObject, documentObject)

    releasePicker()
    expect(bodyStyle.position).toBe('fixed')
    expect(scrollTo).not.toHaveBeenCalled()
    releaseEditor()
    expect(bodyStyle.position).toBe('')
    expect(scrollTo).toHaveBeenCalledOnce()
  })
})
