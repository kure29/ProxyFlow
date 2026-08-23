import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { NewProjectDialog } from './NewProjectDialog'
import { NEW_PROJECT_SOURCE_CHOICES, sourceBlockForNewProject } from './newProjectFlow'

describe('client-first new project flow', () => {
  it('offers only bounded RC3 source starts', () => {
    expect(NEW_PROJECT_SOURCE_CHOICES).toEqual(['url', 'paste', 'file', 'empty'])
  })

  it('maps source choices to existing graph nodes', () => {
    expect(sourceBlockForNewProject('url')).toBe('subscription')
    expect(sourceBlockForNewProject('paste')).toBe('manual-proxy')
    expect(sourceBlockForNewProject('file')).toBe('import-config')
    expect(sourceBlockForNewProject('empty')).toBeUndefined()
  })

  it('offers only Mihomo when creating a new Project', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(NewProjectDialog, {
      open: true,
      onClose: () => undefined,
      beforeCreate: async () => undefined,
      onComplete: () => undefined,
    })))
    expect(html).toContain('Mihomo')
    expect(html).not.toContain('sing-box')
    expect((html.match(/target-choice-icon/g) ?? [])).toHaveLength(1)
  })
})
