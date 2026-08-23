import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { createBlankProject } from '../../data/newProject'
import { hktDemoSubscription, usDemoSubscription } from '../../data/demoSubscriptions'
import { explicitProxyIR } from '../../core/__fixtures__/crossTargetFixtures'
import { subscriptionSnapshotFixture } from '../../core/__fixtures__/subscriptionFixtures'
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
import { createMihomoOutputProfile } from './profile'

const fixedNow = () => new Date('2026-08-16T00:00:00.000Z')

function demoIR() {
  const parsedAt = '2026-08-16T00:00:00.000Z'
  const snapshots: Record<string, SubscriptionSnapshot> = {
    'hkt-subscription': subscriptionSnapshotFixture('hkt-subscription', parseSubscription(hktDemoSubscription, { sourceId: 'hkt-subscription', sourceName: 'HKT 订阅源' }), parsedAt),
    'us-subscription': subscriptionSnapshotFixture('us-subscription', parseSubscription(usDemoSubscription, { sourceId: 'us-subscription', sourceName: 'US 订阅源' }), parsedAt),
  }
  const graph = compileGraph(demoProject, { subscriptionSnapshots: snapshots })
  expect(graph.success).toBe(true)
  return graph.ir!
}

function parseConfig(ir: ProxyFlowIR, profile?: unknown) {
  const result = compileMihomo(ir, { now: fixedNow, profile })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  expect(result.mock).toBe(false)
  const config = parse(result.content) as MihomoConfig
  expect(result.stats?.proxyCount).toBe(config.proxies?.length ?? 0)
  expect(result.stats?.endpointCount).toBeLessThanOrEqual(result.stats?.proxyCount ?? 0)
  return { result, config }
}

