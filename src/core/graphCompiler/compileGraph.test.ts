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
      expect.objectContaining({ id: 'cloudflare-default', kind: 'doh', role: 'default' }),
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
