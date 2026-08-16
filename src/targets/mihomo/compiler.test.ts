import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { hktDemoSubscription, usDemoSubscription } from '../../data/demoSubscriptions'
import { explicitProxyIR } from '../../core/__fixtures__/crossTargetFixtures'
import {
  fallbackFixture,
  hkJpUsChainFixture,
  loadBalanceFixture,
  manualSelectFixture,
} from '../../core/__fixtures__/graphFixtures'
import { compileGraph } from '../../core/graphCompiler'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type ResolvedProxyEndpointIR, type TrafficMatcherIR } from '../../core/ir'
import { parseSubscription, type SubscriptionSnapshot } from '../../core/subscription'
import type { MihomoConfig } from './model'
import { compileMihomo, MihomoCompiler } from './compiler'

const fixedNow = () => new Date('2026-08-16T00:00:00.000Z')

function demoIR() {
  const parsedAt = '2026-08-16T00:00:00.000Z'
  const snapshots: Record<string, SubscriptionSnapshot> = {
    'hkt-subscription': { inputKind: 'paste', fetchStatus: 'ready', result: parseSubscription(hktDemoSubscription, { sourceId: 'hkt-subscription', sourceName: 'HKT 订阅源' }), lastSuccessfulAt: parsedAt },
    'us-subscription': { inputKind: 'paste', fetchStatus: 'ready', result: parseSubscription(usDemoSubscription, { sourceId: 'us-subscription', sourceName: 'US 订阅源' }), lastSuccessfulAt: parsedAt },
  }
  const graph = compileGraph(demoProject, { subscriptionSnapshots: snapshots })
  expect(graph.success).toBe(true)
  return graph.ir!
}

function parseConfig(ir: ProxyFlowIR) {
  const result = compileMihomo(ir, { now: fixedNow })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  expect(result.mock).toBe(false)
  return { result, config: parse(result.content) as MihomoConfig }
}

function baseIR(): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'mihomo-test', projectName: 'Mihomo Test', projectSchemaVersion: 2 },
    sources: [{ kind: 'subscription', id: 'source', name: 'Provider', url: 'https://example.com/provider.yaml', enabled: true }],
    transforms: [],
    strategies: [{ kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' } }],
    services: [{
      id: 'openai', name: 'OpenAI', defaultMatchers: ['DOMAIN'],
      ruleSources: [{ id: 'openai-rules', provider: 'remote', behavior: 'classical', format: 'yaml', url: 'https://example.com/openai.yaml' }],
    }],
    routes: [],
    finalRoute: { target: { kind: 'strategy', id: 'auto' } },
    outputs: [{ id: 'output', name: 'Mihomo', target: 'mihomo', enabled: true }],
  }
}

