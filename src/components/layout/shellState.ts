import type { ProductView } from '../workspace/types'

export const MOBILE_SHELL_MAX = 767
export const DESKTOP_SHELL_MIN = 1024

export type ShellMode = 'mobile' | 'tablet' | 'desktop'

export function resolveShellMode(viewportWidth: number): ShellMode {
  if (!Number.isFinite(viewportWidth) || viewportWidth >= DESKTOP_SHELL_MIN) return 'desktop'
  if (viewportWidth <= MOBILE_SHELL_MAX) return 'mobile'
  return 'tablet'
}

export interface TopBarActionVisibility {
  undo: boolean
  redo: boolean
  autoLayout: boolean
  fit: boolean
  refreshAll: boolean
  preview: boolean
  export: boolean
}

export function resolveTopBarActions(_view: ProductView): TopBarActionVisibility {
  return {
    undo: false,
    redo: false,
    autoLayout: false,
    fit: false,
    refreshAll: false,
    preview: false,
    export: true,
  }
}
