import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { serviceCatalog } from '../../data/serviceCatalog'
import { I18nProvider, translate } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import { compileGraph } from '../../core/graphCompiler'
import { compileSurge } from '../../targets/surge/compiler'
import { v08BasicRoutingFixture } from '../../core/__fixtures__/v08Acceptance'
import { surgeNativeAcceptanceProject } from '../../core/__fixtures__/surgeNativeStrategies'
import { isSurgeBuiltinRuleSetSelectionDisabled, nextListboxOptionIndex, nextServiceOptionIndex, ruleSetSourceOptions, ruleSetSourcePatch, RoutingInspector, SurgeFinalOptionsEditor } from './Inspector'
import { finalDnsFailedOptionsPatch, getFinalDnsFailedUiState } from '../../core/routing/finalOptionsProductModel'
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

function finalProject(target: ProxyFlowProject['primaryTarget'], targetKind: 'strategy' | 'direct' | 'reject' = 'strategy', persisted = false): ProxyFlowProject {
  const project = structuredClone(demoProject)
  project.primaryTarget = target
  const final = project.graph.nodes.find((node) => node.id === 'final-route')!
  final.data.targetKind = targetKind
  if (targetKind === 'strategy') {
    final.data.targetId = 'us-via-hk'
    final.data.targetLabel = 'US via HK'
  } else {
    final.data.targetId = undefined
    final.data.targetLabel = targetKind.toUpperCase()
  }
  if (persisted) Object.assign(final.data, finalDnsFailedOptionsPatch(true))
  return project
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

  it('renders the Final dns-failed control with the create/remove permission split', () => {
    const surgeStrategy = finalProject('surge')
    useBuilderStore.getState().hydrate(surgeStrategy)
    expect(useBuilderStore.getState().primaryTarget).toBe('surge')
    expect(getFinalDnsFailedUiState({ primaryTarget: 'surge', finalTargetKind: 'strategy', hasPersistedIntent: false }).toggleDisabled).toBe(false)
    let html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(RoutingInspector, { node: useBuilderStore.getState().nodes.find((item) => item.id === 'final-route')! })))
    const freshNode = useBuilderStore.getState().nodes.find((item) => item.id === 'final-route')!
    expect(renderToStaticMarkup(createElement(I18nProvider, null, createElement(SurgeFinalOptionsEditor, { node: freshNode, primaryTarget: 'surge' })))).not.toContain('disabled=""')
    expect(html).toContain('Use Final policy when DNS resolution fails')

    const reject = finalProject('surge', 'reject')
    const rejectNode = reject.graph.nodes.find((item) => item.id === 'final-route')!
    expect(renderToStaticMarkup(createElement(I18nProvider, null, createElement(SurgeFinalOptionsEditor, { node: rejectNode, primaryTarget: 'surge' })))).not.toContain('disabled=""')

    const direct = finalProject('surge', 'direct')
    useBuilderStore.getState().hydrate(direct)
    html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(SurgeFinalOptionsEditor, { node: useBuilderStore.getState().nodes.find((item) => item.id === 'final-route')!, primaryTarget: 'surge' })))
    expect(html).toContain('dns-failed cannot be used with DIRECT')
    expect(html).toContain('disabled=""')

    const persistedDirect = finalProject('surge', 'direct', true)
    useBuilderStore.getState().hydrate(persistedDirect)
    html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(SurgeFinalOptionsEditor, { node: useBuilderStore.getState().nodes.find((item) => item.id === 'final-route')!, primaryTarget: 'surge' })))
    expect(html).toContain('checked=""')
    expect(html).toContain('dns-failed is incompatible with DIRECT')
    expect(html).not.toContain('disabled=""')
  })

  it('keeps an existing Surge intent visible and removable on a non-Surge target', () => {
    const project = finalProject('mihomo', 'strategy', true)
    useBuilderStore.getState().hydrate(project)
    const node = useBuilderStore.getState().nodes.find((item) => item.id === 'final-route')!
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(SurgeFinalOptionsEditor, { node, primaryTarget: 'mihomo' })))
    expect(html).toContain('This is a Surge-only Final option.')
    expect(html).toContain('The current target does not support this intent.')
    expect(html).toContain('checked=""')
    expect(html).not.toContain('disabled=""')
    expect(node.data.targetNativeFinalOptions).toEqual({ target: 'surge', kind: 'final-options', dnsFailed: true })
  })

  it('allows dns-failed for typed Surge Smart and Subnet Final targets', () => {
    const project = structuredClone(surgeNativeAcceptanceProject)
    const node = project.graph.nodes.find((item) => item.id === 'final-route')!
    expect(renderToStaticMarkup(createElement(I18nProvider, null, createElement(SurgeFinalOptionsEditor, { node, primaryTarget: 'surge', finalTargetNativeKind: 'subnet' })))).not.toContain('disabled=""')
    expect(renderToStaticMarkup(createElement(I18nProvider, null, createElement(SurgeFinalOptionsEditor, { node, primaryTarget: 'surge', finalTargetNativeKind: 'smart' })))).not.toContain('disabled=""')
  })

  it('preserves the typed intent through target switching and DIRECT transitions', () => {
    useBuilderStore.getState().hydrate(finalProject('surge', 'strategy', true))
    useBuilderStore.getState().setPrimaryTarget('mihomo')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'final-route')?.data.targetNativeFinalOptions).toEqual({ target: 'surge', kind: 'final-options', dnsFailed: true })
    useBuilderStore.getState().setPrimaryTarget('surge')
    useBuilderStore.getState().setRoutingTarget('final-route', '__direct__')
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'final-route')?.data).toEqual(expect.objectContaining({ targetKind: 'direct', targetNativeFinalOptions: { target: 'surge', kind: 'final-options', dnsFailed: true } }))
    useBuilderStore.getState().updateNodeData('final-route', finalDnsFailedOptionsPatch(false))
    expect(useBuilderStore.getState().nodes.find((node) => node.id === 'final-route')?.data.targetNativeFinalOptions).toBeUndefined()
  })

  it('proves Product-created intent reaches compileGraph and compileSurge', () => {
    const project = structuredClone(v08BasicRoutingFixture)
    project.primaryTarget = 'surge'
    project.graph.nodes = project.graph.nodes.filter((node) => node.id !== 'manual')
    project.graph.edges = project.graph.edges.filter((edge) => edge.source !== 'manual' && edge.target !== 'manual')
    const final = project.graph.nodes.find((node) => node.data.blockType === 'final')!
    Object.assign(final.data, finalDnsFailedOptionsPatch(true))
    const graph = compileGraph(project, { validationTarget: 'surge' })
    expect(graph.success, graph.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    const result = compileSurge(graph.ir!, { targetNativeFinalOptions: graph.targetNativeFinalOptions, nativeStrategies: graph.nativeStrategies, nativeRoutes: graph.nativeRoutes, nativeFinalRoute: graph.nativeFinalRoute })
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(result.content).toContain('FINAL,US Auto,dns-failed')

    const removedProject = structuredClone(project)
    const removedFinal = removedProject.graph.nodes.find((node) => node.data.blockType === 'final')!
    Object.assign(removedFinal.data, finalDnsFailedOptionsPatch(false))
    const removedGraph = compileGraph(removedProject, { validationTarget: 'surge' })
    const removedResult = compileSurge(removedGraph.ir!, { targetNativeFinalOptions: removedGraph.targetNativeFinalOptions, nativeStrategies: removedGraph.nativeStrategies, nativeRoutes: removedGraph.nativeRoutes, nativeFinalRoute: removedGraph.nativeFinalRoute })
    expect(removedResult.success).toBe(true)
    expect(removedResult.content).toContain('FINAL,US Auto\n')
    expect(removedResult.content).not.toContain('FINAL,US Auto,dns-failed')
  })

  it('keeps compiler safety authoritative for a persisted DIRECT intent', () => {
    const project = structuredClone(v08BasicRoutingFixture)
    project.primaryTarget = 'surge'
    project.graph.nodes = project.graph.nodes.filter((node) => node.id !== 'manual')
    project.graph.edges = project.graph.edges.filter((edge) => edge.source !== 'manual' && edge.target !== 'manual')
    const final = project.graph.nodes.find((node) => node.data.blockType === 'final')!
    final.data.targetKind = 'direct'
    final.data.targetId = undefined
    final.data.targetLabel = 'DIRECT'
    Object.assign(final.data, finalDnsFailedOptionsPatch(true))
    const graph = compileGraph(project, { validationTarget: 'surge' })
    expect(graph.success).toBe(true)
    const result = compileSurge(graph.ir!, { targetNativeFinalOptions: graph.targetNativeFinalOptions, nativeStrategies: graph.nativeStrategies, nativeRoutes: graph.nativeRoutes, nativeFinalRoute: graph.nativeFinalRoute })
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_FINAL_DNS_FAILED_DIRECT_UNSUPPORTED' }))
    expect(result.content).not.toContain('FINAL,DIRECT,dns-failed')
  })
})
