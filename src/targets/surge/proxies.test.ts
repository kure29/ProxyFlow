import { describe, expect, it } from 'vitest'
import { parseSubscription } from '../../core/subscription/parseSubscription'
import type { ResolvedProxyEndpointIR } from '../../core/ir'
import { checkSurgeProxy, compileSurgeProxy } from './proxies'

type ShadowsocksEndpoint = Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }>

function shadowsocks(overrides: Partial<ShadowsocksEndpoint> = {}): ShadowsocksEndpoint {
  return {
    kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss', name: 'Shadowsocks',
    server: 'ss.example.com', port: 8388, method: 'aes-128-gcm', password: 'secret',
    ...overrides,
  }
}

function compiledParameters(endpoint: ShadowsocksEndpoint) {
  return compileSurgeProxy(endpoint)?.parameters
}

describe('Surge Shadowsocks lowering', () => {
  it('lowers SIP002 simple-obfs fields and consumes the matching partial parser feature', () => {
    const parsed = parseSubscription(
      'ss://YWVzLTEyOC1nY206c2VjcmV0@ss.example.com:8388/?plugin=simple-obfs%3Bobfs%3Dhttp%3Bobfs-host%3Dcdn.example.com%3Bobfs-uri%3D%2Ftunnel#Simple',
      { sourceId: 'source', sourceName: 'Fixture' },
    )
    const endpoint = parsed.proxies[0] as ShadowsocksEndpoint

    expect(parsed.partialCount).toBe(1)
    expect(endpoint.plugin).toEqual({
      name: 'simple-obfs', options: 'obfs=http;obfs-host=cdn.example.com;obfs-uri=/tunnel',
    })
    expect(checkSurgeProxy(endpoint, 'source')).toEqual([])
    expect(compiledParameters(endpoint)).toEqual([
      { key: 'encrypt-method', value: 'aes-128-gcm' },
      { key: 'password', value: 'secret' },
      { key: 'udp-relay', value: true },
      { key: 'obfs', value: 'http' },
      { key: 'obfs-host', value: 'cdn.example.com' },
      { key: 'obfs-uri', value: '/tunnel' },
    ])
  })

  it('accepts exact Clash obfs and SIP002 obfs-local representations', () => {
    const clash = shadowsocks({
      plugin: { name: 'obfs', options: { mode: 'tls', host: 'edge.example.com' } },
      metadata: { compatibility: { status: 'partial', unsupportedFeatures: ['plugin:obfs'] } },
    })
    const sip002 = shadowsocks({
      plugin: { name: 'obfs-local', options: 'obfs=http;obfs-host=edge.example.com;obfs-uri=/' },
      metadata: { compatibility: { status: 'partial', unsupportedFeatures: ['plugin:obfs-local'] } },
    })

    expect(checkSurgeProxy(clash, 'source')).toEqual([])
    expect(compiledParameters(clash)).toEqual(expect.arrayContaining([
      { key: 'obfs', value: 'tls' },
      { key: 'obfs-host', value: 'edge.example.com' },
    ]))
    expect(checkSurgeProxy(sip002, 'source')).toEqual([])
    expect(compiledParameters(sip002)).toEqual(expect.arrayContaining([
      { key: 'obfs', value: 'http' },
      { key: 'obfs-uri', value: '/' },
    ]))
  })

  it('preserves native Surge simple-obfs fields when parsing proxy lines', () => {
    const parsed = parseSubscription(`[Proxy]\nNative = ss, ss.example.com, 8388, encrypt-method=aes-128-gcm, password=secret, obfs=http, obfs-host=cdn.example.com, obfs-uri=/native`, {
      sourceId: 'source', sourceName: 'Fixture',
    })
    const endpoint = parsed.proxies[0] as ShadowsocksEndpoint

    expect(endpoint.plugin).toEqual({
      name: 'simple-obfs', options: { mode: 'http', host: 'cdn.example.com', uri: '/native' },
    })
    expect(checkSurgeProxy(endpoint, 'source')).toEqual([])
  })

  it.each([
    ['v2ray-plugin', { mode: 'websocket' }],
    ['simple-obfs', { mode: 'http', unexpected: 'value' }],
    ['simple-obfs', { host: 'cdn.example.com' }],
    ['simple-obfs', { mode: 'tls', uri: '/tls-cannot-use-uri' }],
  ] as const)('fails closed for unsupported or incomplete plugin form %s', (name, options) => {
    const endpoint = shadowsocks({
      plugin: { name, options: { ...options } },
      metadata: { compatibility: { status: 'partial', unsupportedFeatures: [`plugin:${name}`] } },
    })
    const issues = checkSurgeProxy(endpoint, 'source')

    expect(issues.map((issue) => issue.code)).toContain('SURGE_SHADOWSOCKS_PLUGIN_UNSUPPORTED')
    expect(issues.map((issue) => issue.code)).not.toContain('SURGE_PROXY_VARIANT_UNSUPPORTED')
  })

  it('continues to reject unconsumed partial semantics beside a supported plugin', () => {
    const endpoint = shadowsocks({
      plugin: { name: 'simple-obfs', options: { mode: 'tls' } },
      metadata: {
        compatibility: {
          status: 'partial',
          unsupportedFeatures: ['plugin:simple-obfs', 'tls:ech'],
          unrecognizedParams: ['future-option'],
        },
      },
    })
    const issues = checkSurgeProxy(endpoint, 'source')

    expect(issues).toHaveLength(1)
    expect(issues[0]).toEqual(expect.objectContaining({ code: 'SURGE_PROXY_VARIANT_UNSUPPORTED' }))
    expect(issues[0].message).toContain('tls:ech')
    expect(issues[0].message).toContain('future-option')
    expect(issues[0].message).not.toContain('plugin:simple-obfs')
  })

  it('uses the current official Surge cipher list rather than the portable target intersection', () => {
    for (const method of ['rc4', 'salsa20', 'chacha20']) {
      expect(checkSurgeProxy(shadowsocks({ method }), 'source').map((issue) => issue.code))
        .not.toContain('SURGE_SHADOWSOCKS_METHOD_UNSUPPORTED')
    }
    expect(checkSurgeProxy(shadowsocks({ method: '2022-blake3-chacha20-poly1305' }), 'source').map((issue) => issue.code))
      .toContain('SURGE_SHADOWSOCKS_METHOD_UNSUPPORTED')
  })
})