describe('MihomoCompiler', () => {
  it('compiles the Demo Graph end-to-end into semantic, parseable YAML', () => {
    const { result, config } = parseConfig(demoIR())
    expect(result.generatedAt).toBe('2026-08-16T00:00:00.000Z')
    expect(config.mode).toBe('rule')
    expect(config['proxy-providers']).toBeUndefined()
    expect(config.proxies?.map((proxy) => proxy.type)).toEqual(expect.arrayContaining(['ss', 'vmess', 'vless', 'trojan', 'socks5', 'http']))
    expect(config['proxy-groups']).toContainEqual(expect.objectContaining({
      name: '香港自动选择', type: 'url-test', proxies: expect.any(Array),
    }))
    expect(config['rule-providers']?.OpenAI).toEqual(expect.objectContaining({
      behavior: 'classical', format: 'yaml',
      url: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OpenAI/OpenAI.yaml',
    }))
    expect(config.rules[0]).toBe('RULE-SET,OpenAI,US via HK')
    expect(config.rules.at(-1)).toBe('MATCH,US via HK')
    expect(config.dns?.nameserver).toEqual(['https://1.1.1.1/dns-query'])
  })

  it('lowers a two-hop materialized chain through proxy dialer-proxy', () => {
    const { config, result } = parseConfig(demoIR())
    const chain = config['proxy-groups']?.find((group) => group.name === 'US via HK')
    expect(chain?.type).toBe('url-test')
    const derived = chain?.proxies?.[0]
    expect(derived).toBeTruthy()
    expect(config.proxies?.find((proxy) => proxy.name === derived)?.['dialer-proxy']).toBe('香港自动选择')
    expect(result.issues.map((issue) => issue.code)).toContain('MIHOMO_CHAIN_PROTOCOL_LIMITATION')
  })

  it('lowers a three-hop chain in declared hop order', () => {
    const ir = compileGraph(hkJpUsChainFixture).ir!
    const { config } = parseConfig(ir)
    const intermediate = config['proxy-groups']?.find((group) => group.name.includes('Hop 2'))
    const final = config['proxy-groups']?.find((group) => group.name === 'chain')
    expect(intermediate).toBeTruthy()
    expect(config['proxy-providers']?.[intermediate!.use![0]].override?.['dialer-proxy']).toBe('hk-auto')
    expect(config['proxy-providers']?.[final!.use![0]].override?.['dialer-proxy']).toBe(intermediate!.name)
  })

  it('maps select, fallback and load-balance strategies', () => {
    const select = parseConfig(compileGraph(manualSelectFixture).ir!).config['proxy-groups']?.[0]
    const fallback = parseConfig(compileGraph(fallbackFixture).ir!).config['proxy-groups']?.[0]
    const balance = parseConfig(compileGraph(loadBalanceFixture).ir!).config['proxy-groups']?.[0]
    expect(select).toEqual(expect.objectContaining({ type: 'select', use: ['source'] }))
    expect(fallback).toEqual(expect.objectContaining({ type: 'fallback', use: ['source-a', 'source-b'] }))
    expect(balance).toEqual(expect.objectContaining({ type: 'load-balance', strategy: 'consistent-hashing' }))
  })

  it('requires materialization when Merge consumes remote providers', () => {
    const ir = baseIR()
    ir.sources = [
      { kind: 'provider', id: 'provider-a', name: 'Provider A', reference: 'https://example.com/a.yaml', enabled: true },
      { kind: 'subscription', id: 'provider-b', name: 'Provider B', url: 'https://example.com/b.yaml', enabled: true },
    ]
    ir.transforms = [{ kind: 'merge', id: 'merge', name: 'Merge', inputs: [{ kind: 'source', id: 'provider-a' }, { kind: 'source', id: 'provider-b' }] }]
    ir.strategies = [{ kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'transform', id: 'merge' } }]
    const result = compileMihomo(ir, { now: fixedNow })
    expect(result.success).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('MIHOMO_SOURCE_UNAVAILABLE')
  })

  it('materializes shared HTTP/SOCKS endpoints and a Fixed strategy', () => {
    const ir = explicitProxyIR()
    ir.strategies.push({ kind: 'fixed', id: 'fixed-us', name: 'Fixed US', proxyId: 'us-http' })
    const config = parseConfig(ir).config
    expect(config.proxies).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'HK SOCKS', type: 'socks5', server: 'hk.example.com', port: 1080 }),
      expect.objectContaining({ name: 'US HTTP', type: 'http', server: 'us-http.example.com', port: 8080 }),
    ]))
    expect(config['proxy-groups']).toContainEqual({ name: 'Fixed US', type: 'select', proxies: ['US HTTP'] })
  })

  it.each<[TrafficMatcherIR, string]>([
    [{ kind: 'domain', value: 'api.openai.com' }, 'DOMAIN,api.openai.com,Auto'],
    [{ kind: 'domain-suffix', value: 'openai.com' }, 'DOMAIN-SUFFIX,openai.com,Auto'],
    [{ kind: 'domain-keyword', value: 'openai' }, 'DOMAIN-KEYWORD,openai,Auto'],
    [{ kind: 'ip-cidr', value: '1.1.1.0/24' }, 'IP-CIDR,1.1.1.0/24,Auto'],
    [{ kind: 'ip-cidr6', value: '2001:db8::/32' }, 'IP-CIDR6,2001:db8::/32,Auto'],
    [{ kind: 'port', port: 443 }, 'DST-PORT,443,Auto'],
    [{ kind: 'asn', value: 13335 }, 'IP-ASN,13335,Auto'],
    [{ kind: 'geo-ip', countryCode: 'CN' }, 'GEOIP,CN,Auto'],
    [{ kind: 'geo-site', category: 'youtube' }, 'GEOSITE,youtube,Auto'],
  ])('maps custom matcher $kind to an official Mihomo rule', (matcher, expected) => {
    const ir = baseIR()
    ir.routes = [{ id: 'custom', name: 'Custom', matcher, target: { kind: 'strategy', id: 'auto' }, priority: 10 }]
    expect(parseConfig(ir).config.rules).toEqual([expected, 'MATCH,Auto'])
  })

  it('keeps route priority and always emits Final as MATCH last', () => {
    const ir = baseIR()
    ir.routes = [
      { id: 'reject', name: 'Reject', matcher: { kind: 'domain', value: 'ads.example' }, target: { kind: 'reject' }, priority: 20 },
      { id: 'direct', name: 'Direct', matcher: { kind: 'domain-suffix', value: 'lan' }, target: { kind: 'direct' }, priority: 10 },
    ]
    expect(parseConfig(ir).config.rules).toEqual([
      'DOMAIN-SUFFIX,lan,DIRECT', 'DOMAIN,ads.example,REJECT', 'MATCH,Auto',
    ])
  })

  it('resolves group name collisions and updates route references', () => {
    const ir = baseIR()
    ir.sources.push({ kind: 'subscription', id: 'source-2', name: 'Provider 2', url: 'https://example.com/2.yaml', enabled: true })
    ir.strategies[0].name = 'Duplicate'
    ir.strategies.push({ kind: 'auto-select', id: 'auto-2', name: 'Duplicate', source: { kind: 'source', id: 'source-2' } })
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto-2' } }
    const config = parseConfig(ir).config
    expect(config['proxy-groups']?.map((group) => group.name)).toEqual(['Duplicate', 'Duplicate 2'])
    expect(config.rules.at(-1)).toBe('MATCH,Duplicate 2')
  })

  it('fails closed for invalid provider URLs and unsupported transforms', () => {
    const invalidUrl = baseIR()
    ;(invalidUrl.sources[0] as Extract<ProxyFlowIR['sources'][number], { kind: 'subscription' }>).url = 'file:///tmp/provider.yaml'
    const urlResult = compileMihomo(invalidUrl, { now: fixedNow })
    expect(urlResult).toEqual(expect.objectContaining({ success: false, content: '', mock: false }))
    expect(urlResult.issues.map((issue) => issue.code)).toContain('MIHOMO_INVALID_PROVIDER_URL')

    const unsupported = baseIR()
    unsupported.transforms.push({ kind: 'sort', id: 'sort', name: 'Sort', input: { kind: 'source', id: 'source' }, by: 'latency' })
    unsupported.strategies[0] = { kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'transform', id: 'sort' } }
    const transformResult = compileMihomo(unsupported, { now: fixedNow })
    expect(transformResult.success).toBe(false)
    expect(transformResult.issues.map((issue) => issue.code)).toContain('MIHOMO_SOURCE_UNAVAILABLE')
  })

  it('fails closed for an unresolved Fixed proxy independently of the selected output', () => {
    const fixed = baseIR()
    fixed.strategies = [{ kind: 'fixed', id: 'auto', name: 'Fixed', proxyId: 'placeholder' }]
    const fixedResult = compileMihomo(fixed, { now: fixedNow })
    expect(fixedResult.success).toBe(false)
    expect(fixedResult.issues.map((issue) => issue.code)).toContain('MIHOMO_FIXED_PROXY_UNRESOLVED')

    const wrongOutput = baseIR()
    wrongOutput.outputs[0] = { ...wrongOutput.outputs[0], target: 'sing-box' }
    const outputResult = compileMihomo(wrongOutput, { now: fixedNow })
    expect(outputResult.success).toBe(true)
  })

  it('materializes Rename before target compilation', () => {
    const ir = explicitProxyIR()
    ir.transforms.push({ kind: 'rename', id: 'rename', name: 'Rename', input: { kind: 'source', id: 'us-source' }, pattern: 'US', replacement: 'USA' })
    ir.strategies[0] = { kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'transform', id: 'rename' } }
    const result = compileMihomo(ir, { now: fixedNow })
    expect(result.success).toBe(true)
    const config = parse(result.content) as MihomoConfig
    expect(config.proxies?.map((proxy) => proxy.name)).toEqual(expect.arrayContaining(['USA HTTP', 'USA SOCKS']))
  })

  it('produces identical YAML across 100 compiles', () => {
    const ir = demoIR()
    const baseline = compileMihomo(ir, { now: fixedNow }).content
    for (let index = 0; index < 100; index += 1) expect(compileMihomo(ir, { now: fixedNow }).content).toBe(baseline)
  })

  it('implements the async ConfigCompiler contract with mock=false', async () => {
    const result = await new MihomoCompiler(fixedNow).compile(demoIR())
    expect(result).toEqual(expect.objectContaining({ success: true, mock: false }))
    expect(() => parse(result.content)).not.toThrow()
  })

  it.each([
    [{
      kind: 'trojan', protocol: 'trojan', id: 'trojan', name: 'Trojan', server: 'trojan.example.com', port: 443,
      password: 'demo', tls: { enabled: true, disableSni: true },
    }, 'MIHOMO_TLS_DISABLE_SNI_UNSUPPORTED'],
    [{
      kind: 'hysteria2', protocol: 'hysteria2', id: 'hy2', name: 'HY2', server: 'hy2.example.com', port: 443,
      password: 'demo', tls: { enabled: true, fingerprint: 'chrome' },
    }, 'MIHOMO_QUIC_TLS_FINGERPRINT_UNSUPPORTED'],
    [{
      kind: 'tuic', protocol: 'tuic', id: 'tuic', name: 'TUIC', server: 'tuic.example.com', port: 443,
      uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', password: 'demo', tls: { enabled: true, fingerprint: 'chrome' },
    }, 'MIHOMO_QUIC_TLS_FINGERPRINT_UNSUPPORTED'],
    [{
      kind: 'http', protocol: 'http', id: 'http', name: 'HTTP', server: 'http.example.com', port: 443,
      tls: { enabled: true, fingerprint: 'chrome' },
    }, 'MIHOMO_HTTP_TLS_CLIENT_FINGERPRINT_UNSUPPORTED'],
  ] satisfies Array<[ResolvedProxyEndpointIR, string]>)('fails closed instead of omitting unsupported target TLS intent', (proxy, code) => {
    const ir = explicitProxyIR()
    ir.sources = [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [proxy] }]
    ir.strategies = [{ kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' } }]
    ir.services = []
    ir.routes = []
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    const result = compileMihomo(ir, { now: fixedNow })
    expect(result).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(result.issues.map((issue) => issue.code)).toContain(code)
  })
})
