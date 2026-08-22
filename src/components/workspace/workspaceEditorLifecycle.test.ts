import { describe, expect, it } from 'vitest'
import { shouldDismissWorkspaceEditor } from './workspaceEditorLifecycle'

describe('workspace editor lifecycle', () => {
  it('dismisses the inspector when navigating to a different workspace page', () => {
    expect(shouldDismissWorkspaceEditor('sources', 'processing')).toBe(true)
    expect(shouldDismissWorkspaceEditor('routing', 'inspect')).toBe(true)
  })

  it('keeps same-page item replacement under the existing editor flow', () => {
    expect(shouldDismissWorkspaceEditor('strategies', 'strategies')).toBe(false)
  })
})
