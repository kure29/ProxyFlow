import { describe, expect, it } from 'vitest'
import minimalProfile from '../../../fixtures/shadowrocket/minimal.conf?raw'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type ResolvedProxyEndpointIR } from '../../core/ir'
import { compileShadowrocket, ShadowrocketCompiler } from './compiler'
import { checkShadowrocketProxy } from './proxies'
import { serializeShadowrocketProfile } from './serializer'

const fixedNow = () => new Date('2026-08-25T00:00:00.000Z')

function http(id = 'proxy-a', name = 'Proxy A'): Extract<ResolvedProxyEndpointIR, { protocol: 'http' }> {
  return { kind: 'http', protocol: 'http', id, name, server: `${id}.example.invalid`, port: 8080 }
}

function baseIR(proxies: ResolvedProxyEndpointIR[] = [http()]): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'shadowrocket-test', projectName: 'Shadowrocket Test', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'manual', name: 'Proxy', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [{ id: 'route', name: 'Route', matcher: { kind: 'domain-suffix', value: 'example.invalid' }, target: { kind: 'strategy', id: 'manual' }, priority: 10 }],
    finalRoute: { target: { kind: 'strategy', id: 'manual' } },
    outputs: [{ id: 'output', name: 'Shadowrocket', target: 'shadowrocket', enabled: true }],
  }
}

function success(ir: ProxyFlowIR) {
  const result = compileShadowrocket(ir, { now: fixedNow })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  expect(result.mock).toBe(false)
  expect(result.generatedAt).toBe('2026-08-25T00:00:00.000Z')
  return result
}

