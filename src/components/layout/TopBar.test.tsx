import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider, localizeProjectName, setCurrentLocale } from '../../i18n'
import { demoProject } from '../../data/demoProject'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'
import { TopBar } from './TopBar'

const health: PrimaryTargetHealth = { status: 'ready', diagnostics: [] }

function renderTopBar() {
  return renderToStaticMarkup(createElement(I18nProvider, null, createElement(TopBar, {
    view: 'workspace',
    onOpenWorkspaceSection: () => undefined,
    primaryHealth: health,
    projects: [{ id: 'demo', name: 'Demo project', updatedAt: '2026-08-29T00:00:00.000Z', primaryTarget: 'mihomo', active: true }],
    onNewProject: () => undefined,
    onSwitchProject: async () => undefined,
    onRenameProject: async () => true,
    onDeleteProject: async () => undefined,
  })))
}

describe('TopBar project selector', () => {
  beforeEach(() => setCurrentLocale('en-US'))

  it('uses a lightweight trigger without the redundant current-project label', () => {
    const html = renderTopBar()
    expect(html).toContain('class="topbar-project-trigger" aria-haspopup="dialog"')
    expect(html).toContain(`title="${localizeProjectName(demoProject.name, 'en-US')}"`)
    expect(html).not.toContain('Current project')
  })

  it('does not render the deprecated Configuration or Blueprint mode switch', () => {
    const html = renderTopBar()
    expect(html).not.toContain('product-view-switcher')
    expect(html).not.toContain('>Configuration<')
    expect(html).not.toContain('>Blueprint<')
  })
})
