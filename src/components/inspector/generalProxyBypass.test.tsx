import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../data/newProject'
import { I18nProvider } from '../../i18n'
import { SurgeGeneralProxyBypassEditor } from './Inspector'

function markup(config: unknown) {
  const project = createBlankProject('surge')
  const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
  output.data.targetNativeSurgeGeneralProxyBypass = config as never
  return renderToStaticMarkup(createElement(
    I18nProvider,
    null,
    createElement(SurgeGeneralProxyBypassEditor, { node: output, primaryTarget: 'surge' }),
  ))
}

describe('Surge General Proxy Bypass editor malformed-state boundary', () => {
  it.each([
    ['skipProxy string', { target: 'surge', kind: 'general-proxy-bypass', skipProxy: 'apple.com' }],
    ['skipProxy array item', { target: 'surge', kind: 'general-proxy-bypass', skipProxy: [123] }],
    ['skipProxy null', { target: 'surge', kind: 'general-proxy-bypass', skipProxy: null }],
    ['skipProxy object', { target: 'surge', kind: 'general-proxy-bypass', skipProxy: {} }],
    ['excludeSimpleHostnames string', { target: 'surge', kind: 'general-proxy-bypass', excludeSimpleHostnames: 'true' }],
    ['excludeSimpleHostnames number', { target: 'surge', kind: 'general-proxy-bypass', excludeSimpleHostnames: 1 }],
  ])('renders %s as inspectable invalid retained state with explicit removal only', (_name, config) => {
    expect(() => markup(config)).not.toThrow()
    const html = markup(config)
    expect(html).toContain('Invalid Surge proxy compatibility settings')
    expect(html).toContain('Remove retained settings')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('skip-proxy Host List')
    expect(html).not.toContain('Exclude simple hostnames')
    expect(html).not.toContain('value="apple.com"')
    expect(html).not.toContain('value="123"')
    expect(html).not.toContain('value="true"')
  })
})
