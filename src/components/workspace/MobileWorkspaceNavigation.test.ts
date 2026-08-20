import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Boxes, FileOutput, Globe2, Radio } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { MobileWorkspaceNavigation, type MobileWorkspaceNavigationItem } from './MobileWorkspaceNavigation'
import { activateMobileWorkspaceSection } from './mobileWorkspaceNavigationModel'

const items: MobileWorkspaceNavigationItem[] = [
  { id: 'sources', icon: Radio, label: 'Sources', count: 2 },
  { id: 'proxies', icon: Boxes, label: 'Proxies', count: 18 },
  { id: 'dns', icon: Globe2, label: 'DNS / Advanced', count: 1 },
  { id: 'export', icon: FileOutput, label: 'Export', count: 2 },
]

describe('Mobile Workspace navigation', () => {
  it('renders a web-controlled drawer with active state, counts and accessible dialog state', () => {
    const html = renderToStaticMarkup(createElement(MobileWorkspaceNavigation, {
      activeSection: 'dns',
      items,
      open: true,
      openLabel: 'Open Project navigation',
      closeLabel: 'Close Project navigation',
      title: 'Project navigation',
      inputLabel: 'Sources / Proxies',
      moreLabel: 'More',
      onOpenChange: () => undefined,
      onSectionChange: () => undefined,
    }))

    expect(html).not.toContain('<select')
    expect(html).toContain('Sources / Proxies')
    expect(html).toContain('More')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('DNS / Advanced: 1')
    expect(html).toContain('Export: 2')
    expect(html).toContain('aria-label="Close Project navigation"')
  })

  it('changes section before closing the drawer', () => {
    const sequence: string[] = []
    const onSectionChange = vi.fn((section: string) => sequence.push(`section:${section}`))
    const onClose = vi.fn(() => sequence.push('close'))

    activateMobileWorkspaceSection('export', onSectionChange, onClose)

    expect(onSectionChange).toHaveBeenCalledWith('export')
    expect(onClose).toHaveBeenCalledOnce()
    expect(sequence).toEqual(['section:export', 'close'])
  })
})
