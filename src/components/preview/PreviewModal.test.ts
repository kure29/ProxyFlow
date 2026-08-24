import { describe, expect, it } from 'vitest'
import { resolvePreviewCompatibilityStatus, resolvePreviewTarget, resolveVisiblePreviewTargets } from './PreviewModal'

describe('Preview compatibility summary', () => {
  it('shows a successful target as warning when the combined graph and target presentation has warnings', () => {
    expect(resolvePreviewCompatibilityStatus('success', 1)).toBe('warning')
    expect(resolvePreviewCompatibilityStatus('success', 0)).toBe('supported')
  })

  it('keeps internal Loon preview target identity without exposing Loon to ordinary targets', () => {
    expect(resolvePreviewTarget('surge', 'loon')).toBe('loon')
    expect(resolveVisiblePreviewTargets('loon', 'surge')).toContain('loon')
    expect(resolvePreviewTarget(null, 'mihomo')).toBe('mihomo')
    expect(resolveVisiblePreviewTargets('mihomo', null)).toEqual(['mihomo', 'surge'])
    expect(resolveVisiblePreviewTargets('surge', null)).not.toContain('loon')
  })
})
