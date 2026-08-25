import { describe, expect, it } from 'vitest'
import { resolvePreviewCompatibilityStatus, resolvePreviewTarget, resolveVisiblePreviewTargets, shouldShowPreviewPausedWarning } from './PreviewModal'

describe('Preview compatibility summary', () => {
  it('shows a successful target as warning when the combined graph and target presentation has warnings', () => {
    expect(resolvePreviewCompatibilityStatus('success', 1)).toBe('warning')
    expect(resolvePreviewCompatibilityStatus('success', 0)).toBe('supported')
  })

  it('exposes every supported preview compiler while keeping target identity safe', () => {
    expect(resolvePreviewTarget('surge', 'loon')).toBe('loon')
    expect(resolveVisiblePreviewTargets('loon', 'surge')).toContain('loon')
    expect(resolvePreviewTarget(null, 'mihomo')).toBe('mihomo')
    expect(resolveVisiblePreviewTargets('mihomo', null)).toEqual(['mihomo', 'surge', 'loon'])
    expect(resolveVisiblePreviewTargets('surge', null)).toEqual(['mihomo', 'surge', 'loon'])
    expect(resolveVisiblePreviewTargets('sing-box', null)).not.toContain('sing-box')
    expect(shouldShowPreviewPausedWarning('loon')).toBe(false)
    expect(resolveVisiblePreviewTargets('shadowrocket', null)).toEqual(['mihomo', 'surge', 'loon', 'shadowrocket'])
    expect(resolvePreviewTarget(null, 'shadowrocket')).toBe('shadowrocket')
    expect(shouldShowPreviewPausedWarning('shadowrocket')).toBe(true)
  })
})
