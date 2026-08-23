import { describe, expect, it } from 'vitest'
import minimalProfile from '../../../fixtures/surge/minimal.conf?raw'
import {
  PROXYFLOW_IR_VERSION,
  type ProxyFlowIR,
  type ResolvedProxyEndpointIR,
  type TrafficMatcherIR,
} from '../../core/ir'
import { legacyChinaServiceDefinition } from '../../data/legacyServices'
import { serviceCatalog } from '../../data/serviceCatalog'
import { compileSurge, SurgeCompiler } from './compiler'
import { serializeSurgeRule } from './serializer'

const fixedNow = () => new Date('2026-08-23T00:00:00.000Z')
const surgeRuleBaseUrl = 'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/surge'
const serviceRuleCases = [
  { id: 'openai', name: 'OpenAI', filename: 'OpenAI.list' },
  { id: 'claude', name: 'Claude', filename: 'Claude.list' },
  { id: 'google', name: 'Google', filename: 'Google.list' },
  { id: 'gemini', name: 'Gemini', filename: 'Gemini.list' },
  { id: 'youtube', name: 'YouTube', filename: 'YouTube.list' },
  { id: 'netflix', name: 'Netflix', filename: 'Netflix.list' },
  { id: 'disney', name: 'Disney+', filename: 'Disney.list' },
  { id: 'telegram', name: 'Telegram', filename: 'Telegram.list' },
  { id: 'github', name: 'GitHub', filename: 'GitHub.list' },
  { id: 'steam', name: 'Steam', filename: 'Steam.list' },
] as const

function httpProxy(
  overrides: Partial<Extract<ResolvedProxyEndpointIR, { kind: 'http' }>> = {},
): Extract<ResolvedProxyEndpointIR, { kind: 'http' }> {
  return {
    kind: 'http', protocol: 'http', id: 'proxy-a', name: 'Proxy A',
    server: 'proxy.example.com', port: 8080,
    ...overrides,
  }
}

function baseIR(proxy: ResolvedProxyEndpointIR = httpProxy()): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'surge-test', projectName: 'Surge Test', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'source', name: 'Manual Source', proxies: [proxy] }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'manual', name: 'Proxy', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [{
      id: 'example', name: 'Example', matcher: { kind: 'domain-suffix', value: 'example.com' },
      target: { kind: 'strategy', id: 'manual' }, priority: 10,
    }],
    finalRoute: { target: { kind: 'strategy', id: 'manual' } },
    outputs: [{ id: 'surge-output', name: 'Surge', target: 'surge', enabled: true }],
  }
}

function compileSuccessfully(ir: ProxyFlowIR) {
  const result = compileSurge(ir, { now: fixedNow })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  expect(result.mock).toBe(false)
  expect(result.generatedAt).toBe('2026-08-23T00:00:00.000Z')
  expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false)
  return result
}

function compileFailure(ir: ProxyFlowIR, code?: string) {
  const result = compileSurge(ir, { now: fixedNow })
  expect(result).toEqual(expect.objectContaining({ success: false, content: '', mock: false }))
  expect(result.issues).toContainEqual(expect.objectContaining({ target: 'surge', severity: 'error' }))
  if (code) expect(result.issues.map((issue) => issue.code)).toContain(code)
  return result
}

function sectionLines(profile: string, section: 'General' | 'Proxy' | 'Proxy Group' | 'Rule') {
  const lines = profile.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  const start = lines.indexOf(`[${section}]`)
  expect(start, `Missing [${section}] section`).toBeGreaterThanOrEqual(0)
  const endOffset = lines.slice(start + 1).findIndex((line) => /^\[[^\]]+\]$/.test(line))
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset
  return lines.slice(start + 1, end).filter((line) => line.length > 0)
}

function replaceStrategies(ir: ProxyFlowIR, strategies: ProxyFlowIR['strategies']) {
  ir.strategies = strategies
  ir.routes = []
  ir.finalRoute = { target: { kind: 'strategy', id: strategies[0].id } }
  return ir
}

