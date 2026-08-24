import { describe, expect, it } from 'vitest'
import { LOON_CAPABILITIES, LOON_CAPABILITY_MATRIX, loonProtocolCapability } from './capabilities'

describe('Loon capability boundary', () => {
  it('keeps the target-local proven subset explicit', () => {
    expect(LOON_CAPABILITIES.protocols.http).toBe('supported')
    expect(LOON_CAPABILITIES.protocols['shadowsocks-simple-obfs']).toBe('conditional')
    expect(LOON_CAPABILITIES.protocols.tuic).toBe('deferred')
    expect(LOON_CAPABILITIES.strategies['load-balance-pcc']).toBe('unsupported')
    expect(LOON_CAPABILITIES.dns).toEqual(['dns-server', 'doh-server'])
    expect(LOON_CAPABILITY_MATRIX.find((entry) => entry.feature === 'Routing baseline')?.status).toBe('conditional')
    expect(LOON_CAPABILITY_MATRIX.find((entry) => entry.feature === 'Routing baseline')?.diagnostic)
      .toBe('LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED')
  })

  it('does not borrow another target cipher or protocol decision', () => {
    expect(loonProtocolCapability({ kind: 'http', protocol: 'http', id: 'http', name: 'HTTP', server: 'example.invalid', port: 80 })).toBe('supported')
    expect(loonProtocolCapability({ kind: 'http', protocol: 'http', id: 'https', name: 'HTTPS', server: 'example.invalid', port: 443, tls: { enabled: true } })).toBe('conditional')
    expect(loonProtocolCapability({ kind: 'tuic', protocol: 'tuic', id: 'tuic', name: 'TUIC', server: 'example.invalid', port: 443, uuid: '123e4567-e89b-12d3-a456-426614174000', password: 'secret', tls: { enabled: true } })).toBe('deferred')
    expect(LOON_CAPABILITIES.shadowsocksCiphers).toContain('aes-128-gcm')
    expect(LOON_CAPABILITIES.shadowsocksCiphers).toEqual(['aes-128-gcm', 'chacha20'])
    expect(LOON_CAPABILITIES.shadowsocksCiphers).not.toContain('2022-blake3-aes-256-gcm')
  })

  it('keeps the evidence matrix and static protocol statuses aligned', () => {
    for (const [feature, key] of [
      ['HTTPS', 'https'], ['SOCKS5', 'socks5'], ['TUIC', 'tuic'], ['AnyTLS', 'anytls'], ['WireGuard', 'wireguard'],
      ['ShadowsocksR', 'shadowsocksr'], ['Custom JS protocol', 'custom'],
    ] as const) {
      expect(LOON_CAPABILITY_MATRIX.find((entry) => entry.feature === feature)?.status)
        .toBe(LOON_CAPABILITIES.protocols[key])
    }
  })
})
