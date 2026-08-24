import { describe, expect, it } from 'vitest'
import type { ResolvedProxyEndpointIR } from '../../core/ir'
import { checkLoonProxy, compileLoonProxy, LOON_SHADOWSOCKS_CIPHERS, LOON_VMESS_SECURITY } from './proxies'
import { serializeLoonPolicyEntry } from './serializer'

const base = {
  server: 'node.example.invalid',
  port: 443,
} as const

function http(overrides: Partial<Extract<ResolvedProxyEndpointIR, { protocol: 'http' }>> = {}): Extract<ResolvedProxyEndpointIR, { protocol: 'http' }> {
  return { kind: 'http', protocol: 'http', id: 'http', name: 'HTTP', ...base, ...overrides }
}

function issues(endpoint: ResolvedProxyEndpointIR) {
  return checkLoonProxy(endpoint, 'source').map((issue) => issue.code)
}

describe('Loon proxy capability boundary', () => {
  it('lowers HTTP without auth and HTTPS with exact ordinary TLS fields', () => {
    expect(compileLoonProxy(http())).toEqual({ name: 'HTTP', type: 'http', arguments: [base.server, base.port], parameters: [] })
    const https = http({
      id: 'https', name: 'HTTPS', username: 'alice', password: 'secret',
      tls: { enabled: true, serverName: 'sni.example.invalid', allowInsecure: true },
    })
    expect(checkLoonProxy(https, 'source')).toEqual([])
    expect(compileLoonProxy(https)).toEqual({
      name: 'HTTPS', type: 'https', arguments: [base.server, base.port, 'alice', { kind: 'quoted', value: 'secret' }],
      parameters: [{ key: 'skip-cert-verify', value: true }, { key: 'tls-name', value: 'sni.example.invalid' }],
    })
  })

  it('rejects half HTTP credentials and unproven TLS variants', () => {
    expect(issues(http({ username: 'alice' }))).toContain('LOON_PROXY_AUTH_UNSUPPORTED')
    expect(issues(http({ tls: { enabled: true, fingerprint: 'chrome' } }))).toContain('LOON_PROXY_TLS_VARIANT_UNSUPPORTED')
    expect(issues(http({ tls: { enabled: true, alpn: ['h2', 'http/1.1'] } }))).toContain('LOON_PROXY_TLS_VARIANT_UNSUPPORTED')
    expect(issues(http({ tls: { enabled: true, alpn: ['h2'] } }))).toContain('LOON_PROXY_TLS_VARIANT_UNSUPPORTED')
  })

  it('blocks Unicode names and values until a Loon round-trip fixture exists', () => {
    expect(issues(http({ name: '东京' }))).toContain('LOON_SERIALIZER_UNSAFE_VALUE')
    expect(issues(http({ username: '用户', password: 'secret' }))).toContain('LOON_SERIALIZER_UNSAFE_VALUE')
  })

  it('lowers Shadowsocks and the independent simple-obfs mapping', () => {
    const endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }> = {
      kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss', name: 'SS',
      server: 'ss.example.invalid', port: 8388, method: 'aes-128-gcm', password: 'secret',
      plugin: { name: 'simple-obfs', options: 'obfs-name=http;obfs-host=cdn.example.invalid;obfs-uri=/tunnel' },
      metadata: { compatibility: { status: 'partial', unsupportedFeatures: ['plugin:simple-obfs'] } },
    }
    expect(checkLoonProxy(endpoint, 'source')).toEqual([])
    expect(compileLoonProxy(endpoint)).toEqual({
      name: 'SS', type: 'Shadowsocks', arguments: ['ss.example.invalid', 8388, 'aes-128-gcm', { kind: 'quoted', value: 'secret' }],
      parameters: [
        { key: 'obfs-name', value: 'http' },
        { key: 'obfs-host', value: 'cdn.example.invalid' },
        { key: 'obfs-uri', value: '/tunnel' },
        { key: 'udp', value: true },
      ],
    })
  })

  it('has a Loon-owned cipher boundary and rejects unsupported plugins', () => {
    const ss: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }> = {
      kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss', name: 'SS',
      server: 'ss.example.invalid', port: 8388, method: '2022-blake3-aes-256-gcm', password: 'secret',
    }
    expect(issues(ss)).toContain('LOON_PROXY_CIPHER_UNSUPPORTED')
    expect(issues({ ...ss, method: 'aes-128-gcm', plugin: { name: 'v2ray-plugin', options: { mode: 'websocket' } } })).toContain('LOON_PROXY_VARIANT_UNSUPPORTED')
  })

  it('keeps every accepted cipher tied to a pinned first-party example', () => {
    expect([...LOON_SHADOWSOCKS_CIPHERS].sort()).toEqual(['aes-128-gcm', 'chacha20'])
    expect([...LOON_VMESS_SECURITY].sort()).toEqual(['aes-128-gcm'])

    const ss: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }> = {
      kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss', name: 'SS',
      server: 'ss.example.invalid', port: 8388, method: 'aes-256-gcm', password: 'secret',
    }
    expect(issues(ss)).toContain('LOON_PROXY_CIPHER_UNSUPPORTED')

    const vmess: Extract<ResolvedProxyEndpointIR, { protocol: 'vmess' }> = {
      kind: 'vmess', protocol: 'vmess', id: 'vmess', name: 'VMess',
      server: 'vmess.example.invalid', port: 443, uuid: '123e4567-e89b-12d3-a456-426614174000', security: 'auto', alterId: 0,
    }
    expect(issues(vmess)).toContain('LOON_PROXY_CIPHER_UNSUPPORTED')
  })

  it.each(['obfs', 'obfs-local'] as const)('accepts only the canonical simple-obfs plugin name (%s is blocked)', (pluginName) => {
    const endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }> = {
      kind: 'shadowsocks', protocol: 'shadowsocks', id: `ss-${pluginName}`, name: `SS ${pluginName}`,
      server: 'ss.example.invalid', port: 8388, method: 'aes-128-gcm', password: 'secret',
      plugin: { name: pluginName, options: { 'obfs-name': 'http' } },
    }
    expect(issues(endpoint)).toContain('LOON_PROXY_VARIANT_UNSUPPORTED')
  })

  it.each([
    ['mode', 'http'],
    ['obfs', 'http'],
    ['host', 'cdn.example.invalid'],
    ['uri', '/tunnel'],
    ['path', '/tunnel'],
  ] as const)('rejects non-canonical simple-obfs option key %s', (key, value) => {
    const endpoint: Extract<ResolvedProxyEndpointIR, { protocol: 'shadowsocks' }> = {
      kind: 'shadowsocks', protocol: 'shadowsocks', id: `ss-${key}`, name: `SS ${key}`,
      server: 'ss.example.invalid', port: 8388, method: 'aes-128-gcm', password: 'secret',
      plugin: { name: 'simple-obfs', options: { [key]: value } },
    }
    expect(issues(endpoint)).toContain('LOON_PROXY_VARIANT_UNSUPPORTED')
  })

  it('fails closed for unknown protocols and malformed TLS metadata', () => {
    const unknown = { ...http(), kind: 'wireguard', protocol: 'wireguard' } as unknown as ResolvedProxyEndpointIR
    expect(issues(unknown)).toContain('LOON_PROXY_PROTOCOL_UNSUPPORTED')
    expect(compileLoonProxy(unknown)).toBeUndefined()

    const malformed = http({ tls: { enabled: true, alpn: 'h2' as unknown as string[] } })
    expect(issues(malformed)).toContain('LOON_PROXY_TLS_VARIANT_UNSUPPORTED')
    const malformedToken = http({ tls: { enabled: true, alpn: [42] as unknown as string[] } })
    expect(issues(malformedToken)).toContain('LOON_PROXY_TLS_VARIANT_UNSUPPORTED')
  })

  it('lowers Trojan TCP/WS/HTTP and blocks unsupported transport metadata', () => {
    const trojan: Extract<ResolvedProxyEndpointIR, { protocol: 'trojan' }> = {
      kind: 'trojan', protocol: 'trojan', id: 'trojan', name: 'Trojan',
      server: 'trojan.example.invalid', port: 443, password: 'secret',
      tls: { enabled: true, serverName: 'sni.example.invalid', allowInsecure: true, alpn: ['h2'] },
      transport: { kind: 'ws', path: '/ws', host: 'cdn.example.invalid' },
    }
    expect(checkLoonProxy(trojan, 'source')).toEqual([])
    expect(compileLoonProxy(trojan)).toEqual({
      name: 'Trojan', type: 'trojan', arguments: ['trojan.example.invalid', 443, { kind: 'quoted', value: 'secret' }],
      parameters: [
        { key: 'path', value: '/ws' }, { key: 'host', value: 'cdn.example.invalid' },
        { key: 'skip-cert-verify', value: true }, { key: 'tls-name', value: 'sni.example.invalid' }, { key: 'alpn', value: 'h2' },
        { key: 'udp', value: true },
      ],
    })
    expect(issues({ ...trojan, transport: { kind: 'grpc', serviceName: 'svc' } })).toContain('LOON_PROXY_TRANSPORT_UNSUPPORTED')
  })

  it('requires explicit VMess alterId and supports only documented basic transports', () => {
    const vmess: Extract<ResolvedProxyEndpointIR, { protocol: 'vmess' }> = {
      kind: 'vmess', protocol: 'vmess', id: 'vmess', name: 'VMess',
      server: 'vmess.example.invalid', port: 443, uuid: '123e4567-e89b-12d3-a456-426614174000', security: 'aes-128-gcm',
      alterId: 0, tls: { enabled: true, serverName: 'sni.example.invalid' }, transport: { kind: 'ws', path: '/', host: 'cdn.example.invalid' },
    }
    expect(checkLoonProxy(vmess, 'source')).toEqual([])
    expect(compileLoonProxy(vmess)).toEqual({
      name: 'VMess', type: 'vmess', arguments: ['vmess.example.invalid', 443, 'aes-128-gcm', { kind: 'quoted', value: vmess.uuid }],
      parameters: [
        { key: 'transport', value: 'ws' }, { key: 'alterId', value: 0 }, { key: 'path', value: '/' }, { key: 'host', value: 'cdn.example.invalid' },
        { key: 'over-tls', value: true }, { key: 'tls-name', value: 'sni.example.invalid' },
      ],
    })
    expect(issues({ ...vmess, id: 'missing-alter', alterId: undefined })).toContain('LOON_VMESS_VARIANT_UNSUPPORTED')
    expect(issues({ ...vmess, transport: { kind: 'grpc', serviceName: 'svc' } })).toContain('LOON_PROXY_TRANSPORT_UNSUPPORTED')
  })

  it('supports basic VLESS and blocks Reality, Vision, and modern transports', () => {
    const vless: Extract<ResolvedProxyEndpointIR, { protocol: 'vless' }> = {
      kind: 'vless', protocol: 'vless', id: 'vless', name: 'VLESS',
      server: 'vless.example.invalid', port: 443, uuid: '123e4567-e89b-12d3-a456-426614174000', security: 'tls', encryption: 'none',
      tls: { enabled: true, serverName: 'sni.example.invalid' }, transport: { kind: 'http', variant: 'http', path: '/', host: 'cdn.example.invalid' },
    }
    expect(checkLoonProxy(vless, 'source')).toEqual([])
    expect(compileLoonProxy(vless)?.type).toBe('VLESS')
    expect(issues({ ...vless, flow: 'xtls-rprx-vision' })).toContain('LOON_VLESS_VARIANT_UNSUPPORTED')
    expect(issues({ ...vless, tls: { enabled: true, reality: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } } })).toContain('LOON_VLESS_VARIANT_UNSUPPORTED')
    expect(issues({ ...vless, transport: { kind: 'xhttp', path: '/', host: 'cdn.example.invalid' } })).toContain('LOON_PROXY_TRANSPORT_UNSUPPORTED')
  })

  it('serializes the audited protocol fields as exact Loon lines', () => {
    const uuid = '52396e06-041a-4cc2-be5c-8525eb457809'
    const endpoints: ResolvedProxyEndpointIR[] = [
      { kind: 'http', protocol: 'http', id: 'http1', name: 'http1', server: 'example.com', port: 80, username: 'user', password: 'password' },
      { kind: 'http', protocol: 'http', id: 'https1', name: 'https1', server: 'example.com', port: 443, username: 'user', password: 'password', tls: { enabled: true } },
      { kind: 'shadowsocks', protocol: 'shadowsocks', id: 'ss1', name: 'ss1', server: 'example.com', port: 443, method: 'aes-128-gcm', password: 'password' },
      { kind: 'vmess', protocol: 'vmess', id: 'vmess1', name: 'vmess1', server: 'example.com', port: 10086, uuid, security: 'aes-128-gcm', alterId: 0 },
      { kind: 'vless', protocol: 'vless', id: 'VLESS1', name: 'VLESS1', server: 'example.com', port: 10086, uuid, security: 'none', encryption: 'none' },
      { kind: 'trojan', protocol: 'trojan', id: 'trojan1', name: 'trojan1', server: 'example.com', port: 443, password: 'password', tls: { enabled: true } },
      { kind: 'hysteria2', protocol: 'hysteria2', id: 'hysteria21', name: 'hysteria21', server: 'example.com', port: 443, password: 'password', tls: { enabled: true } },
    ]

    const lines = endpoints.map((endpoint) => {
      expect(checkLoonProxy(endpoint, 'source')).toEqual([])
      const compiled = compileLoonProxy(endpoint)
      expect(compiled).toBeDefined()
      return serializeLoonPolicyEntry(compiled!)
    })

    expect(lines).toEqual([
      'http1 = http,example.com,80,user,"password"',
      'https1 = https,example.com,443,user,"password"',
      'ss1 = Shadowsocks,example.com,443,aes-128-gcm,"password",udp=true',
      `vmess1 = vmess,example.com,10086,aes-128-gcm,"${uuid}",transport=tcp,alterId=0,over-tls=false`,
      `VLESS1 = VLESS,example.com,10086,"${uuid}",transport=tcp,over-tls=false`,
      'trojan1 = trojan,example.com,443,"password",udp=true',
      'hysteria21 = Hysteria2,example.com,443,"password",udp=true',
    ])
  })

  it('supports minimal Hysteria2 and blocks fields outside the proven subset', () => {
    const hy2: Extract<ResolvedProxyEndpointIR, { protocol: 'hysteria2' }> = {
      kind: 'hysteria2', protocol: 'hysteria2', id: 'hy2', name: 'Hysteria2',
      server: 'hy2.example.invalid', port: 443, password: 'secret', tls: { enabled: true, serverName: 'hy2.example.invalid', allowInsecure: true },
    }
    expect(checkLoonProxy(hy2, 'source')).toEqual([])
    expect(compileLoonProxy(hy2)).toEqual({
      name: 'Hysteria2', type: 'Hysteria2', arguments: ['hy2.example.invalid', 443, { kind: 'quoted', value: 'secret' }],
      parameters: [{ key: 'skip-cert-verify', value: true }, { key: 'tls-name', value: 'hy2.example.invalid' }, { key: 'udp', value: true }],
    })
    expect(issues({ ...hy2, obfs: { type: 'salamander', password: 'obfs' } })).toContain('LOON_HYSTERIA2_VARIANT_UNSUPPORTED')
  })

  it.each(['socks5', 'tuic', 'anytls'] as const)('defers %s', (protocol) => {
    const endpoint = protocol === 'socks5'
      ? { kind: 'socks', protocol: 'socks5', version: '5' as const, id: protocol, name: protocol, ...base }
      : protocol === 'tuic'
        ? { kind: 'tuic', protocol: 'tuic', id: protocol, name: protocol, ...base, uuid: '123e4567-e89b-12d3-a456-426614174000', password: 'secret', tls: { enabled: true } as const }
        : { kind: 'anytls', protocol: 'anytls', id: protocol, name: protocol, ...base, password: 'secret', tls: { enabled: true } as const }
    expect(issues(endpoint as ResolvedProxyEndpointIR)).toContain('LOON_PROXY_PROTOCOL_UNSUPPORTED')
  })
})