describe('SurgeCompiler', () => {
  it('compiles the representative minimal profile fixture and implements ConfigCompiler', async () => {
    const ir = baseIR()
    const result = compileSuccessfully(ir)
    expect(result.content).toBe(minimalProfile)
    expect(result.stats).toEqual({ proxyCount: 1, endpointCount: 1 })
    expect(sectionLines(result.content, 'General')).toEqual([])
    expect(result.content.match(/^\[(?:General|Proxy|Proxy Group|Rule)\]$/gm)).toHaveLength(4)
    for (const excluded of ['MITM', 'Script', 'Rewrite', 'Host', 'Ponte', 'WireGuard', 'Tailscale', 'DHCP', 'Snell Server']) {
      expect(result.content).not.toContain(`[${excluded}]`)
    }

    const asyncResult = await new SurgeCompiler(fixedNow).compile(ir)
    expect(asyncResult).toEqual(result)
  })

  it('maps Manual, Auto and Fallback without changing member order', () => {
    const ir = baseIR()
    const source = ir.sources[0]
    if (source.kind !== 'manual-proxy') throw new Error('Expected the manual-source fixture.')
    source.proxies.push(httpProxy({
      id: 'proxy-b', name: 'Proxy B', server: 'proxy-b.example.com', port: 8081,
    }))
    ir.strategies = [
      { kind: 'select', id: 'manual', name: 'Manual', candidates: [{ kind: 'source', id: 'source' }] },
      {
        kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
        healthCheck: { intervalSeconds: 120, toleranceMs: 50 },
      },
      {
        kind: 'fallback', id: 'fallback', name: 'Fallback', candidates: [{ kind: 'source', id: 'source' }],
        healthCheck: { intervalSeconds: 300 },
      },
    ]
    ir.routes = []
    ir.finalRoute = { target: { kind: 'strategy', id: 'manual' } }

    expect(sectionLines(compileSuccessfully(ir).content, 'Proxy Group')).toEqual([
      'Manual = select, Proxy A, Proxy B',
      'Auto = url-test, Proxy A, Proxy B, interval=120, tolerance=50',
      'Fallback = fallback, Proxy A, Proxy B, interval=300',
    ])
  })

  it.each(['round-robin', 'consistent-hash'] as const)('fails closed for current %s Load Balance intent', (mode) => {
    const ir = replaceStrategies(baseIR(), [{
      kind: 'load-balance', id: 'balance', name: 'Balance', source: { kind: 'source', id: 'source' }, mode,
    }])
    compileFailure(ir, 'SURGE_LOAD_BALANCE_MODE_UNSUPPORTED')
  })

  it('preserves routing priority, graph-order ties, all supported matcher kinds and FINAL-last semantics', () => {
    const ir = baseIR()
    ir.routes = [
      route('geo', { kind: 'geo-ip', countryCode: 'US' }, { kind: 'reject' }, 60),
      route('ipv6', { kind: 'ip-cidr6', value: '2001:db8::/32' }, { kind: 'direct' }, 50),
      route('cidr', { kind: 'ip-cidr', value: '192.0.2.0/24' }, { kind: 'strategy', id: 'manual' }, 40),
      route('keyword', { kind: 'domain-keyword', value: 'needle' }, { kind: 'reject' }, 30),
      route('suffix', { kind: 'domain-suffix', value: 'suffix.example' }, { kind: 'direct' }, 20),
      route('domain', { kind: 'domain', value: 'exact.example' }, { kind: 'strategy', id: 'manual' }, 10),
      route('tie', { kind: 'domain', value: 'tie.example' }, { kind: 'direct' }, 10),
    ]

    expect(sectionLines(compileSuccessfully(ir).content, 'Rule')).toEqual([
      'DOMAIN,exact.example,Proxy',
      'DOMAIN,tie.example,DIRECT',
      'DOMAIN-SUFFIX,suffix.example,DIRECT',
      'DOMAIN-KEYWORD,needle,REJECT',
      'IP-CIDR,192.0.2.0/24,Proxy',
      'IP-CIDR6,2001:db8::/32,DIRECT',
      'GEOIP,US,REJECT',
      'FINAL,Proxy',
    ])
  })

  it('maps DIRECT and REJECT in ordinary and final routes', () => {
    const ir = baseIR()
    ir.routes = [
      route('direct', { kind: 'domain', value: 'direct.example' }, { kind: 'direct' }, 10),
      route('reject', { kind: 'domain', value: 'reject.example' }, { kind: 'reject' }, 20),
    ]
    ir.finalRoute = { target: { kind: 'reject' } }
    expect(sectionLines(compileSuccessfully(ir).content, 'Rule')).toEqual([
      'DOMAIN,direct.example,DIRECT',
      'DOMAIN,reject.example,REJECT',
      'FINAL,REJECT',
    ])
  })

  it('emits byte-identical content across 100 compiles', () => {
    const ir = baseIR()
    const baseline = compileSuccessfully(ir).content
    for (let index = 0; index < 100; index += 1) {
      expect(compileSurge(ir, { now: fixedNow }).content).toBe(baseline)
    }
  })

  it.each([
    {
      protocol: 'HTTP over TLS',
      endpoint: httpProxy({
        id: 'https', name: 'HTTPS', server: 'https.example.com', port: 443,
        username: 'alice', password: 'secret',
        tls: { enabled: true, serverName: 'edge.example.com', allowInsecure: true, alpn: ['h2', 'http/1.1'] },
      }),
      line: 'HTTPS = https, https.example.com, 443, username=alice, password=secret, sni=edge.example.com, skip-cert-verify=true, alpn="h2,http/1.1"',
    },
    {
      protocol: 'SOCKS5',
      endpoint: {
        kind: 'socks', protocol: 'socks5', version: '5', id: 'socks', name: 'SOCKS5',
        server: 'socks.example.com', port: 1080, username: 'bob', password: 'secret',
      },
      line: 'SOCKS5 = socks5, socks.example.com, 1080, username=bob, password=secret, udp-relay=true',
    },
    {
      protocol: 'Shadowsocks',
      endpoint: {
        kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss', name: 'Shadowsocks',
        server: 'ss.example.com', port: 8388, method: 'aes-128-gcm', password: 'secret',
      },
      line: 'Shadowsocks = ss, ss.example.com, 8388, encrypt-method=aes-128-gcm, password=secret, udp-relay=true',
    },
    {
      protocol: 'Trojan WebSocket',
      endpoint: {
        kind: 'trojan', protocol: 'trojan', id: 'trojan', name: 'Trojan',
        server: 'trojan.example.com', port: 443, password: 'secret',
        tls: { enabled: true, serverName: 'edge.example.com' },
        transport: { kind: 'ws', path: '/tunnel', host: 'ws.example.com' },
      },
      line: 'Trojan = trojan, trojan.example.com, 443, password=secret, ws=true, ws-path=/tunnel, ws-headers=Host:ws.example.com, sni=edge.example.com',
    },
    {
      protocol: 'Hysteria 2',
      endpoint: {
        kind: 'hysteria2', protocol: 'hysteria2', id: 'hy2', name: 'Hysteria 2',
        server: 'hy2.example.com', port: 443, password: 'secret',
        tls: { enabled: true, serverName: 'edge.example.com' }, downMbps: 100,
        serverPorts: [{ kind: 'single', port: 443 }, { kind: 'range', start: 5000, end: 6000 }],
        hopInterval: { kind: 'fixed', seconds: 30 },
      },
      line: 'Hysteria 2 = hysteria2, hy2.example.com, 443, password=secret, download-bandwidth=100, port-hopping=443;5000-6000, port-hopping-interval=30, sni=edge.example.com',
    },
    {
      protocol: 'TUIC v5',
      endpoint: {
        kind: 'tuic', protocol: 'tuic', id: 'tuic', name: 'TUIC',
        server: 'tuic.example.com', port: 443, uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', password: 'secret',
        tls: { enabled: true, serverName: 'edge.example.com', alpn: ['h3'] },
      },
      line: 'TUIC = tuic-v5, tuic.example.com, 443, uuid=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, password=secret, sni=edge.example.com, alpn=h3',
    },
    {
      protocol: 'AnyTLS v2',
      endpoint: {
        kind: 'anytls', protocol: 'anytls', id: 'anytls', name: 'AnyTLS',
        server: 'anytls.example.com', port: 443, password: 'secret', udpEnabled: true,
        tls: { enabled: true, serverName: 'edge.example.com' },
      },
      line: 'AnyTLS = anytls, anytls.example.com, 443, password=secret, sni=edge.example.com',
    },
  ] satisfies Array<{ protocol: string; endpoint: ResolvedProxyEndpointIR; line: string }>)('$protocol lowers to precise Surge syntax', ({ endpoint, line }) => {
    const ir = baseIR(endpoint)
    expect(sectionLines(compileSuccessfully(ir).content, 'Proxy')).toEqual([line])
  })

  it('validates exact Shadowsocks 2022 key sizes before emitting a profile', () => {
    const valid = baseIR({
      kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss-2022', name: 'SS 2022',
      server: 'ss.example.com', port: 8388, method: '2022-blake3-aes-128-gcm',
      password: 'MDEyMzQ1Njc4OWFiY2RlZg==',
    })
    expect(sectionLines(compileSuccessfully(valid).content, 'Proxy')).toEqual([
      'SS 2022 = ss, ss.example.com, 8388, encrypt-method=2022-blake3-aes-128-gcm, password="MDEyMzQ1Njc4OWFiY2RlZg==", udp-relay=true',
    ])

    const invalid = baseIR({
      kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss-2022', name: 'SS 2022',
      server: 'ss.example.com', port: 8388, method: '2022-blake3-aes-256-gcm', password: 'too-short',
    })
    compileFailure(invalid, 'SURGE_SHADOWSOCKS_2022_KEY_INVALID')
  })

  it.each([
    {
      protocol: 'VMess',
      endpoint: {
        kind: 'vmess', protocol: 'vmess', id: 'vmess', name: 'VMess', server: 'vmess.example.com', port: 443,
        uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', security: 'aes-128-gcm', alterId: 0,
        tls: { enabled: true, serverName: 'vmess.example.com' }, transport: { kind: 'tcp' },
      },
    },
    {
      protocol: 'VLESS',
      endpoint: {
        kind: 'vless', protocol: 'vless', id: 'vless', name: 'VLESS', server: 'vless.example.com', port: 443,
        uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', security: 'tls', encryption: 'none',
        tls: { enabled: true, serverName: 'vless.example.com' }, transport: { kind: 'tcp' },
      },
    },
  ] satisfies Array<{ protocol: string; endpoint: ResolvedProxyEndpointIR }>)('fails closed for unsupported $protocol instead of approximating it', ({ endpoint }) => {
    compileFailure(baseIR(endpoint), 'SURGE_PROXY_PROTOCOL_UNSUPPORTED')
  })

  it.each(serviceRuleCases)('maps the $name service id to its exact first-party Surge asset', ({ id, filename }) => {
    const ir = baseIR()
    ir.services = structuredClone(serviceCatalog)
    ir.routes = [route(`${id}-route`, { kind: 'service', serviceIds: [id] }, { kind: 'strategy', id: 'manual' }, 10)]

    expect(JSON.stringify(ir.services)).not.toContain('/rules/surge/')
    const result = compileSuccessfully(ir)
    expect(sectionLines(result.content, 'Rule')).toEqual([
      `RULE-SET,${surgeRuleBaseUrl}/${filename},Proxy`,
      'FINAL,Proxy',
    ])
    expect(result.content).not.toContain('/rules/mihomo/')
  })

  it('supports Strategy, DIRECT and REJECT policies while preserving the representative mixed order', () => {
    const ir = baseIR()
    ir.services = structuredClone(serviceCatalog)
    ir.routes = [
      route('openai', { kind: 'service', serviceIds: ['openai'] }, { kind: 'strategy', id: 'manual' }, 10),
      route('example', { kind: 'domain-suffix', value: 'example.com' }, { kind: 'strategy', id: 'manual' }, 20),
      route('telegram', { kind: 'service', serviceIds: ['telegram'] }, { kind: 'direct' }, 30),
      route('steam', { kind: 'service', serviceIds: ['steam'] }, { kind: 'reject' }, 40),
    ]
    expect(sectionLines(compileSuccessfully(ir).content, 'Rule')).toEqual([
      `RULE-SET,${surgeRuleBaseUrl}/OpenAI.list,Proxy`,
      'DOMAIN-SUFFIX,example.com,Proxy',
      `RULE-SET,${surgeRuleBaseUrl}/Telegram.list,DIRECT`,
      `RULE-SET,${surgeRuleBaseUrl}/Steam.list,REJECT`,
      'FINAL,Proxy',
    ])
  })

  it('keeps Service, Service and FINAL in priority order', () => {
    const ir = baseIR()
    ir.services = structuredClone(serviceCatalog)
    ir.routes = [
      route('telegram', { kind: 'service', serviceIds: ['telegram'] }, { kind: 'direct' }, 20),
      route('openai', { kind: 'service', serviceIds: ['openai'] }, { kind: 'strategy', id: 'manual' }, 10),
    ]
    expect(sectionLines(compileSuccessfully(ir).content, 'Rule')).toEqual([
      `RULE-SET,${surgeRuleBaseUrl}/OpenAI.list,Proxy`,
      `RULE-SET,${surgeRuleBaseUrl}/Telegram.list,DIRECT`,
      'FINAL,Proxy',
    ])
  })

  it('preserves mixed DOMAIN, Service, IP-CIDR, Service and FINAL ordering', () => {
    const ir = baseIR()
    ir.services = structuredClone(serviceCatalog)
    ir.routes = [
      route('domain', { kind: 'domain-suffix', value: 'example.com' }, { kind: 'strategy', id: 'manual' }, 10),
      route('openai', { kind: 'service', serviceIds: ['openai'] }, { kind: 'strategy', id: 'manual' }, 20),
      route('cidr', { kind: 'ip-cidr', value: '192.0.2.0/24' }, { kind: 'direct' }, 30),
      route('telegram', { kind: 'service', serviceIds: ['telegram'] }, { kind: 'direct' }, 40),
    ]
    expect(sectionLines(compileSuccessfully(ir).content, 'Rule')).toEqual([
      'DOMAIN-SUFFIX,example.com,Proxy',
      `RULE-SET,${surgeRuleBaseUrl}/OpenAI.list,Proxy`,
      'IP-CIDR,192.0.2.0/24,DIRECT',
      `RULE-SET,${surgeRuleBaseUrl}/Telegram.list,DIRECT`,
      'FINAL,Proxy',
    ])
  })

  it('uses original route index as the stable tie-break for mixed service and ordinary rules', () => {
    const ir = baseIR()
    ir.services = structuredClone(serviceCatalog)
    ir.routes = [
      route('telegram', { kind: 'service', serviceIds: ['telegram'] }, { kind: 'direct' }, 10),
      route('domain', { kind: 'domain', value: 'example.com' }, { kind: 'strategy', id: 'manual' }, 10),
      route('openai', { kind: 'service', serviceIds: ['openai'] }, { kind: 'reject' }, 10),
    ]
    expect(sectionLines(compileSuccessfully(ir).content, 'Rule')).toEqual([
      `RULE-SET,${surgeRuleBaseUrl}/Telegram.list,DIRECT`,
      'DOMAIN,example.com,Proxy',
      `RULE-SET,${surgeRuleBaseUrl}/OpenAI.list,REJECT`,
      'FINAL,Proxy',
    ])
  })

  it('fails closed for unknown, missing-source, legacy China and invalid-target service rules', () => {
    const unknown = baseIR()
    unknown.services = structuredClone(serviceCatalog)
    unknown.routes = [route('unknown', { kind: 'service', serviceIds: ['unknown'] }, { kind: 'direct' }, 10)]
    compileFailure(unknown, 'SURGE_SERVICE_RULE_NOT_FOUND')

    const missingSource = baseIR()
    missingSource.services = [{
      id: 'fictional', name: 'Fictional',
      ruleSources: [{
        id: 'fictional-mihomo', provider: 'remote', format: 'yaml', behavior: 'classical',
        url: 'https://example.com/fictional.yaml',
      }],
    }]
    missingSource.routes = [route('missing-source', { kind: 'service', serviceIds: ['fictional'] }, { kind: 'direct' }, 10)]
    compileFailure(missingSource, 'SURGE_SERVICE_RULE_SOURCE_MISSING')

    const legacyChina = baseIR()
    legacyChina.services = [structuredClone(legacyChinaServiceDefinition)]
    legacyChina.routes = [route('legacy-china', { kind: 'service', serviceIds: ['china'] }, { kind: 'direct' }, 10)]
    const legacyResult = compileFailure(legacyChina, 'SURGE_LEGACY_SERVICE_RULE_UNSUPPORTED')
    expect(legacyResult.content).not.toContain('China.list')

    const invalidTarget = baseIR()
    invalidTarget.services = structuredClone(serviceCatalog)
    invalidTarget.routes = [route('invalid-target', { kind: 'service', serviceIds: ['openai'] }, { kind: 'strategy', id: 'missing' }, 10)]
    compileFailure(invalidTarget, 'IR_ROUTE_TARGET_NOT_FOUND')
  })

  it('quotes comma-containing rule payloads and rejects line-break injection', () => {
    expect(serializeSurgeRule('RULE-SET', 'https://example.com/rules,a.list', 'Proxy')).toBe(
      'RULE-SET,"https://example.com/rules,a.list",Proxy',
    )
    expect(() => serializeSurgeRule('RULE-SET', 'https://example.com/rules.list\nFINAL,DIRECT', 'Proxy'))
      .toThrow('Surge rule tokens must be single-line values.')
  })

  it('fails closed whenever the IR contains a Proxy Chain', () => {
    const ir = baseIR()
    ir.strategies = [
      { kind: 'select', id: 'entry', name: 'Entry', candidates: [{ kind: 'source', id: 'source' }] },
      { kind: 'select', id: 'exit', name: 'Exit', candidates: [{ kind: 'source', id: 'source' }] },
      { kind: 'chain', id: 'chain', name: 'Chain', hops: [{ kind: 'strategy', id: 'entry' }, { kind: 'strategy', id: 'exit' }] },
    ]
    ir.routes = []
    ir.finalRoute = { target: { kind: 'strategy', id: 'chain' } }
    compileFailure(ir, 'SURGE_PROXY_CHAIN_UNSUPPORTED')
  })

  it('fails closed for active DNS but permits explicitly inactive DNS state', () => {
    const active = baseIR()
    active.dns = { enabled: true, mode: 'automatic' }
    compileFailure(active, 'SURGE_DNS_UNSUPPORTED')

    const inactive = baseIR()
    inactive.dns = { enabled: false, mode: 'custom', resolvers: [{ id: 'doh', kind: 'doh', address: 'https://dns.example.com/dns-query' }] }
    expect(compileSuccessfully(inactive).success).toBe(true)
  })

  it('fails closed for strategy-scoped test URLs because current Surge ignores group url=', () => {
    const ir = replaceStrategies(baseIR(), [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://www.gstatic.com/generate_204', intervalSeconds: 120 },
    }])
    const result = compileFailure(ir, 'SURGE_STRATEGY_TEST_URL_UNSUPPORTED')
    expect(result.content).not.toContain('url=')
  })

  it.each([
    {
      feature: 'TLS client fingerprint',
      endpoint: httpProxy({ tls: { enabled: true, fingerprint: 'chrome' } }),
    },
    {
      feature: 'unsupported gRPC transport',
      endpoint: {
        kind: 'trojan', protocol: 'trojan', id: 'trojan-grpc', name: 'Trojan gRPC',
        server: 'trojan.example.com', port: 443, password: 'secret', tls: { enabled: true },
        transport: { kind: 'grpc', serviceName: 'proxyflow' },
      },
    },
    {
      feature: 'partial parser metadata',
      endpoint: httpProxy({
        metadata: { compatibility: { status: 'partial', unsupportedFeatures: ['unknown:critical-option'] } },
      }),
    },
    {
      feature: 'Shadowsocks plugin',
      endpoint: {
        kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss-plugin', name: 'SS Plugin',
        server: 'ss.example.com', port: 8388, method: 'aes-128-gcm', password: 'secret',
        plugin: { name: 'v2ray-plugin', options: 'mode=websocket' },
      },
    },
    {
      feature: 'Surge-unsupported Shadowsocks method',
      endpoint: {
        kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss-method', name: 'SS Method',
        server: 'ss.example.com', port: 8388, method: '2022-blake3-chacha20-poly1305', password: 'secret',
      },
    },
    {
      feature: 'non-canonical Shadowsocks method casing',
      endpoint: {
        kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss-method-case', name: 'SS Method Case',
        server: 'ss.example.com', port: 8388, method: 'AES-128-GCM', password: 'secret',
      },
    },
    {
      feature: 'Hysteria 2 upload bandwidth',
      endpoint: {
        kind: 'hysteria2', protocol: 'hysteria2', id: 'hy2-up', name: 'HY2 Upload',
        server: 'hy2.example.com', port: 443, password: 'secret', tls: { enabled: true }, upMbps: 20,
      },
    },
    {
      feature: 'Hysteria 2 ranged hop interval',
      endpoint: {
        kind: 'hysteria2', protocol: 'hysteria2', id: 'hy2-hop', name: 'HY2 Hop',
        server: 'hy2.example.com', port: 443, password: 'secret', tls: { enabled: true },
        serverPorts: [{ kind: 'range', start: 5000, end: 6000 }],
        hopInterval: { kind: 'range', minSeconds: 15, maxSeconds: 30 },
      },
    },
    {
      feature: 'TUIC congestion control',
      endpoint: {
        kind: 'tuic', protocol: 'tuic', id: 'tuic-cc', name: 'TUIC CC', server: 'tuic.example.com', port: 443,
        uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', password: 'secret', congestionControl: 'bbr', tls: { enabled: true },
      },
    },
    {
      feature: 'AnyTLS disabled UDP',
      endpoint: {
        kind: 'anytls', protocol: 'anytls', id: 'anytls-udp', name: 'AnyTLS UDP', server: 'anytls.example.com', port: 443,
        password: 'secret', udpEnabled: false, tls: { enabled: true },
      },
    },
    {
      feature: 'AnyTLS idle-session tuning',
      endpoint: {
        kind: 'anytls', protocol: 'anytls', id: 'anytls-idle', name: 'AnyTLS Idle', server: 'anytls.example.com', port: 443,
        password: 'secret', idleSessionTimeoutSeconds: 45, tls: { enabled: true },
      },
    },
  ] satisfies Array<{ feature: string; endpoint: ResolvedProxyEndpointIR }>)('fails closed for $feature rather than dropping intent', ({ endpoint }) => {
    compileFailure(baseIR(endpoint))
  })

  it('quotes commas, quotes and backslashes while preserving ordinary policy and strategy names', () => {
    const ir = baseIR(httpProxy({
      name: 'Proxy Name', username: 'user,one', password: 'p"ass\\word',
    }))
    ir.strategies[0].name = 'Manual Choice'
    ir.routes[0].target = { kind: 'strategy', id: 'manual' }
    ir.finalRoute = { target: { kind: 'strategy', id: 'manual' } }
    const result = compileSuccessfully(ir)
    expect(sectionLines(result.content, 'Proxy')).toEqual([
      'Proxy Name = http, proxy.example.com, 8080, username="user,one", password="p\\"ass\\\\word"',
    ])
    expect(sectionLines(result.content, 'Proxy Group')).toEqual(['Manual Choice = select, Proxy Name'])
    expect(sectionLines(result.content, 'Rule')).toEqual([
      'DOMAIN-SUFFIX,example.com,Manual Choice',
      'FINAL,Manual Choice',
    ])
  })

  it('fails closed for comma-containing policy names because Surge does not document LHS quoting', () => {
    compileFailure(baseIR(httpProxy({ name: 'Proxy, Name' })), 'SURGE_POLICY_NAME_UNSAFE')
  })

  it('validates only emitted names after Rename materialization', () => {
    const ir = baseIR(httpProxy({ name: 'Manual' }))
    ir.transforms = [{
      kind: 'rename', id: 'rename', name: 'Rename', input: { kind: 'source', id: 'source' },
      mode: 'simple', pattern: 'Manual', replacement: 'Renamed Proxy',
    }]
    ir.strategies = [{
      kind: 'select', id: 'manual', name: 'Manual', candidates: [{ kind: 'transform', id: 'rename' }],
    }]
    const result = compileSuccessfully(ir)
    expect(sectionLines(result.content, 'Proxy')).toEqual([
      'Renamed Proxy = http, proxy.example.com, 8080',
    ])
    expect(sectionLines(result.content, 'Proxy Group')).toEqual([
      'Manual = select, Renamed Proxy',
    ])
  })
})

function route(
  id: string,
  matcher: TrafficMatcherIR,
  target: ProxyFlowIR['routes'][number]['target'],
  priority: number,
): ProxyFlowIR['routes'][number] {
  return { id, name: id, matcher, target, priority }
}
