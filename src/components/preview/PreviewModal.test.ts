import { describe, expect, it } from 'vitest'
import { resolvePreviewCompatibilityStatus } from './PreviewModal'

describe('Preview compatibility summary', () => {
  it('shows a successful target as warning when the combined graph and target presentation has warnings', () => {
    expect(resolvePreviewCompatibilityStatus('success', 1)).toBe('warning')
    expect(resolvePreviewCompatibilityStatus('success', 0)).toBe('supported')
  })
})
