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

  it('offers Mihomo, Surge, and Loon while keeping Mihomo selected by default', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(NewProjectDialog, {
      open: true,
      onClose: () => undefined,
      beforeCreate: async () => undefined,
      onComplete: () => undefined,
    })))
    expect(html).toContain('Mihomo')
    expect(html).toContain('Surge')
    expect(html).toContain('Loon')
    expect(html).toContain('Surge profile export with strict compatibility checks.')
    expect(html).not.toContain('sing-box')
    expect(html).not.toContain('coming soon')
    expect((html.match(/target-choice-icon/g) ?? [])).toHaveLength(3)
    expect(html).toMatch(/is-selected[^>]*>[\s\S]*?Mihomo/)
  })
})
