import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { serviceCatalog } from '../../data/serviceCatalog'
import { I18nProvider, translate } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import { isSurgeBuiltinRuleSetSelectionDisabled, nextListboxOptionIndex, nextServiceOptionIndex, ruleSetSourceOptions, ruleSetSourcePatch, RoutingInspector } from './Inspector'
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
    const options = ruleSetSourceOptions('mihomo', (key, values) => translate('en-US', key, values))
    expect(options.find((option) => option.value === 'SYSTEM')?.disabled).toBe(true)
    expect(options.find((option) => option.value === 'custom')?.disabled).toBeUndefined()
    expect(useBuilderStore.getState().nodes[0].data.targetNativeRuleSet).toEqual({ target: 'surge', kind: 'builtin-rule-set', name: 'SYSTEM' })
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

  it('disables only new Surge built-in selections for non-Surge authoring targets', () => {
    const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate('en-US', key, values)
    expect(isSurgeBuiltinRuleSetSelectionDisabled('mihomo')).toBe(true)
    expect(isSurgeBuiltinRuleSetSelectionDisabled('loon')).toBe(true)
    expect(isSurgeBuiltinRuleSetSelectionDisabled('shadowrocket')).toBe(true)
    expect(isSurgeBuiltinRuleSetSelectionDisabled('surge')).toBe(false)

    const mihomoOptions = ruleSetSourceOptions('mihomo', t)
    expect(mihomoOptions[0]).toMatchObject({ value: 'custom', label: 'Custom Rule Set' })
    expect(mihomoOptions[0].disabled).toBeUndefined()
    expect(mihomoOptions[1]).toEqual({ value: 'LAN', disabled: true, label: 'Surge built-in · LAN · Surge only' })
    expect(mihomoOptions[2]).toEqual({ value: 'SYSTEM', disabled: true, label: 'Surge built-in · SYSTEM · Surge only' })
    const surgeOptions = ruleSetSourceOptions('surge', t)
    expect(surgeOptions[0]).toMatchObject({ value: 'custom', label: 'Custom Rule Set' })
    expect(surgeOptions[0].disabled).toBeUndefined()
    expect(surgeOptions[1]).toEqual({ value: 'LAN', label: 'Surge built-in · LAN' })
    expect(surgeOptions[2]).toEqual({ value: 'SYSTEM', label: 'Surge built-in · SYSTEM' })
  })
})
