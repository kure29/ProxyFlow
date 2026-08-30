import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { WorkspaceItemMenuActions } from './WorkspaceItemMenu'

describe('Workspace item menu actions', () => {
  it('retains structured editing actions without exposing Show in Flow', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceItemMenuActions, {
      onEdit: () => undefined,
      onDuplicate: () => undefined,
      onDelete: () => undefined,
      onRun: () => undefined,
      onConfirmDelete: () => undefined,
    })))

    expect(html).toContain('Edit')
    expect(html).toContain('Duplicate')
    expect(html).toContain('Delete')
    expect(html).not.toContain('Show in Visual Flow')
    expect(html).not.toContain('Blueprint')
  })
})
