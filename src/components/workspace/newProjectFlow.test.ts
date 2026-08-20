import { describe, expect, it } from 'vitest'
import { NEW_PROJECT_SOURCE_CHOICES, sourceBlockForNewProject } from './newProjectFlow'

describe('client-first new project flow', () => {
  it('offers only bounded RC2 source starts', () => {
    expect(NEW_PROJECT_SOURCE_CHOICES).toEqual(['url', 'paste', 'file', 'empty'])
  })

  it('maps source choices to existing graph nodes', () => {
    expect(sourceBlockForNewProject('url')).toBe('subscription')
    expect(sourceBlockForNewProject('paste')).toBe('manual-proxy')
    expect(sourceBlockForNewProject('file')).toBe('import-config')
    expect(sourceBlockForNewProject('empty')).toBeUndefined()
  })
})
