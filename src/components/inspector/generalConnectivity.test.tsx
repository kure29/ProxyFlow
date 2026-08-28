import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../data/newProject'
import { I18nProvider } from '../../i18n'
import { SurgeGeneralConnectivityEditor } from './Inspector'

function markup(target: 'surge' | 'mihomo', config?: unknown) {
  const project = createBlankProject(target)
  const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
  output.data.targetNativeSurgeGeneralConnectivity = config as never
  return renderToStaticMarkup(createElement(
    I18nProvider,
    null,
    createElement(SurgeGeneralConnectivityEditor, { node: output, primaryTarget: target }),
  ))
}

describe('Surge General Connectivity editor', () => {
  it('keeps a fresh editable input present for local incremental drafts', () => {
    const html = markup('surge')
    expect(html).toContain('Internet test URL')
    expect(html).toContain('Use Surge default')
    expect(html).toContain('type="url"')
  })

  it('keeps invalid persisted data recoverable without presenting it as valid intent', () => {
    const html = markup('surge', { target: 'surge', kind: 'general-connectivity', internetTestUrl: 'not-a-url' })
    expect(html).toContain('Invalid Surge Internet connectivity setting')
    expect(html).toContain('Remove retained setting')
    expect(html).toContain('type="url"')
  })

  it('retains a valid URL on non-Surge Outputs while disabling edits', () => {
    const html = markup('mihomo', { target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://example.test/ping' })
    expect(html).toContain('Surge Internet connectivity intent is retained')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Remove retained setting')
  })
})
