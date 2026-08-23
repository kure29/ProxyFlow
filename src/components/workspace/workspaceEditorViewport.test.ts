import { describe, expect, it, vi } from 'vitest'
import { observeWorkspaceViewport, resolveWorkspaceViewportGeometry } from './workspaceEditorViewport'

describe('Workspace editor visual viewport', () => {
  it('uses the normal layout viewport when VisualViewport is unavailable', () => {
    expect(resolveWorkspaceViewportGeometry(932, null)).toEqual({ height: 932, offsetTop: 0 })
  })

  it('tracks keyboard-reduced height and non-zero viewport offsets', () => {
    expect(resolveWorkspaceViewportGeometry(932, { height: 510, offsetTop: 47 })).toEqual({
      height: 510,
      offsetTop: 47,
    })
  })

  it('returns to the full visible height when the keyboard closes', () => {
    expect(resolveWorkspaceViewportGeometry(932, { height: 510, offsetTop: 0 }).height).toBe(510)
    expect(resolveWorkspaceViewportGeometry(932, { height: 932, offsetTop: 0 })).toEqual({
      height: 932,
      offsetTop: 0,
    })
  })

  it('clamps unusable geometry instead of producing a zero-height editor', () => {
    expect(resolveWorkspaceViewportGeometry(0, { height: 0, offsetTop: -8 })).toEqual({
      height: 1,
      offsetTop: 0,
    })
  })

  it('removes window and VisualViewport listeners on cleanup', () => {
    const windowListeners = new Map<string, Set<EventListener>>()
    const visualListeners = new Map<string, Set<EventListener>>()
    const eventTarget = (listeners: Map<string, Set<EventListener>>) => ({
      addEventListener: (type: string, listener: EventListener) => {
        const entries = listeners.get(type) ?? new Set<EventListener>()
        entries.add(listener)
        listeners.set(type, entries)
      },
      removeEventListener: (type: string, listener: EventListener) => listeners.get(type)?.delete(listener),
    })
    const visualViewport = {
      ...eventTarget(visualListeners),
      height: 510,
      offsetTop: 35,
    }
    const windowObject = {
      ...eventTarget(windowListeners),
      innerHeight: 932,
      visualViewport,
    } as unknown as Window
    const onChange = vi.fn()

    const cleanup = observeWorkspaceViewport(windowObject, onChange)
    expect(onChange).toHaveBeenLastCalledWith({ height: 510, offsetTop: 35 })
    expect(windowListeners.get('resize')?.size).toBe(1)
    expect(windowListeners.get('orientationchange')?.size).toBe(1)
    expect(visualListeners.get('resize')?.size).toBe(1)
    expect(visualListeners.get('scroll')?.size).toBe(1)

    cleanup()
    expect([...windowListeners.values()].every((listeners) => listeners.size === 0)).toBe(true)
    expect([...visualListeners.values()].every((listeners) => listeners.size === 0)).toBe(true)
  })
})
