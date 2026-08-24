import { describe, expect, it } from 'vitest'
import type { DnsResolverIR, ProxyFlowIR, ResolvedProxyEndpointIR } from '../../core/ir'
import { PROXYFLOW_IR_VERSION } from '../../core/ir'
import { compileLoon, LoonCompiler } from './compiler'

const fixedNow = () => new Date('2026-08-23T00:00:00.000Z')

function http(id = 'proxy-a', name = 'Proxy A'): Extract<ResolvedProxyEndpointIR, { protocol: 'http' }> {
  return { kind: 'http', protocol: 'http', id, name, server: `${id}.example.invalid`, port: 8080 }
}

function baseIR(proxies: ResolvedProxyEndpointIR[] = [http()]): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'loon-test', projectName: 'Loon Test', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'manual', name: 'Proxy', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [{ id: 'route', name: 'Route', matcher: { kind: 'domain-suffix', value: 'example.invalid' }, target: { kind: 'strategy', id: 'manual' }, priority: 10 }],
    finalRoute: { target: { kind: 'strategy', id: 'manual' } },
    outputs: [{ id: 'output', name: 'Loon foundation test', target: 'loon', enabled: true }],
  }
}

function success(ir: ProxyFlowIR) {
  const result = compileLoon(ir, { now: fixedNow })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  expect(result.mock).toBe(false)
  return result
}

function failure(ir: ProxyFlowIR, code: string) {
  const result = compileLoon(ir, { now: fixedNow })
  expect(result.success).toBe(false)
  expect(result.content).toBe('')
  expect(result.issues).toContainEqual(expect.objectContaining({ target: 'loon', code, severity: 'error' }))
  return result
}

function section(content: string, title: string) {
  const lines = content.replaceAll('\r\n', '\n').split('\n')
  const start = lines.indexOf(`[${title}]`)
  const endOffset = lines.slice(start + 1).findIndex((line) => /^\[[^\]]+\]$/.test(line))
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset
  return lines.slice(start + 1, end).filter(Boolean)
}

