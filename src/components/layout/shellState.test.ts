import { describe, expect, it } from 'vitest'
import { resolveShellMode, resolveTopBarActions } from './shellState'

describe('product shell state', () => {
  it('uses explicit desktop, tablet, and mobile layout boundaries', () => {
    expect(resolveShellMode(1440)).toBe('desktop')
    expect(resolveShellMode(1024)).toBe('desktop')
    expect(resolveShellMode(1023)).toBe('tablet')
    expect(resolveShellMode(768)).toBe('tablet')
    expect(resolveShellMode(767)).toBe('mobile')
    expect(resolveShellMode(390)).toBe('mobile')
  })

  it('keeps Workspace actions quiet and contextual', () => {
    expect(resolveTopBarActions('workspace')).toEqual({
      undo: false,
      redo: false,
      autoLayout: false,
      fit: false,
      refreshAll: false,
      preview: false,
      export: true,
    })
  })

  it('keeps graph controls in the floating canvas toolbar', () => {
    expect(resolveTopBarActions('visual-flow')).toEqual({
      undo: false,
      redo: false,
      autoLayout: false,
      fit: false,
      refreshAll: false,
      preview: false,
      export: true,
    })
  })
})