describe('Shadowrocket compiler foundation', () => {
  it('compiles a deterministic minimal profile', async () => {
    const ir = baseIR()
    const result = success(ir)
    expect(result.content).toBe(minimalProfile)
    expect(await new ShadowrocketCompiler(fixedNow).compile(ir)).toEqual(result)
    expect(result.stats).toEqual({ proxyCount: 1, endpointCount: 1, candidateCount: 1, compatibleEndpointCount: 1, skippedEndpointCount: 0, blockingIssueCount: 0 })
  })

  it('preserves strategy and rule order deterministically', () => {
    const ir = baseIR([http(), http('proxy-b', 'Proxy B')])
    ir.strategies = [
      { kind: 'select', id: 'manual', name: 'Manual', candidates: [{ kind: 'source', id: 'source' }] },
      { kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' }, healthCheck: { url: 'https://probe.example.invalid/ping', intervalSeconds: 120, toleranceMs: 50 } },
      { kind: 'fallback', id: 'fallback', name: 'Fallback', candidates: [{ kind: 'source', id: 'source' }], healthCheck: { intervalSeconds: 300 } },
    ]
    ir.routes = [
      { id: 'later', name: 'Later', matcher: { kind: 'domain', value: 'later.example.invalid' }, target: { kind: 'strategy', id: 'auto' }, priority: 20 },
      { id: 'first', name: 'First', matcher: { kind: 'domain', value: 'first.example.invalid' }, target: { kind: 'strategy', id: 'manual' }, priority: 10 },
    ]
    ir.finalRoute = { target: { kind: 'strategy', id: 'fallback' } }
    const content = success(ir).content
    expect(content).toContain('Manual = select, Proxy A, Proxy B')
    expect(content).toContain('Auto = url-test, Proxy A, Proxy B, url=https://probe.example.invalid/ping, interval=120, tolerance=50')
    expect(content.indexOf('DOMAIN,first.example.invalid,Manual')).toBeLessThan(content.indexOf('DOMAIN,later.example.invalid,Auto'))
  })

  it('lowers source-normalized simple-obfs aliases without inventing a default mode', () => {
    const shadowsocks: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }> = {
      kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss', name: 'SS', server: 'ss.example.invalid', port: 8388,
      method: 'aes-128-gcm', password: 'fictional-password',
      plugin: { name: 'simple-obfs', options: { obfs: 'tls', 'obfs-host': 'cdn.example.invalid', 'obfs-uri': '/proxy' } },
    }
    const result = success(baseIR([shadowsocks]))
    expect(result.content).toContain('SS = ss, ss.example.invalid, 8388, encrypt-method=aes-128-gcm, password=fictional-password, obfs=tls, obfs-host=cdn.example.invalid, obfs-uri=/proxy')

    const invalidPlugins: Array<NonNullable<typeof shadowsocks.plugin>> = [
      { name: 'simple-obfs', options: { host: 'cdn.example.invalid' } },
      { name: 'simple-obfs', options: { obfs: 'http', unmodeled: 'value' } },
    ]
    for (const plugin of invalidPlugins) {
      const blocked = compileShadowrocket(baseIR([{ ...shadowsocks, plugin }]), { now: fixedNow })
      expect(blocked.success).toBe(false)
      expect(blocked.issues).toContainEqual(expect.objectContaining({ code: 'SHADOWROCKET_SHADOWSOCKS_PLUGIN_UNPROVEN', severity: 'error' }))
    }
  })

  it('resolves nested strategies declared after their parent', () => {
    const ir = baseIR()
    ir.strategies = [
      { kind: 'select', id: 'parent', name: 'Parent', candidates: [{ kind: 'strategy', id: 'child' }] },
      { kind: 'select', id: 'child', name: 'Child', candidates: [{ kind: 'source', id: 'source' }] },
    ]
    ir.routes = [{ id: 'route', name: 'Route', matcher: { kind: 'domain', value: 'example.invalid' }, target: { kind: 'strategy', id: 'parent' }, priority: 1 }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'parent' } }
    const result = success(ir)
    expect(result.content.indexOf('Child = select')).toBeLessThan(result.content.indexOf('Parent = select'))
    expect(result.content).toContain('Parent = select, Child')
  })

  it('fails closed for emitted proxy and strategy policy-name collisions', () => {
    const ir = baseIR([http('proxy', 'PROXY')])
    const result = compileShadowrocket(ir, { now: fixedNow })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SHADOWROCKET_POLICY_NAME_DUPLICATE', severity: 'error' }),
    ]))
  })

  it('returns diagnostics instead of throwing for malformed runtime endpoints', () => {
    const endpoint = { ...http(), server: undefined, port: 'not-a-port' } as unknown as ResolvedProxyEndpointIR
    expect(() => checkShadowrocketProxy(endpoint)).not.toThrow()
    expect(checkShadowrocketProxy(endpoint)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SHADOWROCKET_PROXY_SERVER_INVALID', severity: 'error' }),
      expect.objectContaining({ code: 'SHADOWROCKET_PROXY_PORT_INVALID', severity: 'error' }),
    ]))
    expect(() => compileShadowrocket(baseIR([endpoint]), { now: fixedNow })).not.toThrow()
  })

  it('keeps unused chains and incompatible strategies out of the emitted profile', () => {
    const ir = baseIR()
    ir.strategies.push({ kind: 'chain', id: 'unused-chain', name: 'Unused Chain', hops: [{ kind: 'strategy', id: 'manual' }] })
    ir.sources.push({ kind: 'manual-proxy', id: 'unused-source', name: 'Unused Source', proxies: [{ kind: 'wireguard', protocol: 'wireguard', id: 'unused-wireguard', name: 'Unused WireGuard', server: 'wireguard.example.invalid', port: 51820 } as unknown as ResolvedProxyEndpointIR] })
    ir.strategies.push({ kind: 'select', id: 'unused-select', name: 'Unused Select', candidates: [{ kind: 'source', id: 'unused-source' }] })
    const result = success(ir)
    expect(result.content).not.toContain('Unused Chain')
    expect(result.content).not.toContain('Unused Select')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SHADOWROCKET_PROXY_CHAIN_UNPROVEN', severity: 'warning', entityId: 'unused-chain' }))
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SHADOWROCKET_STRATEGY_NO_COMPATIBLE_MEMBERS', severity: 'warning', entityId: 'unused-select' }))
  })

  it('isolates inactive naming collisions from active output', () => {
    const ir = baseIR()
    ir.sources.push({ kind: 'manual-proxy', id: 'unused-source', name: 'Unused Source', proxies: [{ ...http('unused-proxy', 'Proxy'), server: 'unused.example.invalid' }] })
    ir.strategies.push({ kind: 'select', id: 'unused-select', name: 'Proxy', candidates: [{ kind: 'source', id: 'unused-source' }] })
    const result = success(ir)
    expect(result.content).not.toContain('unused.example.invalid')
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'SHADOWROCKET_POLICY_NAME_DUPLICATE', severity: 'error' }))
  })

  it('fails closed for unproven chains, service sources, and resolver roles', () => {
    const ir = baseIR()
    ir.strategies.push({ kind: 'chain', id: 'chain', name: 'Chain', hops: [{ kind: 'strategy', id: 'manual' }] })
    ir.finalRoute = { target: { kind: 'strategy', id: 'chain' } }
    expect(compileShadowrocket(ir, { now: fixedNow }).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SHADOWROCKET_PROXY_CHAIN_UNPROVEN', severity: 'error' })]))
    ir.finalRoute = { target: { kind: 'strategy', id: 'manual' } }
    ir.routes = [{ id: 'service', name: 'Service', matcher: { kind: 'service', serviceIds: ['openai'] }, target: { kind: 'strategy', id: 'manual' }, priority: 1 }]
    expect(compileShadowrocket(ir, { now: fixedNow }).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SHADOWROCKET_MATCHER_UNSUPPORTED', severity: 'error' })]))
  })

  it('fails closed for an unproven load-balance algorithm', () => {
    const ir = baseIR()
    ir.strategies.push({ kind: 'load-balance', id: 'hash', name: 'Hash', source: { kind: 'source', id: 'source' }, mode: 'consistent-hash' })
    ir.finalRoute = { target: { kind: 'strategy', id: 'hash' } }
    const result = compileShadowrocket(ir, { now: fixedNow })
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SHADOWROCKET_LOAD_BALANCE_ALGORITHM_UNPROVEN', severity: 'error' }))
  })

  it.each([
    ['ip-cidr', { kind: 'ip-cidr', value: '198.51.100.9/32' }],
    ['ip-cidr6', { kind: 'ip-cidr6', value: '2001:db8::9/128' }],
  ] as const)('fails closed for mixed %s and GEOIP precedence', (_label, ipMatcher) => {
    const ir = baseIR()
    ir.routes = [
      { id: 'ip', name: 'IP', matcher: ipMatcher, target: { kind: 'reject' }, priority: 10 },
      { id: 'geo', name: 'GeoIP', matcher: { kind: 'geo-ip', countryCode: 'HK' }, target: { kind: 'direct' }, priority: 20 },
    ]
    const result = compileShadowrocket(ir, { now: fixedNow })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SHADOWROCKET_ROUTE_ORDER_SEMANTICS_UNSUPPORTED', severity: 'error', entityId: 'ip' }))
  })

  it('keeps standalone IP-CIDR and GEOIP lowering available', () => {
    const ir = baseIR()
    ir.routes = [
      { id: 'ip', name: 'IP', matcher: { kind: 'ip-cidr', value: '198.51.100.9/32' }, target: { kind: 'direct' }, priority: 10 },
    ]
    expect(success(ir).content).toContain('IP-CIDR,198.51.100.9/32,DIRECT')
    ir.routes = [
      { id: 'geo', name: 'GeoIP', matcher: { kind: 'geo-ip', countryCode: 'HK' }, target: { kind: 'direct' }, priority: 10 },
    ]
    expect(success(ir).content).toContain('GEOIP,HK,DIRECT')
  })

  it('rejects unsafe serializer values and duplicate general keys', () => {
    expect(() => serializeShadowrocketProfile({ general: [{ key: 'dns-server', value: { kind: 'list', items: ['1.1.1.1'] } }, { key: 'DNS-SERVER', value: 'system' }], proxies: [], proxyGroups: [], rules: [] })).toThrow(/Duplicate Shadowrocket/)
    expect(() => serializeShadowrocketProfile({ general: [], proxies: [{ name: 'bad,name', type: 'http', arguments: ['proxy', 80] }], proxyGroups: [], rules: [] })).toThrow(/policy names/)
  })

  it('fails closed rather than throwing for a deserialized unknown protocol', () => {
    const ir = baseIR([http(), { ...http('wireguard'), kind: 'wireguard', protocol: 'wireguard' } as unknown as ResolvedProxyEndpointIR])
    const result = compileShadowrocket(ir, { now: fixedNow })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SHADOWROCKET_PROXY_PROTOCOL_UNSUPPORTED', severity: 'error' }),
    ]))
    expect(result.stats).toEqual(expect.objectContaining({ candidateCount: 2, compatibleEndpointCount: 1, skippedEndpointCount: 1, blockingIssueCount: 1 }))
  })
})