describe('Loon compiler foundation', () => {
  it('compiles a minimal deterministic profile without registering product exposure', async () => {
    const ir = baseIR()
    const result = success(ir)
    expect(result.content).toContain('[General]\n\n[Proxy]\nProxy A = http,proxy-a.example.invalid,8080')
    expect(section(result.content, 'Proxy Group')).toEqual(['Proxy = select,Proxy A'])
    expect(section(result.content, 'Rule')).toEqual(['DOMAIN-SUFFIX,example.invalid,Proxy', 'FINAL,Proxy'])
    expect(result.content.endsWith('\n')).toBe(true)
    expect(result.content).toBe(compileLoon(ir, { now: fixedNow }).content)
    expect(await new LoonCompiler(fixedNow).compile(ir)).toEqual(result)
  })

  it('lowers HTTP/HTTPS, SS, simple-obfs and Trojan in stable source order', () => {
    const ss: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }> = {
      kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss', name: 'SS', server: 'ss.example.invalid', port: 443, method: 'aes-128-gcm', password: 'secret',
      plugin: { name: 'simple-obfs', options: { mode: 'tls', host: 'cdn.example.invalid', uri: '/' } },
      metadata: { compatibility: { status: 'partial', unsupportedFeatures: ['plugin:simple-obfs'] } },
    }
    const trojan: Extract<ResolvedProxyEndpointIR, { protocol: 'trojan' }> = {
      kind: 'trojan', protocol: 'trojan', id: 'trojan', name: 'Trojan', server: 'trojan.example.invalid', port: 443, password: 'secret', tls: { enabled: true },
    }
    const ir = baseIR([http(), http('https', 'HTTPS'), ss, trojan])
    const https = ir.sources[0]
    if (https.kind !== 'manual-proxy') throw new Error('fixture source')
    https.proxies[1] = { ...https.proxies[1] as Extract<ResolvedProxyEndpointIR, { protocol: 'http' }>, tls: { enabled: true, serverName: 'sni.example.invalid' } }
    const lines = section(success(ir).content, 'Proxy')
    expect(lines).toEqual([
      'Proxy A = http,proxy-a.example.invalid,8080',
      'HTTPS = https,https.example.invalid,8080,tls-name=sni.example.invalid',
      'SS = Shadowsocks,ss.example.invalid,443,aes-128-gcm,secret,obfs-name=tls,obfs-host=cdn.example.invalid,obfs-uri=/,udp=true',
      'Trojan = trojan,trojan.example.invalid,443,secret,udp=true',
    ])
  })

  it('supports Select, nested Select, URL Test, Fallback, Fixed, and proven Round-Robin', () => {
    const ir = baseIR([http(), http('proxy-b', 'Proxy B')])
    ir.strategies = [
      { kind: 'select', id: 'manual', name: 'Manual', candidates: [{ kind: 'source', id: 'source' }] },
      { kind: 'select', id: 'nested', name: 'Nested', candidates: [{ kind: 'strategy', id: 'manual' }] },
      { kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' }, healthCheck: { url: 'https://probe.example.invalid/ping', intervalSeconds: 120, toleranceMs: 50 } },
      { kind: 'fallback', id: 'fallback', name: 'Fallback', candidates: [{ kind: 'source', id: 'source' }], healthCheck: { url: 'https://probe.example.invalid/ping', intervalSeconds: 300 } },
      { kind: 'fixed', id: 'fixed', name: 'Fixed', proxyId: 'proxy-a' },
      { kind: 'load-balance', id: 'rr', name: 'Round Robin', source: { kind: 'source', id: 'source' }, mode: 'round-robin' },
    ]
    ir.routes = [
      { id: 'auto-route', name: 'Auto Route', matcher: { kind: 'domain', value: 'auto.example.invalid' }, target: { kind: 'strategy', id: 'auto' }, priority: 10 },
      { id: 'fallback-route', name: 'Fallback Route', matcher: { kind: 'domain', value: 'fallback.example.invalid' }, target: { kind: 'strategy', id: 'fallback' }, priority: 20 },
      { id: 'fixed-route', name: 'Fixed Route', matcher: { kind: 'domain', value: 'fixed.example.invalid' }, target: { kind: 'strategy', id: 'fixed' }, priority: 30 },
      { id: 'rr-route', name: 'Round-Robin Route', matcher: { kind: 'domain', value: 'rr.example.invalid' }, target: { kind: 'strategy', id: 'rr' }, priority: 40 },
    ]
    ir.finalRoute = { target: { kind: 'strategy', id: 'nested' } }
    const groups = section(success(ir).content, 'Proxy Group')
    expect(groups).toEqual([
      'Manual = select,Proxy A,Proxy B',
      'Nested = select,Manual',
      'Auto = url-test,Proxy A,Proxy B,url=https://probe.example.invalid/ping,interval=120,tolerance=50',
      'Fallback = fallback,Proxy A,Proxy B,url=https://probe.example.invalid/ping,interval=300',
      'Fixed = select,Proxy A',
      'Round Robin = load-balance,Proxy A,Proxy B,algorithm=Round-Robin',
    ])
  })

  it('blocks unsupported strategy semantics and incompatible explicit Fixed endpoints', () => {
    const consistent = baseIR()
    consistent.strategies = [{ kind: 'load-balance', id: 'lb', name: 'LB', source: { kind: 'source', id: 'source' }, mode: 'consistent-hash' }]
    consistent.routes = []
    consistent.finalRoute = { target: { kind: 'strategy', id: 'lb' } }
    failure(consistent, 'LOON_LOAD_BALANCE_CONSISTENT_HASH_UNSUPPORTED')

    const incompatible = baseIR([{
      kind: 'socks', protocol: 'socks5', version: '5', id: 'socks', name: 'SOCKS', server: 'socks.example.invalid', port: 1080,
    }])
    incompatible.strategies = [{ kind: 'fixed', id: 'fixed', name: 'Fixed', proxyId: 'socks' }]
    incompatible.routes = []
    incompatible.finalRoute = { target: { kind: 'strategy', id: 'fixed' } }
    failure(incompatible, 'LOON_PROXY_PROTOCOL_UNSUPPORTED')
  })

  it('does not let an unused Proxy Chain block the active compilation', () => {
    const ir = baseIR()
    ir.strategies.push({
      kind: 'chain', id: 'unused-chain', name: 'Unused Chain',
      hops: [{ kind: 'strategy', id: 'manual' }, { kind: 'strategy', id: 'manual' }],
    })
    const result = success(ir)
    expect(result.content).not.toContain('Unused Chain')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'LOON_PROXY_CHAIN_UNPROVEN', severity: 'warning', entityId: 'unused-chain',
    }))
  })

  it('skips an unused all-incompatible strategy without turning its projection into a blocker', () => {
    const ir = baseIR()
    ir.sources.push({
      kind: 'manual-proxy', id: 'unused-source', name: 'Unused Source',
      proxies: [{ kind: 'socks', protocol: 'socks5', version: '5', id: 'unused-socks', name: 'Unused SOCKS', server: 'socks.example.invalid', port: 1080 }],
    })
    ir.strategies.push({ kind: 'select', id: 'unused-select', name: 'Unused Select', candidates: [{ kind: 'source', id: 'unused-source' }] })
    const result = success(ir)
    expect(result.content).not.toContain('Unused Select')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'LOON_STRATEGY_NO_COMPATIBLE_MEMBERS', severity: 'warning', entityId: 'unused-select',
    }))
  })

  it('omits an unused compatible strategy and its proxy members from the profile', () => {
    const ir = baseIR()
    ir.strategies.push({ kind: 'select', id: 'unused-select', name: 'Unused Select', candidates: [{ kind: 'source', id: 'source' }] })
    const result = success(ir)
    expect(result.content).not.toContain('Unused Select')
    expect(section(result.content, 'Proxy Group')).toEqual(['Proxy = select,Proxy A'])
  })

  it('isolates inactive naming and endpoint collisions from active output', () => {
    const ir = baseIR()
    ir.sources.push({
      kind: 'manual-proxy', id: 'unused-source', name: 'Unused Source',
      proxies: [{ ...http('proxy-a', 'Proxy A'), server: 'unused,example.invalid' }],
    })
    ir.strategies.push({ kind: 'select', id: 'unused-select', name: 'Proxy', candidates: [{ kind: 'source', id: 'unused-source' }] })
    const result = success(ir)
    expect(result.content).not.toContain('unused.example.invalid')
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'LOON_PROXY_SET_ENDPOINTS_SKIPPED', severity: 'warning', entityId: 'unused-select' }))
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'LOON_POLICY_NAME_DUPLICATE' }))
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'LOON_PROXY_ID_DUPLICATE', severity: 'error' }))
  })

  it('reports one chain capability blocker without a secondary missing-target diagnostic', () => {
    const ir = baseIR()
    ir.strategies = [{
      kind: 'chain', id: 'active-chain', name: 'Active Chain',
      hops: [{ kind: 'strategy', id: 'manual' }, { kind: 'strategy', id: 'manual' }],
    }, { ...ir.strategies[0], id: 'manual', name: 'Proxy' }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'active-chain' } }
    const result = failure(ir, 'LOON_PROXY_CHAIN_UNPROVEN')
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'LOON_TARGET_REFERENCE_NOT_FOUND' }))
  })

  it('skips an unused incompatible endpoint but blocks an all-incompatible pool', () => {
    const partial = baseIR([http(), { kind: 'socks', protocol: 'socks5', version: '5', id: 'socks', name: 'SOCKS', server: 'socks.example.invalid', port: 1080 }])
    const partialResult = success(partial)
    expect(partialResult.issues).toContainEqual(expect.objectContaining({ code: 'LOON_PROXY_SET_ENDPOINTS_SKIPPED', severity: 'warning' }))
    expect(partialResult.content).not.toContain('SOCKS')

    const empty = baseIR([{ kind: 'socks', protocol: 'socks5', version: '5', id: 'socks', name: 'SOCKS', server: 'socks.example.invalid', port: 1080 }])
    failure(empty, 'LOON_STRATEGY_NO_COMPATIBLE_MEMBERS')
  })

  it('fails closed for native remote proxy export and unsupported DNS intent', () => {
    const remote = baseIR()
    const source = remote.sources[0]
    if (source.kind !== 'manual-proxy') throw new Error('fixture source')
    remote.sources = [{ kind: 'subscription', id: 'remote', name: 'Remote', url: 'https://example.invalid/sub', enabled: true, proxies: source.proxies.filter((proxy): proxy is ResolvedProxyEndpointIR => proxy.kind !== 'unmodeled'), remote: { kind: 'remote-subscription', id: 'remote', name: 'Remote', url: 'https://example.invalid/sub', requestProfile: 'auto', exportMode: 'remote' } }]
    remote.strategies = remote.strategies.map((strategy) => strategy.kind === 'select'
      ? { ...strategy, candidates: [{ kind: 'source', id: 'remote' }] }
      : strategy)
    failure(remote, 'LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN')

    const dot = baseIR()
    dot.dns = { enabled: true, mode: 'custom', resolvers: [{ id: 'dot', kind: 'dot', address: 'tls://dns.example.invalid' }] }
    failure(dot, 'LOON_DNS_DOT_UNSUPPORTED')
  })

  it('retains route order and blocks active unsupported matchers', () => {
    const ir = baseIR()
    ir.routes = [
      { id: 'second', name: 'Second', matcher: { kind: 'domain', value: 'second.example.invalid' }, target: { kind: 'direct' }, priority: 20 },
      { id: 'first', name: 'First', matcher: { kind: 'domain', value: 'first.example.invalid' }, target: { kind: 'reject' }, priority: 10 },
    ]
    expect(section(success(ir).content, 'Rule')).toEqual(['DOMAIN,first.example.invalid,REJECT', 'DOMAIN,second.example.invalid,DIRECT', 'FINAL,Proxy'])
    const unsupported = baseIR()
    unsupported.routes = [{ id: 'port', name: 'Port', matcher: { kind: 'port', port: 443 }, target: { kind: 'direct' }, priority: 10 }]
    failure(unsupported, 'LOON_PORT_MATCHER_UNSUPPORTED')
  })

  it('keeps DNS resolver order and remains byte deterministic', () => {
    const ir = baseIR()
    const resolvers: DnsResolverIR[] = [
      { id: 'system', kind: 'system' },
      { id: 'udp', kind: 'udp', address: '192.0.2.53' },
    ]
    ir.dns = { enabled: true, mode: 'custom', resolvers }
    // Mixed traditional resolvers are one exact Loon dns-server set.
    const result = success(ir)
    expect(section(result.content, 'General')).toEqual(['dns-server = system,192.0.2.53'])
    for (let index = 0; index < 100; index += 1) expect(compileLoon(ir, { now: fixedNow }).content).toBe(result.content)
  })
})
