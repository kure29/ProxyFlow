import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Boxes, FileOutput, GitBranch, Globe2, Radio, Route } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { MobileWorkspaceNavigation, type MobileWorkspaceNavigationItem } from './MobileWorkspaceNavigation'
import { activateMobileWorkspaceSection } from './mobileWorkspaceNavigationModel'

const items: MobileWorkspaceNavigationItem[] = [
  { id: 'sources', icon: Radio, label: 'Sources', count: 2 },
  { id: 'proxies', icon: Boxes, label: 'Proxies', count: 18 },
  { id: 'processing', icon: GitBranch, label: 'Processing', count: 3 },
  { id: 'strategies', icon: GitBranch, label: 'Strategies', count: 4 },
  { id: 'routing', icon: Route, label: 'Routing', count: 2 },
  { id: 'dns', icon: Globe2, label: 'DNS / Advanced', count: 1 },
  { id: 'export', icon: FileOutput, label: 'Export', count: 2 },
]

describe('Mobile Workspace navigation', () => {
  it('renders the consolidated mobile workflow and active More state', () => {
    const html = renderToStaticMarkup(createElement(MobileWorkspaceNavigation, {
      activeSection: 'dns',
      lastNodeSection: 'proxies',
      items,
      labels: { title: 'Project navigation', home: 'Home', nodes: 'Sources', processing: 'Processing', strategies: 'Strategies', routing: 'Routing', more: 'More' },
      onSectionChange: () => undefined,
    }))

    expect(html).toContain('Home')
    expect(html).toContain('Sources')
    expect(html).toContain('Processing')
    expect(html).toContain('Strategies')
    expect(html).toContain('Routing')
    expect(html).toContain('More')
    expect((html.match(/aria-current="page"/g) ?? [])).toHaveLength(1)
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).not.toContain('Blueprint')
  })

  it('changes section before closing a creation-style navigation action', () => {
    const sequence: string[] = []
    activateMobileWorkspaceSection('export', (section) => sequence.push(`section:${section}`), () => sequence.push('close'))
    expect(sequence).toEqual(['section:export', 'close'])
  })
})
