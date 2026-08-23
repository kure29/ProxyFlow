export interface WorkspaceViewportGeometry {
  height: number
  offsetTop: number
}

type VisualViewportGeometry = Pick<VisualViewport, 'height' | 'offsetTop'>

export function resolveWorkspaceViewportGeometry(
  layoutViewportHeight: number,
  visualViewport?: VisualViewportGeometry | null,
): WorkspaceViewportGeometry {
  return {
    height: Math.max(1, Math.round(visualViewport?.height ?? layoutViewportHeight)),
    offsetTop: Math.max(0, Math.round(visualViewport?.offsetTop ?? 0)),
  }
}

export function readWorkspaceViewportGeometry(windowObject: Window): WorkspaceViewportGeometry {
  return resolveWorkspaceViewportGeometry(windowObject.innerHeight, windowObject.visualViewport)
}

export function observeWorkspaceViewport(
  windowObject: Window,
  onChange: (geometry: WorkspaceViewportGeometry) => void,
): () => void {
  const update = () => onChange(readWorkspaceViewportGeometry(windowObject))
  const visualViewport = windowObject.visualViewport

  windowObject.addEventListener('resize', update)
  windowObject.addEventListener('orientationchange', update)
  visualViewport?.addEventListener('resize', update)
  visualViewport?.addEventListener('scroll', update)
  update()

  return () => {
    windowObject.removeEventListener('resize', update)
    windowObject.removeEventListener('orientationchange', update)
    visualViewport?.removeEventListener('resize', update)
    visualViewport?.removeEventListener('scroll', update)
  }
}
