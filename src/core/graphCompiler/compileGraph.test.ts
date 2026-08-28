import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import {
  chinaDirectFixture,
  customDomainRouteFixture,
  customPortRouteFixture,
  fallbackFixture,
  fixedStrategyFixture,
  hkJpUsChainFixture,
  hkUsChainFixture,
  invalidChainCycleFixture,
  invalidChainMissingReferenceFixture,
  invalidChainSelfFixture,
  invalidEmptyChainFixture,
  invalidMissingFinalFixture,
  invalidMissingRouteTargetFixture,
  invalidMissingTransformInputFixture,
  invalidAutoMissingSourceFixture,
  loadBalanceFixture,
  manualSelectFixture,
  openAiRouteFixture,
  processingChainFixture,
  sourceVariantsFixture,
  subscriptionFilterAutoFixture,
  twoSourcesMergeFixture,
} from '../__fixtures__/graphFixtures'
import { compileGraph } from './compileGraph'

describe('compileGraph', () => {
  it('compiles subscription → filter → auto select with explicit references', () => {
    const result = compileGraph(subscriptionFilterAutoFixture)
    expect(result.success).toBe(true)
    expect(result.ir?.sources[0]).toEqual(expect.objectContaining({ kind: 'subscription', id: 'subscription' }))
    expect(result.ir?.transforms[0]).toEqual(expect.objectContaining({ kind: 'filter', input: { kind: 'source', id: 'subscription' } }))
    expect(result.ir?.strategies[0]).toEqual(expect.objectContaining({ kind: 'auto-select', source: { kind: 'transform', id: 'filter' } }))
    expect(result.ir?.sources[0]).toEqual(expect.objectContaining({
      remote: expect.objectContaining({
        kind: 'remote-subscription', id: 'subscription', requestProfile: 'auto', exportMode: 'auto',
      }),
    }))
  })

  it('treats a missing persisted URL export mode as materialized', () => {
    const legacy = structuredClone(subscriptionFilterAutoFixture)
    delete legacy.graph.nodes.find((node) => node.id === 'subscription')!.data.subscriptionExportMode
    const source = compileGraph(legacy).ir?.sources.find((item) => item.id === 'subscription')
    expect(source?.kind === 'subscription' ? source.remote?.exportMode : undefined).toBe('materialized')
  })

  it('compiles a deterministic processing chain', () => {
    const result = compileGraph(processingChainFixture)
    expect(result.success).toBe(true)
    expect(result.ir?.transforms.map((transform) => transform.kind)).toEqual(['filter', 'rename', 'sort'])
    expect(result.ir?.transforms[2]).toEqual(expect.objectContaining({ input: { kind: 'transform', id: 'rename' } }))
  })

  it('compiles merge with two source references', () => {
    const result = compileGraph(twoSourcesMergeFixture)
    expect(result.success).toBe(true)
    expect(result.ir?.transforms[0]).toEqual(expect.objectContaining({
      kind: 'merge',
      inputs: [{ kind: 'source', id: 'source-a' }, { kind: 'source', id: 'source-b' }],
    }))
  })

  it('compiles all V0.2 source variants as discriminated unions', () => {
    const result = compileGraph(sourceVariantsFixture)
    expect(result.success).toBe(true)
    expect(result.ir?.sources.map((source) => source.kind)).toEqual(['manual-proxy', 'provider', 'imported-config'])
    const manual = result.ir?.sources[0]
    expect(manual?.kind === 'manual-proxy' ? manual.proxies[0] : undefined).toEqual(expect.objectContaining({
      kind: 'unmodeled', protocol: 'unmodeled',
    }))
  })

  it('compiles service and DIRECT routes', () => {
    const openAi = compileGraph(openAiRouteFixture)
    const china = compileGraph(chinaDirectFixture)
    expect(openAi.ir?.routes[0]).toEqual(expect.objectContaining({ matcher: { kind: 'service', serviceIds: ['openai'] }, target: { kind: 'strategy', id: 'us-auto' } }))
    expect(china.ir?.routes[0].target).toEqual({ kind: 'direct' })
  })

  it.each(['DIRECT', 'REJECT'] as const)('keeps a typed strategy target when its label is %s', (targetLabel) => {
    const project = structuredClone(openAiRouteFixture)
    const route = project.graph.nodes.find((node) => node.id === 'openai-route')!
    route.data.targetKind = 'strategy'
    route.data.targetLabel = targetLabel
    const result = compileGraph(project)
    expect(result.success).toBe(true)
    expect(result.ir?.routes.find((item) => item.id === route.id)?.target).toEqual({ kind: 'strategy', id: 'us-auto' })
  })

  it.each(['direct-labeled-strategy', 'reject-labeled-strategy'] as const)('keeps a typed strategy target whose ID contains %s', (targetId) => {
    const project = structuredClone(openAiRouteFixture)
    const source = project.graph.nodes.find((node) => node.id === 'subscription')!
    const original = project.graph.nodes.find((node) => node.id === 'us-auto')!
    const strategy = { ...structuredClone(original), id: targetId, data: { ...structuredClone(original.data), title: targetId } }
    project.graph.nodes.push(strategy)
    project.graph.edges.push({ id: `e-sub-${targetId}`, source: source.id, target: targetId, type: 'smoothstep', data: { semantic: 'data' } })
    const route = project.graph.nodes.find((node) => node.id === 'openai-route')!
    route.data.targetKind = 'strategy'
    route.data.targetId = targetId
    route.data.targetLabel = targetId
    const routeEdge = project.graph.edges.find((edge) => edge.source === route.id && edge.data?.semantic === 'route')!
    routeEdge.target = targetId
    const result = compileGraph(project)
    expect(result.success).toBe(true)
    expect(result.ir?.routes.find((item) => item.id === route.id)?.target).toEqual({ kind: 'strategy', id: targetId })
  })

  it.each([
    ['direct', 'REJECT', { kind: 'direct' }],
    ['reject', 'DIRECT', { kind: 'reject' }],
  ] as const)('keeps typed %s targets independent of their labels', (targetKind, targetLabel, expectedTarget) => {
    const project = structuredClone(openAiRouteFixture)
    const route = project.graph.nodes.find((node) => node.id === 'openai-route')!
    route.data.targetKind = targetKind
    route.data.targetId = 'us-auto'
    route.data.targetLabel = targetLabel
    const result = compileGraph(project)
    expect(result.success).toBe(true)
    expect(result.ir?.routes.find((item) => item.id === route.id)?.target).toEqual(expectedTarget)
  })

  it.each([
    ['strategy target without an ID', (data: typeof openAiRouteFixture.graph.nodes[number]['data']) => {
      data.targetKind = 'strategy'
      data.targetId = undefined
      data.targetLabel = 'DIRECT'
    }],
    ['unknown strategy target', (data: typeof openAiRouteFixture.graph.nodes[number]['data']) => {
      data.targetKind = 'strategy'
      data.targetId = 'missing-strategy'
      data.targetLabel = 'REJECT'
    }],
    ['missing target kind', (data: typeof openAiRouteFixture.graph.nodes[number]['data']) => {
      data.targetKind = undefined
      data.targetId = 'us-auto'
      data.targetLabel = 'DIRECT'
    }],
  ] as const)('fails closed for a %s instead of inferring a built-in target', (_name, configure) => {
    const project = structuredClone(openAiRouteFixture)
    const route = project.graph.nodes.find((node) => node.id === 'openai-route')!
    configure(route.data)
    const result = compileGraph(project)
    expect(result.success).toBe(false)
    expect(result.ir).toBeUndefined()
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'ROUTE_TARGET_MISSING', nodeId: route.id, severity: 'error' }))
  })

  it.each(['DIRECT', 'REJECT'] as const)('keeps a Final strategy target when its label is %s', (targetLabel) => {
    const project = structuredClone(openAiRouteFixture)
    const final = project.graph.nodes.find((node) => node.id === 'final')!
    final.data.targetKind = 'strategy'
    final.data.targetId = 'us-auto'
    final.data.targetLabel = targetLabel
    const result = compileGraph(project)
    expect(result.success).toBe(true)
    expect(result.ir?.finalRoute?.target).toEqual({ kind: 'strategy', id: 'us-auto' })
  })

  it('compiles typed custom route matchers', () => {
    const domain = compileGraph(customDomainRouteFixture)
    const port = compileGraph(customPortRouteFixture)
    expect(domain.success).toBe(true)
    expect(domain.ir?.routes[0]).toEqual(expect.objectContaining({ matcher: { kind: 'domain-suffix', value: 'example.com' } }))
    expect(port.success).toBe(true)
    expect(port.ir?.routes[0]).toEqual(expect.objectContaining({ matcher: { kind: 'port', port: 443 } }))
  })

  it('compiles manual select, fallback and load balance strategies', () => {
    expect(compileGraph(manualSelectFixture).ir?.strategies[0]).toEqual(expect.objectContaining({ kind: 'select', candidates: [{ kind: 'source', id: 'source' }] }))
    expect(compileGraph(fallbackFixture).ir?.strategies[0]).toEqual(expect.objectContaining({ kind: 'fallback', candidates: [{ kind: 'source', id: 'source-a' }, { kind: 'source', id: 'source-b' }] }))
    expect(compileGraph(loadBalanceFixture).ir?.strategies[0]).toEqual(expect.objectContaining({ kind: 'load-balance', mode: 'consistent-hash' }))
    expect(compileGraph(fixedStrategyFixture).ir?.strategies[0]).toEqual(expect.objectContaining({ kind: 'fixed', proxyId: 'proxy' }))
  })

  it('preserves two-hop and three-hop chain order', () => {
    expect(compileGraph(hkUsChainFixture).ir?.strategies.find((strategy) => strategy.kind === 'chain')).toEqual(expect.objectContaining({
      hops: [{ kind: 'strategy', id: 'hk-auto' }, { kind: 'strategy', id: 'us-auto' }],
    }))
    expect(compileGraph(hkJpUsChainFixture).ir?.strategies.find((strategy) => strategy.kind === 'chain')).toEqual(expect.objectContaining({
      hops: [{ kind: 'strategy', id: 'hk-auto' }, { kind: 'strategy', id: 'jp-auto' }, { kind: 'strategy', id: 'us-auto' }],
    }))
  })

  it('compiles the full demo graph into client-agnostic IR', () => {
    const result = compileGraph(demoProject)
    expect(result.success).toBe(true)
    expect(result.ir).toEqual(expect.objectContaining({ version: 2, finalRoute: { target: { kind: 'strategy', id: 'us-via-hk' } } }))
    expect(result.ir?.strategies.find((strategy) => strategy.id === 'us-via-hk')).toEqual(expect.objectContaining({ kind: 'chain', hops: [{ kind: 'strategy', id: 'hk-auto' }, { kind: 'strategy', id: 'us-auto' }] }))
    expect(result.ir?.routes.find((route) => route.id === 'ai-services')).toEqual(expect.objectContaining({ matcher: { kind: 'service', serviceIds: ['openai', 'claude', 'gemini'] }, target: { kind: 'strategy', id: 'us-via-hk' } }))
    expect(result.ir?.outputs[0]).toEqual(expect.objectContaining({ target: 'mihomo' }))
    expect(result.ir?.dns?.resolvers).toEqual([
      expect.objectContaining({ id: 'alidns-default', kind: 'doh', role: 'default' }),
      expect.objectContaining({ id: 'dnspod-default', kind: 'doh', role: 'default' }),
    ])
  })

  it('compiles multiple resolvers from one DNS owner and rejects a second owner', () => {
    const project = structuredClone(demoProject)
    const dns = project.graph.nodes.find((node) => node.data.blockType === 'dns')!
    dns.data.dnsResolvers = [
      { id: 'global', name: 'Global', kind: 'doh', role: 'default', address: 'https://dns.example.com/dns-query', enabled: true },
      { id: 'direct', name: 'Direct', kind: 'udp', role: 'direct', address: '192.0.2.53:53', enabled: true },
      { id: 'disabled', name: 'Disabled', kind: 'doh', role: 'fallback', address: 'https://fallback.example.com/dns-query', enabled: false },
    ]
    expect(compileGraph(project).ir?.dns?.resolvers).toEqual([
      expect.objectContaining({ id: 'global', role: 'default' }),
      expect.objectContaining({ id: 'direct', role: 'direct' }),
    ])

    project.graph.nodes.push({ ...structuredClone(dns), id: 'dns-second' })
    const blocked = compileGraph(project)
    expect(blocked.success).toBe(false)
    expect(blocked.issues).toContainEqual(expect.objectContaining({ code: 'DNS_MULTIPLE', severity: 'error' }))
  })

  it('fails closed for malformed imported DNS resolver data instead of throwing', () => {
    const project = structuredClone(demoProject)
    const dns = project.graph.nodes.find((node) => node.data.blockType === 'dns')!
    dns.data.dnsResolvers = [{
      id: 'malformed', name: 'Malformed', kind: 'doh', role: 'default', address: 53, enabled: true,
    } as never]

    const result = compileGraph(project)
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'DNS_RESOLVER_INVALID', severity: 'error' }))
  })

  it('resolves DNS ownership independently from Universal intent', () => {
    const noOwner = structuredClone(demoProject)
    noOwner.graph.nodes.find((node) => node.data.blockType === 'dns')!.data.disabled = true
    const noOwnerResult = compileGraph(noOwner)
    expect(noOwnerResult.success).toBe(true)
    expect(noOwnerResult.effectiveDnsNodeId).toBeUndefined()
    expect(noOwnerResult.ir?.dns).toBeUndefined()

    const none = structuredClone(demoProject)
    const noneDns = none.graph.nodes.find((node) => node.data.blockType === 'dns')!
    noneDns.data.universalDnsMode = 'none'
    noneDns.data.dnsResolvers = [{ id: 'bad', name: 'Bad', kind: 'doh', role: 'default', address: 42, enabled: true } as never]
    const noneResult = compileGraph(none)
    expect(noneResult.success).toBe(true)
    expect(noneResult.effectiveDnsNodeId).toBe(noneDns.id)
    expect(noneResult.ir?.dns).toBeUndefined()
    expect(noneResult.issues.some((issue) => issue.code.startsWith('DNS_'))).toBe(false)

    const automatic = structuredClone(demoProject)
    const automaticDns = automatic.graph.nodes.find((node) => node.data.blockType === 'dns')!
    automaticDns.data.universalDnsMode = 'automatic'
    automaticDns.data.dnsResolvers = []
    const automaticResult = compileGraph(automatic)
    expect(automaticResult.success).toBe(true)
    expect(automaticResult.effectiveDnsNodeId).toBe(automaticDns.id)
    expect(automaticResult.ir?.dns).toEqual({ enabled: true, mode: 'automatic' })
    expect(automaticResult.issues).toContainEqual(expect.objectContaining({ code: 'DNS_RESOLVER_MISSING', severity: 'warning' }))

    const custom = structuredClone(demoProject)
    const customDns = custom.graph.nodes.find((node) => node.data.blockType === 'dns')!
    customDns.data.universalDnsMode = 'custom'
    const customResult = compileGraph(custom)
    expect(customResult.success).toBe(true)
    expect(customResult.effectiveDnsNodeId).toBe(customDns.id)
    expect(customResult.ir?.dns?.mode).toBe('custom')

    const customEmpty = structuredClone(custom)
    customEmpty.graph.nodes.find((node) => node.data.blockType === 'dns')!.data.dnsResolvers = []
    const customEmptyResult = compileGraph(customEmpty)
    expect(customEmptyResult.success).toBe(false)
    expect(customEmptyResult.ir).toBeUndefined()
    expect(customEmptyResult.issues).toContainEqual(expect.objectContaining({ code: 'DNS_RESOLVER_MISSING', severity: 'error' }))

    const automaticMalformed = structuredClone(demoProject)
    const automaticMalformedDns = automaticMalformed.graph.nodes.find((node) => node.data.blockType === 'dns')!
    automaticMalformedDns.data.universalDnsMode = 'automatic'
    automaticMalformedDns.data.dnsResolvers = [{ id: 'bad', name: 'Bad', kind: 'doh', role: 'default', address: 42, enabled: true } as never]
    const automaticMalformedResult = compileGraph(automaticMalformed)
    expect(automaticMalformedResult.success).toBe(true)
    expect(automaticMalformedResult.ir?.dns).toEqual({ enabled: true, mode: 'automatic' })
    expect(automaticMalformedResult.issues.some((issue) => issue.code === 'DNS_RESOLVER_INVALID')).toBe(false)
  })

  it('infers the legacy mode at the direct compileGraph boundary', () => {
    const legacyAutomatic = structuredClone(demoProject)
    const automaticDns = legacyAutomatic.graph.nodes.find((node) => node.data.blockType === 'dns')!
    delete automaticDns.data.universalDnsMode
    automaticDns.data.dnsResolvers = []
    expect(compileGraph(legacyAutomatic).ir?.dns).toEqual({ enabled: true, mode: 'automatic' })

    const legacyCustom = structuredClone(demoProject)
    const customDns = legacyCustom.graph.nodes.find((node) => node.data.blockType === 'dns')!
    delete customDns.data.universalDnsMode
    expect(compileGraph(legacyCustom).ir?.dns?.mode).toBe('custom')
  })

  it('fails closed for malformed DNS modes and multiple enabled owners', () => {
    const malformed = structuredClone(demoProject)
    malformed.graph.nodes.find((node) => node.data.blockType === 'dns')!.data.universalDnsMode = 'future' as never
    const malformedResult = compileGraph(malformed)
    expect(malformedResult.success).toBe(false)
    expect(malformedResult.effectiveDnsNodeId).toBe('dns')
    expect(malformedResult.issues).toContainEqual(expect.objectContaining({ code: 'DNS_MODE_INVALID', severity: 'error' }))

    const multiple = structuredClone(demoProject)
    const dns = multiple.graph.nodes.find((node) => node.data.blockType === 'dns')!
    multiple.graph.nodes.push({ ...structuredClone(dns), id: 'dns-second', position: { x: dns.position.x + 20, y: dns.position.y + 20 } })
    const multipleResult = compileGraph(multiple)
    expect(multipleResult.success).toBe(false)
    expect(multipleResult.effectiveDnsNodeId).toBeUndefined()
    expect(multipleResult.issues).toContainEqual(expect.objectContaining({ code: 'DNS_MULTIPLE', severity: 'error' }))
  })

  it('reports stable codes for invalid graph semantics', () => {
    const cases = [
      [invalidMissingTransformInputFixture, 'TRANSFORM_MISSING_INPUT'],
      [invalidAutoMissingSourceFixture, 'AUTO_SELECT_MISSING_SOURCE'],
      [invalidMissingRouteTargetFixture, 'ROUTE_TARGET_MISSING'],
      [invalidEmptyChainFixture, 'CHAIN_EMPTY'],
      [invalidChainSelfFixture, 'CHAIN_SELF_REFERENCE'],
      [invalidChainCycleFixture, 'CHAIN_CYCLE'],
      [invalidChainMissingReferenceFixture, 'CHAIN_REFERENCE_NOT_FOUND'],
      [invalidMissingFinalFixture, 'FINAL_MISSING'],
    ] as const
    for (const [fixture, code] of cases) {
      const result = compileGraph(fixture)
      expect(result.success, fixture.id).toBe(false)
      expect(result.ir, fixture.id).toBeUndefined()
      expect(result.issues.some((issue) => issue.code === code), fixture.id).toBe(true)
    }
  })

  it('retains an invalid draft only for scoped inspector diagnostics', () => {
    const blocked = compileGraph(invalidMissingTransformInputFixture)
    const diagnostic = compileGraph(invalidMissingTransformInputFixture, { retainDraftOnErrorForDiagnostics: true })
    expect(blocked).toEqual(expect.objectContaining({ success: false, ir: undefined }))
    expect(diagnostic.success).toBe(false)
    expect(diagnostic.ir).toBeDefined()
    expect(diagnostic.ir?.transforms.find((transform) => transform.id === 'orphan-filter')).toBeUndefined()
    expect(diagnostic.issues).toContainEqual(expect.objectContaining({ code: 'TRANSFORM_MISSING_INPUT', nodeId: 'orphan-filter' }))
  })

  it('is deterministic across repeated compilation', () => {
    const baseline = JSON.stringify(compileGraph(demoProject))
    for (let index = 0; index < 100; index += 1) expect(JSON.stringify(compileGraph(demoProject))).toBe(baseline)
  })
})
