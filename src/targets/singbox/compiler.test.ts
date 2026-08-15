import { describe, expect, it } from 'vitest'
import { chainIR, explicitProxyIR, unresolvedSubscriptionIR } from '../../core/__fixtures__/crossTargetFixtures'
import type { ProxyFlowIR, TrafficMatcherIR } from '../../core/ir'
import { compileMihomo } from '../mihomo'
import { compileSingBox, SingBoxCompiler } from './compiler'
import type { SingBoxConfig, SingBoxOutbound } from './model'

const fixedNow = () => new Date('2026-08-16T00:00:00.000Z')

function compile(ir: ProxyFlowIR) {
  const result = compileSingBox(ir, { now: fixedNow })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  expect(result.mock).toBe(false)
  return { result, config: JSON.parse(result.content) as SingBoxConfig }
}

function outbound(config: SingBoxConfig, tag: string) {
  return config.outbounds.find((item) => item.tag === tag)
}

describe('SingBoxCompiler', () => {
  it('compiles the same explicit-proxy IR as Mihomo and keeps the async contract', async () => {
    const ir = explicitProxyIR()
    expect(compileMihomo(ir, { now: fixedNow }).success).toBe(true)
    const pending = new SingBoxCompiler(fixedNow).compile(ir)
    expect(pending).toBeInstanceOf(Promise)
    const result = await pending
    expect(result).toEqual(expect.objectContaining({ success: true, mock: false, generatedAt: '2026-08-16T00:00:00.000Z' }))
    expect(() => JSON.parse(result.content)).not.toThrow()
  })

  it('materializes HTTP and SOCKS outbounds plus selector and URLTest strategies', () => {
    const { config } = compile(explicitProxyIR())
    expect(outbound(config, 'US HTTP')).toEqual(expect.objectContaining({
      type: 'http', server: 'us-http.example.com', server_port: 8080, username: 'alice', password: 'secret',
    }))
    expect(outbound(config, 'HK SOCKS')).toEqual(expect.objectContaining({ type: 'socks', version: '5', server_port: 1080 }))
    expect(outbound(config, 'US Select')).toEqual({
      type: 'selector', tag: 'US Select', outbounds: ['US HTTP', 'US SOCKS'], default: 'US HTTP',
    })
    expect(outbound(config, 'Hong Kong Auto')).toEqual(expect.objectContaining({
      type: 'urltest', outbounds: ['HK SOCKS'], interval: '180s', tolerance: 80,
    }))
  })

  it('lowers service, domain, suffix, keyword, IP, IPv6, port, reject and final actions', () => {
    const ir = explicitProxyIR()
    const matchers: TrafficMatcherIR[] = [
      { kind: 'domain', value: 'exact.example' },
      { kind: 'domain-suffix', value: 'suffix.example' },
      { kind: 'domain-keyword', value: 'needle' },
      { kind: 'ip-cidr', value: '192.0.2.0/24' },
      { kind: 'ip-cidr6', value: '2001:db8::/32' },
      { kind: 'port', port: 443 },
    ]
    ir.routes = matchers.map((matcher, index) => ({
      id: `route-${index}`, name: `Route ${index}`, matcher,
      target: index === 2 ? { kind: 'reject' } : { kind: 'direct' }, priority: index,
    }))
    ir.finalRoute = { target: { kind: 'reject' } }
    const { config } = compile(ir)
    expect(config.route.rules).toEqual([
      { domain: ['exact.example'], action: 'route', outbound: 'direct' },
      { domain_suffix: ['suffix.example'], action: 'route', outbound: 'direct' },
      { domain_keyword: ['needle'], action: 'reject' },
      { ip_cidr: ['192.0.2.0/24'], action: 'route', outbound: 'direct' },
      { ip_cidr: ['2001:db8::/32'], action: 'route', outbound: 'direct' },
      { port: [443], action: 'route', outbound: 'direct' },
    ])
    expect(config.route.final).toBe('block')
    expect(outbound(config, 'block')).toEqual({ type: 'block', tag: 'block' })
  })

  it('maps modern DNS servers and supplies a domain resolver to hostname outbounds', () => {
    const ir = explicitProxyIR()
    ir.dns!.resolvers = [
      { id: 'doh', kind: 'doh', address: 'https://dns.example.com/custom-query' },
      { id: 'dot', kind: 'dot', address: 'tls://1.1.1.1:853' },
      { id: 'udp', kind: 'udp', address: 'udp://8.8.8.8:53' },
      { id: 'system', kind: 'system', address: 'system' },
    ]
    const { config } = compile(ir)
    expect(config.dns?.servers).toEqual([
      { type: 'https', tag: 'doh', server: 'dns.example.com', path: '/custom-query' },
      { type: 'tls', tag: 'dot', server: '1.1.1.1', server_port: 853 },
      { type: 'udp', tag: 'udp', server: '8.8.8.8', server_port: 53 },
      { type: 'local', tag: 'system' },
    ])
    expect(config.route.default_domain_resolver).toBe('doh')
    expect(outbound(config, 'US HTTP')).toEqual(expect.objectContaining({ domain_resolver: 'doh' }))
    expect(outbound(config, 'US SOCKS')).not.toHaveProperty('domain_resolver')
  })

  it('lowers remote source and binary rule sets and rejects incompatible formats', () => {
    const ir = explicitProxyIR()
    ir.services.push({
      id: 'remote', name: 'Remote Rules', inlineMatchers: [],
      ruleSources: [{ id: 'remote-source', provider: 'remote', format: 'sing-box-source', url: 'https://example.com/rules.json' }],
    })
    ir.services.push({
      id: 'binary', name: 'Binary Rules',
      ruleSources: [{ id: 'remote-binary', provider: 'remote', format: 'sing-box-binary', url: 'https://example.com/rules.srs' }],
    })
    ir.routes = [
      { id: 'source-route', name: 'Source', matcher: { kind: 'service', serviceIds: ['remote'] }, target: { kind: 'direct' }, priority: 1 },
      { id: 'binary-route', name: 'Binary', matcher: { kind: 'rule-set', id: 'remote-binary' }, target: { kind: 'reject' }, priority: 2 },
    ]
    const { config } = compile(ir)
    expect(config.route.rule_set).toEqual([
      expect.objectContaining({ type: 'remote', format: 'source', url: 'https://example.com/rules.json' }),
      expect.objectContaining({ type: 'remote', format: 'binary', url: 'https://example.com/rules.srs' }),
    ])
    expect(config.route.rules).toEqual([
      expect.objectContaining({ rule_set: ['Remote Rules'], action: 'route', outbound: 'direct' }),
      expect.objectContaining({ rule_set: ['remote-binary'], action: 'reject' }),
    ])

    ir.services[2].ruleSources[0].format = 'yaml'
    expect(compileSingBox(ir, { now: fixedNow }).issues.map((issue) => issue.code)).toContain('SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED')
  })

  it('preserves client → HK → US → internet direction for a two-hop detour chain', () => {
    const ir = chainIR(2)
    expect(compileMihomo(ir, { now: fixedNow }).success).toBe(true)
    const { config } = compile(ir)
    const chain = outbound(config, 'US via HK')
    expect(chain).toEqual(expect.objectContaining({ type: 'urltest' }))
    const members = chain && 'outbounds' in chain ? chain.outbounds : []
    expect(members).toHaveLength(2)
    for (const member of members) expect(outbound(config, member)).toEqual(expect.objectContaining({ detour: 'Hong Kong Auto' }))
  })

  it('preserves all three hops and removes conflicting resolver fields on detoured outbounds', () => {
    const { config } = compile(chainIR(3))
    const final = outbound(config, 'US via HK JP')
    const finalMember = final && 'outbounds' in final ? final.outbounds[0] : undefined
    const finalProxy = outbound(config, finalMember!) as SingBoxOutbound & { detour?: string }
    expect(finalProxy.detour).toBe('US via HK JP · Hop 2')
    expect(finalProxy).not.toHaveProperty('domain_resolver')
    const middle = outbound(config, finalProxy.detour!)
    const middleMember = middle && 'outbounds' in middle ? middle.outbounds[0] : undefined
    expect(outbound(config, middleMember!)).toEqual(expect.objectContaining({ detour: 'Hong Kong Auto' }))
  })

  it('fails closed for unresolved sources, fallback, load balance and cyclic chains', () => {
    const unresolved = unresolvedSubscriptionIR()
    expect(compileMihomo(unresolved, { now: fixedNow }).success).toBe(true)
    expect(compileSingBox(unresolved, { now: fixedNow }).issues.map((issue) => issue.code)).toContain('SINGBOX_SOURCE_REQUIRES_RESOLVED_PROXIES')

    const unsupported = explicitProxyIR()
    unsupported.strategies.push({ kind: 'fallback', id: 'fallback', name: 'Fallback', candidates: [{ kind: 'source', id: 'us-source' }] })
    unsupported.strategies.push({ kind: 'load-balance', id: 'balance', name: 'Balance', source: { kind: 'source', id: 'us-source' } })
    const unsupportedResult = compileSingBox(unsupported, { now: fixedNow })
    expect(unsupportedResult.success).toBe(false)
    expect(unsupportedResult.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'SINGBOX_STRATEGY_FALLBACK_UNSUPPORTED', 'SINGBOX_STRATEGY_LOAD_BALANCE_UNSUPPORTED',
    ]))
    expect(compileMihomo(unsupported, { now: fixedNow }).success).toBe(true)

    const cyclic = chainIR(2)
    cyclic.strategies.push({ kind: 'chain', id: 'cycle-a', name: 'Cycle A', hops: [{ kind: 'strategy', id: 'cycle-b' }] })
    cyclic.strategies.push({ kind: 'chain', id: 'cycle-b', name: 'Cycle B', hops: [{ kind: 'strategy', id: 'cycle-a' }] })
    const cyclicResult = compileSingBox(cyclic, { now: fixedNow })
    expect(cyclicResult.success).toBe(false)
    expect(cyclicResult.issues.map((issue) => issue.code)).toContain('IR_CHAIN_CYCLE')
  })

  it('resolves tag collisions and emits byte-identical JSON across 100 compiles', () => {
    const ir = explicitProxyIR()
    ir.strategies[0].name = 'Duplicate'
    ir.strategies[1].name = 'Duplicate'
    const first = compile(ir).result.content
    const parsed = JSON.parse(first) as SingBoxConfig
    expect(parsed.outbounds.map((item) => item.tag)).toEqual(expect.arrayContaining(['Duplicate', 'Duplicate 2']))
    for (let index = 0; index < 100; index += 1) expect(compileSingBox(ir, { now: fixedNow }).content).toBe(first)
  })

  it('rejects unsafe rule-set URLs and unsupported Geo/ASN matchers with stable codes', () => {
    const ir = explicitProxyIR()
    ir.services.push({
      id: 'unsafe', name: 'Unsafe',
      ruleSources: [{ id: 'unsafe-rules', provider: 'remote', format: 'sing-box-source', url: 'file:///tmp/rules.json' }],
    })
    ir.routes = [
      { id: 'unsafe-route', name: 'Unsafe', matcher: { kind: 'service', serviceIds: ['unsafe'] }, target: { kind: 'direct' }, priority: 1 },
      { id: 'geo-route', name: 'Geo', matcher: { kind: 'geo-ip', countryCode: 'CN' }, target: { kind: 'direct' }, priority: 2 },
    ]
    const result = compileSingBox(ir, { now: fixedNow })
    expect(result.success).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['SINGBOX_INVALID_RULESET', 'SINGBOX_MATCHER_UNSUPPORTED']))
  })
})
