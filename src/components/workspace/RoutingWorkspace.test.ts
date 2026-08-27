import { describe, expect, it } from 'vitest'
import { targetCapabilityRegistry } from '../../core/capabilities'
import { serviceCatalog } from '../../data/serviceCatalog'
import { legacyChinaServiceDefinition } from '../../data/legacyServices'
import { createBlankProject } from '../../data/newProject'
import type { GraphNode } from '../../types/project'
import {
  capabilityUnavailable, createCustomRuleData, createServiceRuleData, createSurgeBuiltinRuleSetData,
  effectiveRoutingCapability, filterRoutingServices, routingRuleStatusForCapability,
} from './RoutingWorkspace'
import { surgeBuiltinRuleSetSourceId } from '../../core/targetNative'
import { compileGraph } from '../../core/graphCompiler'
import { compileSurge } from '../../targets/surge/compiler'
import type { ProxyFlowProject } from '../../types/project'

describe('Routing Workspace helpers', () => {
  it('filters services by stable product metadata without reading rule source URLs', () => {
    expect(filterRoutingServices(serviceCatalog, 'open').map((service) => service.id)).toEqual(['openai'])
    expect(filterRoutingServices(serviceCatalog, 'streaming').map((service) => service.id)).toEqual(['youtube', 'netflix', 'disney'])
    expect(filterRoutingServices(serviceCatalog, 'no match')).toEqual([])
    expect(filterRoutingServices([...serviceCatalog, legacyChinaServiceDefinition], '')).toEqual(serviceCatalog)
    expect(filterRoutingServices([...serviceCatalog, legacyChinaServiceDefinition], 'China Mainland')).toEqual([])
  })

  it('keeps new-project Service authoring limited to the ten branded services', () => {
    const project = createBlankProject('mihomo')
    expect(project.services).toHaveLength(10)
    expect(project.services.some((service) => service.id === 'china' || service.name === 'China Mainland')).toBe(false)
  })

  it('uses capability declarations to disable only unsupported matcher choices', () => {
    expect(capabilityUnavailable(targetCapabilityRegistry.mihomo.routingMatchers.asn)).toBe(false)
    expect(capabilityUnavailable(targetCapabilityRegistry['sing-box'].routingMatchers.asn)).toBe(true)
    expect(capabilityUnavailable(targetCapabilityRegistry['sing-box'].routingMatchers['rule-set'])).toBe(false)
    expect(capabilityUnavailable(undefined)).toBe(false)
  })

  it('creates the stable Service Rule and Custom Rule data used by the add flow', () => {
    expect(createServiceRuleData(serviceCatalog.find((service) => service.id === 'openai')!)).toEqual(expect.objectContaining({
      title: 'OpenAI', routeMatcherKind: 'service', services: ['openai'],
    }))
    expect(createCustomRuleData('domain-suffix', 'Custom Rule')).toEqual(expect.objectContaining({
      title: 'Custom Rule', routeMatcherKind: 'domain-suffix', routeMatcherValue: '', ruleSource: 'custom',
    }))
    expect(createCustomRuleData('ip-cidr', 'Custom Rule')).toEqual(expect.objectContaining({ routeMatcherKind: 'ip-cidr', routeMatcherValue: '' }))
    expect(createCustomRuleData('port', 'Custom Rule')).toEqual(expect.objectContaining({ routeMatcherKind: 'port', routeMatcherValue: undefined, routeMatcherPort: undefined }))
    expect(createCustomRuleData('source-port', 'Source Port')).toEqual(expect.objectContaining({ routeMatcherKind: 'source-port', routeMatcherPort: undefined, targetNativeSourcePort: undefined }))
  })

  it('marks retained matchers unsupported by the selected target without deleting them', () => {
    expect(routingRuleStatusForCapability('ready', 'asn', targetCapabilityRegistry['sing-box'].routingMatchers)).toBe('error')
    expect(routingRuleStatusForCapability('ready', 'asn', targetCapabilityRegistry.mihomo.routingMatchers)).toBe('ready')
    expect(routingRuleStatusForCapability('disabled', 'asn', targetCapabilityRegistry['sing-box'].routingMatchers)).toBe('disabled')
    expect(capabilityUnavailable(targetCapabilityRegistry.surge.routingMatchers['source-port'])).toBe(false)
    expect(capabilityUnavailable(targetCapabilityRegistry.mihomo.routingMatchers['source-port'])).toBe(true)
    expect(routingRuleStatusForCapability('ready', 'source-port', targetCapabilityRegistry.mihomo.routingMatchers)).toBe('error')
  })

  it('creates typed Surge built-in source data with deterministic IDs', () => {
    expect(surgeBuiltinRuleSetSourceId('LAN')).toBe('surge-builtin-ruleset-lan')
    expect(createSurgeBuiltinRuleSetData('LAN', 'LAN')).toEqual(expect.objectContaining({
      routeMatcherKind: 'rule-set', routeMatcherValue: 'surge-builtin-ruleset-lan',
      targetNativeRuleSet: { target: 'surge', kind: 'builtin-rule-set', name: 'LAN' },
      customRuleSource: undefined,
    }))
    expect(createSurgeBuiltinRuleSetData('SYSTEM', 'SYSTEM').targetNativeRuleSet).toEqual({ target: 'surge', kind: 'builtin-rule-set', name: 'SYSTEM' })
  })

  it('treats typed Surge built-ins as supported only on Surge', () => {
    const node = {
      id: 'lan', type: 'block', position: { x: 0, y: 0 },
      data: { blockType: 'custom-rule', category: 'routing', title: 'LAN', subtitle: '', icon: 'route', routeMatcherKind: 'rule-set', routeMatcherValue: 'surge-builtin-ruleset-lan', targetNativeRuleSet: { target: 'surge', kind: 'builtin-rule-set', name: 'LAN' } },
    } as GraphNode
    expect(effectiveRoutingCapability(node, 'rule-set', targetCapabilityRegistry.surge.routingMatchers, 'surge')?.status).toBe('supported')
    expect(effectiveRoutingCapability(node, 'rule-set', targetCapabilityRegistry.mihomo.routingMatchers, 'mihomo')?.status).toBe('unsupported')
    expect(routingRuleStatusForCapability('ready', 'rule-set', targetCapabilityRegistry.surge.routingMatchers, node, 'surge')).toBe('ready')
    expect(routingRuleStatusForCapability('ready', 'rule-set', targetCapabilityRegistry.mihomo.routingMatchers, node, 'mihomo')).toBe('error')

    expect(effectiveRoutingCapability(undefined, 'source-port', {}, 'surge')?.status).toBe('supported')
    expect(effectiveRoutingCapability(undefined, 'source-port', {}, 'mihomo')?.status).toBe('unsupported')
  })

  it('carries Workspace-created LAN data through graph and Surge compilation', () => {
    const data = createSurgeBuiltinRuleSetData('LAN', 'LAN')
    const project: ProxyFlowProject = {
      version: 1, id: 'workspace-built-in', name: 'Workspace built-in', primaryTarget: 'surge',
      graph: { nodes: [
        { id: 'route', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'custom-rule', category: 'routing', title: 'LAN', subtitle: '', icon: 'rule', targetKind: 'direct', ...data } },
        { id: 'final', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'final', category: 'routing', title: 'Final', subtitle: '', icon: 'flag', targetKind: 'direct' } },
        { id: 'output', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'output', category: 'output', title: 'Surge', subtitle: '', icon: 'export', client: 'surge' } },
      ], edges: [] },
      services: [], outputs: [], updatedAt: '2026-08-27T00:00:00.000Z',
    }
    const graph = compileGraph(project)
    expect(graph.success, graph.issues.map((issue) => issue.code).join(',')).toBe(true)
    const compiled = compileSurge(graph.ir!, { nativeRuleSetSources: graph.nativeRuleSetSources })
    expect(compiled.success, compiled.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(compiled.content).toContain('RULE-SET,LAN,DIRECT')
  })

  it('carries Workspace-created SYSTEM data through graph and Surge compilation', () => {
    const data = createSurgeBuiltinRuleSetData('SYSTEM', 'SYSTEM')
    const project: ProxyFlowProject = {
      version: 1, id: 'workspace-built-in-system', name: 'Workspace built-in SYSTEM', primaryTarget: 'surge',
      graph: { nodes: [
        { id: 'route', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'custom-rule', category: 'routing', title: 'SYSTEM', subtitle: '', icon: 'rule', targetKind: 'direct', ...data } },
        { id: 'final', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'final', category: 'routing', title: 'Final', subtitle: '', icon: 'flag', targetKind: 'direct' } },
        { id: 'output', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'output', category: 'output', title: 'Surge', subtitle: '', icon: 'export', client: 'surge' } },
      ], edges: [] },
      services: [], outputs: [], updatedAt: '2026-08-27T00:00:00.000Z',
    }
    const graph = compileGraph(project)
    expect(graph.success, graph.issues.map((issue) => issue.code).join(',')).toBe(true)
    const compiled = compileSurge(graph.ir!, { nativeRuleSetSources: graph.nativeRuleSetSources })
    expect(compiled.success, compiled.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(compiled.content).toContain('RULE-SET,SYSTEM,DIRECT')
  })
})
