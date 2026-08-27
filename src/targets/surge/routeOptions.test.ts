import { describe, expect, it } from 'vitest'
import { compileGraph } from '../../core/graphCompiler'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type TrafficMatcherIR } from '../../core/ir'
import { v08BasicRoutingFixture } from '../../core/__fixtures__/v08Acceptance'
import { surgeNativeAcceptanceProject } from '../../core/__fixtures__/surgeNativeStrategies'
import type { TargetNativeRouteOptionsIR } from '../../core/targetNative'
import { compileMihomo } from '../mihomo/compiler'
import { compileLoon } from '../loon/compiler'
import { compileShadowrocket } from '../shadowrocket/compiler'
import { compileSingBox } from '../singbox/compiler'
import { compileSurge } from './compiler'
import { serializeSurgeRule } from './serializer'

const routeOptions: TargetNativeRouteOptionsIR = {
  routeId: 'route', target: 'surge', kind: 'route-options', noResolve: true,
}

function baseIR(matcher: TrafficMatcherIR = { kind: 'ip-cidr', value: '203.0.113.0/24' }): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'route-options', projectName: 'Route options', projectSchemaVersion: 2 },
    sources: [{
      kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [{
        kind: 'socks', protocol: 'socks5', version: '5', id: 'proxy', name: 'Proxy A', server: 'proxy.example.com', port: 1080,
      }],
    }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'proxy-group', name: 'Proxy', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [{ id: 'route', name: 'CIDR route', matcher, target: { kind: 'direct' }, priority: 10 }],
    finalRoute: { target: { kind: 'strategy', id: 'proxy-group' } },
    outputs: [{ id: 'output', name: 'Output', target: 'surge', enabled: true }],
  }
}

function ruleLines(content: string) {
  return content.split('\n').slice(content.split('\n').indexOf('[Rule]') + 1).filter(Boolean)
}

