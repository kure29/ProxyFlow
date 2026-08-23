import { describe, expect, it } from 'vitest'
import { positionViewportPopover } from './viewportPopover'

const options = {
  preferredWidth: 360,
  maxHeight: 520,
  minPreferredHeight: 260,
  viewportPadding: 12,
  gap: 8,
  align: 'end' as const,
}

describe('viewport popover positioning', () => {
  it('uses available space below without crossing the viewport edge', () => {
    const result = positionViewportPopover(
      { top: 100, bottom: 134, left: 980, right: 1320, width: 340 },
      { width: 1365, height: 768, layoutHeight: 768 },
      options,
    )
    expect(result).toEqual(expect.objectContaining({ placement: 'below', top: 142, width: 360 }))
    expect(result.left).toBeGreaterThanOrEqual(12)
    expect(result.left + result.width).toBeLessThanOrEqual(1353)
    expect(result.maxHeight).toBeLessThanOrEqual(768 - result.top!)
  })

  it('anchors above when the lower viewport cannot expose the content', () => {
    const result = positionViewportPopover(
      { top: 650, bottom: 684, left: 900, right: 1240, width: 340 },
      { width: 1365, height: 768, layoutHeight: 768 },
      options,
    )
    expect(result.placement).toBe('above')
    expect(result.top).toBeUndefined()
    expect(result.bottom).toBe(126)
    expect(result.maxHeight).toBe(520)
  })

  it('fits narrow mobile viewports without horizontal overflow', () => {
    const result = positionViewportPopover(
      { top: 200, bottom: 244, left: 16, right: 359, width: 343 },
      { width: 375, height: 812, layoutHeight: 812 },
      { ...options, matchAnchorWidth: true },
    )
    expect(result.left).toBe(12)
    expect(result.width).toBe(351)
    expect(result.left + result.width).toBe(363)
  })
})