function baseIR(): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'mihomo-test', projectName: 'Mihomo Test', projectSchemaVersion: 2 },
    sources: [{
      kind: 'subscription', id: 'source', name: 'Provider', url: 'https://example.com/provider.yaml', enabled: true,
      proxies: [{ kind: 'socks', protocol: 'socks5', version: '5', id: 'source-proxy', name: 'Source Proxy', server: 'proxy.example.com', port: 1080 }],
      remote: {
        kind: 'remote-subscription', id: 'source', name: 'Provider', url: 'https://example.com/provider.yaml', requestProfile: 'auto', exportMode: 'auto',
        snapshot: { id: 'source-snapshot', contentHash: 'fictional-hash', fetchedAt: '2026-08-22T00:00:00.000Z' },
      },
    }],
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
  it('uses the safe Local Proxy profile when an older project has no target profile', () => {
    const config = parseConfig(baseIR()).config
    expect(config).toEqual(expect.objectContaining({
      'mixed-port': 7890,
      'allow-lan': false,
      ipv6: true,
      mode: 'rule',
      'unified-delay': true,
      'tcp-concurrent': true,
      profile: { 'store-selected': true, 'store-fake-ip': false },
    }))
    expect(config.tun).toBeUndefined()
    expect(config.sniffer).toBeUndefined()
    expect(config.dns).toBeUndefined()
  })

  it('compiles a new Mihomo project with the validated starter defaults', () => {
    const project = createBlankProject('mihomo')
    const graph = compileGraph(project)
    expect(graph.success).toBe(true)
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    const config = parseConfig(graph.ir!, output.data.mihomoProfile).config

    expect(config).toEqual(expect.objectContaining({
      'mixed-port': 7890,
      'allow-lan': true,
      ipv6: false,
      'unified-delay': true,
      'tcp-concurrent': true,
      profile: { 'store-selected': true, 'store-fake-ip': true },
    }))
    expect(config.tun).toEqual(expect.objectContaining({
      enable: true,
      stack: 'mixed',
      'auto-route': true,
      'auto-detect-interface': true,
      'dns-hijack': ['any:53', 'tcp://any:53'],
    }))
    expect(config.sniffer?.enable).toBe(true)
    expect(config.dns).toEqual(expect.objectContaining({
      enable: true,
      ipv6: false,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.0/16',
      'default-nameserver': ['223.5.5.5'],
      nameserver: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'],
    }))
    for (const excludedField of ['external-controller', 'secret', 'external-ui', 'bind-address', 'auto-redirect']) {
      expect(config).not.toHaveProperty(excludedField)
    }
  })

  it('coordinates Desktop TUN, Fake-IP DNS, sniffer and persistence settings', () => {
    const ir = baseIR()
    ir.dns = {
      enabled: true,
      mode: 'custom',
      resolvers: [{ id: 'fictional-doh', kind: 'doh', address: 'https://dns.example.com/dns-query' }],
    }
    const profile = { ...createMihomoOutputProfile('desktop-tun'), mixedPort: 7893, strictRoute: true }
    const config = parseConfig(ir, profile).config
    expect(config).toEqual(expect.objectContaining({
      'mixed-port': 7893,
      'allow-lan': false,
      ipv6: true,
      profile: { 'store-selected': true, 'store-fake-ip': true },
      tun: {
        enable: true,
        stack: 'mixed',
        'auto-route': true,
        'auto-detect-interface': true,
        'dns-hijack': ['any:53', 'tcp://any:53'],
        'strict-route': true,
      },
    }))
    expect(config.dns).toEqual(expect.objectContaining({
      enable: true,
      ipv6: true,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.0/16',
      nameserver: ['https://dns.example.com/dns-query'],
    }))
    expect(config.sniffer).toEqual(expect.objectContaining({
      enable: true,
      'force-dns-mapping': true,
      'parse-pure-ip': true,
      sniff: {
        HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
        TLS: { ports: [443, 8443] },
        QUIC: { ports: [443, 8443] },
      },
    }))
  })

  it('maps DNS resolver roles without flattening direct and fallback intent', () => {
    const ir = baseIR()
    ir.dns = {
      enabled: true,
      mode: 'custom',
      resolvers: [
        { id: 'default', kind: 'doh', role: 'default', address: 'https://dns.example.com/dns-query' },
        { id: 'direct', kind: 'udp', role: 'direct', address: '192.0.2.53:53' },
        { id: 'fallback', kind: 'dot', role: 'fallback', address: 'tls://dns.example.net:853' },
      ],
    }
    const config = parseConfig(ir, createMihomoOutputProfile()).config
    expect(config.dns).toEqual(expect.objectContaining({
      nameserver: ['https://dns.example.com/dns-query'],
      'direct-nameserver': ['192.0.2.53:53'],
      fallback: ['tls://dns.example.net:853'],
    }))
  })

  it('applies advanced Local Proxy settings without changing sing-box semantics', () => {
    const ir = baseIR()
    ir.dns = { enabled: true, mode: 'automatic' }
    const profile = {
      ...createMihomoOutputProfile(),
      mixedPort: 10808,
      allowLan: true,
      ipv6: false,
      dnsMode: 'disabled' as const,
      sniffer: true,
      storeSelected: false,
      unifiedDelay: false,
      tcpConcurrent: false,
    }
    const config = parseConfig(ir, profile).config
    expect(config).toEqual(expect.objectContaining({
      'mixed-port': 10808,
      'allow-lan': true,
      ipv6: false,
      'unified-delay': false,
      'tcp-concurrent': false,
      profile: { 'store-selected': false, 'store-fake-ip': false },
    }))
    expect(config.dns).toBeUndefined()
    expect(config.tun).toBeUndefined()
    expect(config.sniffer?.enable).toBe(true)
  })

  it.each([0, 65536, 7890.5, Number.NaN])('fails closed for invalid mixed port %s', (mixedPort) => {
    const result = compileMihomo(baseIR(), {
      now: fixedNow,
      outputNodeId: 'output',
      profile: { ...createMihomoOutputProfile(), mixedPort },
    })
    expect(result).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MIHOMO_MIXED_PORT_INVALID', entityId: 'output' }))
  })

  it('fails closed for malformed imported profile fields', () => {
    const result = compileMihomo(baseIR(), {
      now: fixedNow,
      outputNodeId: 'output',
      profile: { ...createMihomoOutputProfile(), preset: 'router', dnsMode: 'magic', sniffer: 'yes', rawYaml: 'tun: { enable: true }' },
    })
    expect(result).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MIHOMO_PROFILE_INVALID', entityId: 'output' }))
  })

  it('fails closed when Desktop TUN has no DNS or an incompatible DNS mode', () => {
    const missingDns = compileMihomo(baseIR(), { now: fixedNow, profile: createMihomoOutputProfile('desktop-tun') })
    expect(missingDns).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(missingDns.issues.map((issue) => issue.code)).toContain('MIHOMO_TUN_DNS_REQUIRED')

    const incompatible = baseIR()
    incompatible.dns = { enabled: true, mode: 'automatic' }
    const invalidProfile = { ...createMihomoOutputProfile('desktop-tun'), dnsMode: 'redir-host' as const }
    const incompatibleResult = compileMihomo(incompatible, { now: fixedNow, profile: invalidProfile })
    expect(incompatibleResult).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(incompatibleResult.issues.map((issue) => issue.code)).toContain('MIHOMO_TUN_FAKE_IP_REQUIRED')
  })

  it('fails closed when an explicit Local Proxy DNS enhancement has no DNS node', () => {
    const profile = { ...createMihomoOutputProfile(), dnsMode: 'fake-ip' as const }
    const result = compileMihomo(baseIR(), { now: fixedNow, outputNodeId: 'output', profile })
    expect(result).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MIHOMO_DNS_PROFILE_REQUIRES_DNS', entityId: 'output' }))

    const disabled = compileMihomo(baseIR(), {
      now: fixedNow, outputNodeId: 'output', profile: { ...profile, dnsMode: 'disabled' },
    })
    expect(disabled.success).toBe(true)
  })

  it('produces deterministic Desktop TUN YAML and forwards compiler target options', async () => {
    const ir = baseIR()
    ir.dns = { enabled: true, mode: 'automatic' }
    const profile = createMihomoOutputProfile('desktop-tun')
    const baseline = compileMihomo(ir, { now: fixedNow, profile }).content
    for (let index = 0; index < 25; index += 1) expect(compileMihomo(ir, { now: fixedNow, profile }).content).toBe(baseline)
    const result = await new MihomoCompiler(fixedNow).compile(ir, { outputNodeId: 'output', targetProfile: profile })
    expect(result.success).toBe(true)
    expect(parse(result.content)).toEqual(parse(baseline))
  })

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
      url: 'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/mihomo/OpenAI.yaml',
    }))
    expect(config['rule-providers']?.Telegram).toEqual(expect.objectContaining({
      behavior: 'classical', format: 'yaml',
      url: 'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/mihomo/Telegram.yaml',
    }))
    expect(config.rules[0]).toBe('RULE-SET,OpenAI,US via HK')
    expect(config.rules).toContain('RULE-SET,Telegram,香港自动选择')
    expect(config.rules.at(-1)).toBe('MATCH,US via HK')
    expect(result.content).not.toContain('/rules/surge/')
    expect(config.dns?.nameserver).toEqual(['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'])
  })

  it('lowers a two-hop materialized chain through proxy dialer-proxy', () => {
    const { config, result } = parseConfig(demoIR())
    const chain = config['proxy-groups']?.find((group) => group.name === 'US via HK')
    expect(chain?.type).toBe('url-test')
    const derived = chain?.proxies?.[0]
    expect(derived).toBeTruthy()
    expect(config.proxies?.find((proxy) => proxy.name === derived)?.['dialer-proxy']).toBe('香港自动选择')
    expect(result.stats?.endpointCount).toBeLessThan(result.stats?.proxyCount ?? 0)
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
    expect(fallback).toEqual(expect.objectContaining({
      type: 'fallback', use: ['source-a', 'source-b'],
    }))
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
    const unavailable = result.issues.filter((issue) => issue.code === 'MIHOMO_SOURCE_UNAVAILABLE')
    expect(unavailable.map((issue) => issue.entityId)).toEqual(expect.arrayContaining(['provider-a', 'provider-b']))
    expect(new Set(unavailable.map((issue) => `${issue.code}:${issue.entityId}:${issue.message}`)).size).toBe(unavailable.length)
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

  it('preserves the ordered two-rule semantics for hidden legacy China projects', () => {
    const ir = baseIR()
    ir.services = [{
      id: 'china', name: 'China Mainland', defaultMatchers: ['GEOSITE', 'GEOIP'],
      ruleSources: [{ id: 'builtin-china', provider: 'builtin', format: 'universal' }],
    }]
    ir.routes = [{
      id: 'legacy-china', name: 'Legacy China', matcher: { kind: 'service', serviceIds: ['china'] },
      target: { kind: 'direct' }, priority: 10,
    }]
    expect(parseConfig(ir).config.rules).toEqual(['GEOSITE,cn,DIRECT', 'GEOIP,CN,DIRECT', 'MATCH,Auto'])
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
    ir.sources.push({ kind: 'provider', id: 'source-2', name: 'Provider 2', reference: 'https://example.com/2.yaml', enabled: true })
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
    expect(transformResult.issues.map((issue) => issue.code)).toContain('MIHOMO_SPEED_TEST_REQUIRED')
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