describe('Surge native no-resolve route option', () => {
  it('serializes the fourth rule field without changing ordinary rules', () => {
    expect(serializeSurgeRule('IP-CIDR', '203.0.113.0/24', 'DIRECT', { noResolve: true })).toBe('IP-CIDR,203.0.113.0/24,DIRECT,no-resolve')
    expect(serializeSurgeRule('IP-CIDR', '203.0.113.0/24', 'DIRECT')).toBe('IP-CIDR,203.0.113.0/24,DIRECT')
    expect(() => serializeSurgeRule('DOMAIN', 'example.com', 'DIRECT', { noResolve: true })).toThrow('not supported')
  })

  it.each([
    ['ip-cidr', { kind: 'ip-cidr', value: '203.0.113.0/24' }],
    ['ip-cidr6', { kind: 'ip-cidr6', value: '2001:db8::/32' }],
    ['geo-ip', { kind: 'geo-ip', countryCode: 'CN' }],
    ['asn', { kind: 'asn', value: 13335 }],
  ] as const)('emits no-resolve for %s routes', (_name, matcher) => {
    const result = compileSurge(baseIR(matcher), { targetNativeRouteOptions: [routeOptions] })
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(ruleLines(result.content).some((line) => line.endsWith(',DIRECT,no-resolve'))).toBe(true)
  })

  it('emits no-resolve for service and built-in Rule Set routes', () => {
    const serviceIR = baseIR({ kind: 'service', serviceIds: ['openai'] })
    serviceIR.services = [{ id: 'openai', name: 'OpenAI', ruleSources: [] }]
    const serviceResult = compileSurge(serviceIR, { targetNativeRouteOptions: [routeOptions] })
    expect(serviceResult.success, serviceResult.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(ruleLines(serviceResult.content).some((line) => line.endsWith(',DIRECT,no-resolve'))).toBe(true)

    const ruleSetIR = baseIR({ kind: 'rule-set', id: 'lan-source' })
    ruleSetIR.services = [{ id: 'lan-source', name: 'LAN', ruleSources: [{ id: 'lan-source', provider: 'builtin' }] }]
    const ruleSetResult = compileSurge(ruleSetIR, {
      targetNativeRouteOptions: [routeOptions],
      targetNativeRuleSetSources: [{ sourceId: 'lan-source', target: 'surge', kind: 'builtin-rule-set', name: 'LAN' }],
    })
    expect(ruleSetResult.success, ruleSetResult.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(ruleLines(ruleSetResult.content)).toContain('RULE-SET,LAN,DIRECT,no-resolve')
  })

  it.each([
    ['domain', { kind: 'domain', value: 'example.com' }],
    ['domain-suffix', { kind: 'domain-suffix', value: 'example.com' }],
    ['domain-keyword', { kind: 'domain-keyword', value: 'example' }],
    ['port', { kind: 'port', port: 443 }],
  ] as const)('rejects no-resolve for unsupported %s routes', (_name, matcher) => {
    const result = compileSurge(baseIR(matcher), { targetNativeRouteOptions: [routeOptions] })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_NO_RESOLVE_MATCHER_UNSUPPORTED', severity: 'error' }))
  })

  it('fails closed for malformed, orphaned, duplicate, and ambiguous ownership data', () => {
    const malformed = compileSurge(baseIR(), { targetNativeRouteOptions: [{ ...routeOptions, noResolve: false } as never] })
    expect(malformed.success).toBe(false)
    expect(malformed.content).toBe('')
    expect(malformed.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_ROUTE_OPTIONS_INVALID', severity: 'error' }))

    const extraSemanticField = compileSurge(baseIR(), {
      targetNativeRouteOptions: [{ ...routeOptions, extendedMatching: true } as never],
    })
    expect(extraSemanticField.success).toBe(false)
    expect(extraSemanticField.content).toBe('')
    expect(extraSemanticField.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_ROUTE_OPTIONS_INVALID', severity: 'error' }))

    const orphan = compileSurge(baseIR(), { targetNativeRouteOptions: [{ ...routeOptions, routeId: 'missing' }] })
    expect(orphan.success).toBe(false)
    expect(orphan.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_ROUTE_OPTIONS_ORPHAN', severity: 'error' }))

    const duplicate = compileSurge(baseIR(), { targetNativeRouteOptions: [routeOptions, routeOptions] })
    expect(duplicate.success).toBe(false)
    expect(duplicate.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_ROUTE_OPTIONS_DUPLICATE', severity: 'error' }))

    const ambiguous = compileSurge(baseIR(), {
      targetNativeRouteOptions: [routeOptions],
      nativeRoutes: [{ id: 'route', name: 'Native route', matcher: baseIR().routes[0].matcher, target: { kind: 'strategy', id: 'proxy-group' }, priority: 20 }],
    })
    expect(ambiguous.success).toBe(false)
    expect(ambiguous.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_ROUTE_OPTIONS_OWNER_MISMATCH', severity: 'error' }))
  })

  it('extracts the typed option without adding a modifier to Universal RouteIR', () => {
    const project = structuredClone(v08BasicRoutingFixture)
    project.primaryTarget = 'surge'
    project.graph.nodes = project.graph.nodes.filter((node) => node.id !== 'manual')
    project.graph.edges = project.graph.edges.filter((edge) => edge.source !== 'manual' && edge.target !== 'manual')
    const route = project.graph.nodes.find((node) => node.id === 'openai')!
    route.data.targetNativeRouteOptions = { target: 'surge', kind: 'route-options', noResolve: true }
    const graph = compileGraph(project, { validationTarget: 'surge' })
    expect(graph.success, graph.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(graph.targetNativeRouteOptions).toEqual([{ routeId: 'openai', target: 'surge', kind: 'route-options', noResolve: true }])
    expect(graph.ir?.routes.find((item) => item.id === 'openai')).not.toHaveProperty('noResolve')
    const result = compileSurge(graph.ir!, { targetNativeRouteOptions: graph.targetNativeRouteOptions })
    expect(result.success).toBe(true)
    expect(result.content).toContain(',no-resolve')
  })

  it('applies the option to a native-strategy route without moving it into Universal IR', () => {
    const project = structuredClone(surgeNativeAcceptanceProject)
    project.graph.nodes.push({
      id: 'native-route', type: 'block', position: { x: 0, y: 0 }, data: {
        blockType: 'custom-rule', category: 'routing', title: 'Native CIDR', subtitle: '', icon: 'route',
        routeMatcherKind: 'ip-cidr', routeMatcherValue: '203.0.113.0/24', targetKind: 'strategy', targetId: 'hk-smart',
        targetNativeRouteOptions: { target: 'surge', kind: 'route-options', noResolve: true },
      },
    })
    const graph = compileGraph(project, { validationTarget: 'surge' })
    expect(graph.success, graph.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(graph.ir?.routes.some((route) => route.id === 'native-route')).toBe(false)
    expect(graph.nativeRoutes).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'native-route' })]))
    const result = compileSurge(graph.ir!, { nativeStrategies: graph.nativeStrategies, nativeRoutes: graph.nativeRoutes, nativeFinalRoute: graph.nativeFinalRoute, targetNativeRouteOptions: graph.targetNativeRouteOptions })
    expect(result.success).toBe(true)
    expect(result.content).toContain('IP-CIDR,203.0.113.0/24,Hong Kong Smart,no-resolve')
  })

  it('blocks non-Surge graph validation while preserving the persisted intent', () => {
    const project = structuredClone(v08BasicRoutingFixture)
    const route = project.graph.nodes.find((node) => node.id === 'openai')!
    route.data.targetNativeRouteOptions = { target: 'surge', kind: 'route-options', noResolve: true }
    const graph = compileGraph(project, { validationTarget: 'mihomo' })
    expect(graph.success).toBe(false)
    expect(graph.targetNativeRouteOptions).toEqual([])
    expect(graph.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_ROUTE_OPTIONS_UNSUPPORTED', severity: 'error' }))
    expect(route.data.targetNativeRouteOptions).toEqual({ target: 'surge', kind: 'route-options', noResolve: true })
  })

  it('rejects spoofed Project ownership without producing a route-options IR entry', () => {
    const project = structuredClone(v08BasicRoutingFixture)
    project.primaryTarget = 'surge'
    const route = project.graph.nodes.find((node) => node.id === 'openai')!
    route.data.targetNativeRouteOptions = {
      target: 'surge', kind: 'route-options', noResolve: true, routeId: 'another-route',
    } as never
    const graph = compileGraph(project, { validationTarget: 'surge' })
    expect(graph.success).toBe(false)
    expect(graph.targetNativeRouteOptions).toEqual([])
    expect(graph.issues).toContainEqual(expect.objectContaining({
      code: 'TARGET_NATIVE_ROUTE_OPTIONS_INVALID', nodeId: route.id, severity: 'error',
    }))
  })

  it.each([
    ['mihomo', compileMihomo], ['sing-box', compileSingBox], ['loon', compileLoon], ['shadowrocket', compileShadowrocket],
  ] as const)('fails closed instead of stripping no-resolve in %s', (_target, compiler) => {
    const result = compiler(baseIR(), { targetNativeRouteOptions: [routeOptions] })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_ROUTE_OPTIONS_UNSUPPORTED', severity: 'error' }))
  })
})
