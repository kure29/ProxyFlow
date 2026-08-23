import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { strategyCreationOptions } from './workspaceCreation'
import { activateWorkspaceCreationOption, WorkspaceAddOptions } from './WorkspaceAddMenu'

describe('Workspace Add menu', () => {
  it('runs the creation callback before closing the menu', () => {
    const sequence: string[] = []
    activateWorkspaceCreationOption(
      { id: 'chain', blockType: 'proxy-chain', advanced: true },
      (type) => sequence.push(`create:${type}`),
      () => sequence.push('close'),
    )
    expect(sequence).toEqual(['create:proxy-chain', 'close'])
  })

  it('keeps every Strategy accessible with a visual separator and no Advanced heading', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceAddOptions, {
      options: strategyCreationOptions('mihomo'),
      onActivate: () => undefined,
    })))
    expect((html.match(/role="menuitem"/g) ?? [])).toHaveLength(5)
    expect(html).toContain('role="separator"')
    expect(html).not.toContain('>Advanced<')
    expect(html).toContain('Manual select')
    expect(html).toContain('Load balance')
    expect(html).toContain('Proxy chain')
  })
})
