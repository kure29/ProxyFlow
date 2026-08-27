import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { serviceCatalog } from '../../data/serviceCatalog'
import { I18nProvider } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import { nextListboxOptionIndex, nextServiceOptionIndex, ruleSetSourcePatch, RoutingInspector } from './Inspector'
import type { GraphNode, ProxyFlowProject } from '../../types/project'

function ruleProject(target: ProxyFlowProject['primaryTarget'], native?: 'LAN' | 'SYSTEM'): ProxyFlowProject {
  const base = structuredClone(demoProject)
  base.primaryTarget = target
  base.graph.nodes = [{
    id: 'rule', type: 'block', position: { x: 0, y: 0 }, data: {
      blockType: 'custom-rule', category: 'routing', title: 'Built-in Rule', subtitle: '', icon: 'route',
      routeMatcherKind: 'rule-set', routeMatcherValue: native ? `surge-builtin-ruleset-${native.toLowerCase()}` : '',
      ...(native ? { targetNativeRuleSet: { target: 'surge' as const, kind: 'builtin-rule-set' as const, name: native } } : {}),
    },
  } as GraphNode]
  return base
}

describe('Routing Inspector product UI', () => {
  it('does not render the duplicated route relationship box', () => {
    useBuilderStore.getState().hydrate(structuredClone(demoProject))
    const node = useBuilderStore.getState().nodes.find((item) => item.id === 'ai-services')!
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(RoutingInspector, { node })))
    expect(html).not.toContain('route-preview')
    expect(html).not.toContain('route-source')
    expect(html).not.toContain('route-target')
    expect(html).toContain('Target strategy')
  })

  it('supports Arrow, Home, and End navigation over enabled Service options', () => {
    expect(nextListboxOptionIndex('ArrowDown', -1, 6)).toBe(0)
    expect(nextListboxOptionIndex('ArrowDown', 5, 6)).toBe(0)
    expect(nextListboxOptionIndex('ArrowUp', 0, 6)).toBe(5)
    expect(nextListboxOptionIndex('Home', 4, 6)).toBe(0)
    expect(nextListboxOptionIndex('End', 1, 6)).toBe(5)
  })

  it('keeps continuous Service adding focused after already-selected entries', () => {
    const openAiIndex = serviceCatalog.findIndex((service) => service.id === 'openai')
    const netflixIndex = serviceCatalog.findIndex((service) => service.id === 'netflix')
    expect(openAiIndex).toBeGreaterThanOrEqual(0)
    expect(netflixIndex).toBeGreaterThan(openAiIndex)
    expect(nextServiceOptionIndex(serviceCatalog, ['openai'], netflixIndex)).toBe(netflixIndex - 1)
  })

  it('renders the typed Surge built-in selector and omits custom import controls', () => {
    const project = ruleProject('surge', 'LAN')
    useBuilderStore.getState().hydrate(project)
    const node = useBuilderStore.getState().nodes[0]
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(RoutingInspector, { node })))
    expect(html).toContain('Rule Set source')
    expect(html).toContain('Surge built-in Rule Set · LAN')
    expect(html).toContain('RULE-SET,LAN,&lt;policy&gt;')
    expect(html).not.toContain('Not supported by Surge')
    expect(html).not.toContain('Upload file')
    expect(html).not.toContain('https://rules.example.com')
  })

  it('renders SYSTEM with the same typed built-in surface', () => {
    const project = ruleProject('surge', 'SYSTEM')
    useBuilderStore.getState().hydrate(project)
    const node = useBuilderStore.getState().nodes[0]
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(RoutingInspector, { node })))
    expect(html).toContain('Surge built-in Rule Set · SYSTEM')
    expect(html).toContain('RULE-SET,SYSTEM,&lt;policy&gt;')
    expect(html).not.toContain('Upload file')
  })

  it('shows a Surge-only mismatch while retaining typed data on Mihomo', () => {
    const project = ruleProject('mihomo', 'SYSTEM')
    useBuilderStore.getState().hydrate(project)
    const node = useBuilderStore.getState().nodes[0]
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(RoutingInspector, { node })))
    expect(html).toContain('Surge built-in Rule Sets are only supported by Surge.')
    expect(html).toContain('Mihomo')
    expect(html).toContain('Surge built-in · SYSTEM')
  })

  it('renders the custom source editor when no typed built-in is selected', () => {
    const project = ruleProject('surge')
    useBuilderStore.getState().hydrate(project)
    const node = useBuilderStore.getState().nodes[0]
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(RoutingInspector, { node })))
    expect(html).toContain('Custom Rule Set')
    expect(html).toContain('Upload file')
  })

  it('keeps Rule Set source transitions typed and deterministic', () => {
    expect(ruleSetSourcePatch('LAN')).toEqual({
      targetNativeRuleSet: { target: 'surge', kind: 'builtin-rule-set', name: 'LAN' },
      routeMatcherValue: 'surge-builtin-ruleset-lan', customRuleSource: undefined,
    })
    expect(ruleSetSourcePatch('SYSTEM')).toEqual({
      targetNativeRuleSet: { target: 'surge', kind: 'builtin-rule-set', name: 'SYSTEM' },
      routeMatcherValue: 'surge-builtin-ruleset-system', customRuleSource: undefined,
    })
    expect(ruleSetSourcePatch('custom', 'remote-source')).toEqual({ targetNativeRuleSet: undefined, routeMatcherValue: 'remote-source' })
    expect(ruleSetSourcePatch('custom')).toEqual({ targetNativeRuleSet: undefined, routeMatcherValue: '' })
  })
})
