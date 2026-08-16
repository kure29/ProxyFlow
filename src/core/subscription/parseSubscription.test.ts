import { describe, expect, it } from 'vitest'
import plainLinks from '../../../fixtures/subscriptions/plain-links.txt?raw'
import base64Subscription from '../../../fixtures/subscriptions/base64-subscription.txt?raw'
import clashYaml from '../../../fixtures/subscriptions/clash-proxies.yaml?raw'
import clashModern from '../../../fixtures/subscriptions/clash-modern.yaml?raw'
import malformed from '../../../fixtures/subscriptions/malformed.txt?raw'
import mixed from '../../../fixtures/subscriptions/mixed-valid-invalid.txt?raw'
import hysteria2 from '../../../fixtures/subscriptions/hysteria2.txt?raw'
import malformedModern from '../../../fixtures/subscriptions/malformed-modern.txt?raw'
import modernTransports from '../../../fixtures/subscriptions/modern-transports.txt?raw'
import tuic from '../../../fixtures/subscriptions/tuic.txt?raw'
import vlessReality from '../../../fixtures/subscriptions/vless-reality.txt?raw'
import vlessVision from '../../../fixtures/subscriptions/vless-vision.txt?raw'
import { encodeBase64Text } from './base64'
import { parseSubscription } from './parseSubscription'
import { redactSecret, redactSubscriptionUrl } from '../proxy'

const options = { sourceId: 'fixture-source', sourceName: 'Fixture Source' }

describe('subscription parser', () => {
  it('parses all six supported share-link protocols', () => {
    const result = parseSubscription(plainLinks, options)
    expect(result.format).toBe('share-links')
    expect(result.detectedCount).toBe(6)
    expect(result.unsupportedCount).toBe(0)
    expect(result.proxies.map((proxy) => proxy.protocol)).toEqual(['http', 'socks5', 'shadowsocks', 'trojan', 'vmess', 'vless'])
  })

  it('detects and decodes Base64 subscriptions by content', () => {
    const result = parseSubscription(base64Subscription, { ...options, filename: 'misleading.yaml' })
    expect(result.format).toBe('base64')
    expect(result.proxies).toHaveLength(5)
  })

  it('extracts only proxies from safe Clash YAML', () => {
    const result = parseSubscription(clashYaml, options)
    expect(result.format).toBe('clash-yaml')
    expect(result.proxies).toHaveLength(6)
    expect(result.issues.map((issue) => issue.code)).toContain('ONLY_PROXY_SECTION_IMPORTED')
    expect(result.proxies.map((proxy) => proxy.metadata?.region?.code)).toEqual(['UNKNOWN', 'UNKNOWN', 'HK', 'US', 'JP', 'SG'])
  })

  it('never silently drops malformed or unsupported lines', () => {
    const result = parseSubscription(mixed, options)
    expect(result.detectedCount).toBe(4)
    expect(result.readyCount).toBe(2)
    expect(result.unsupportedCount).toBe(2)
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['PROXY_LINK_UNRECOGNIZED', 'PROXY_LINK_MALFORMED']))
  })

  it.each([
    ['http', 'http://'],
    ['socks5', 'socks5://'],
    ['shadowsocks', 'ss://broken'],
    ['trojan', 'trojan://@trojan.example.com:443'],
    ['vmess', 'vmess://@@@'],
    ['vless', 'vless://not-a-uuid@vless.example.com:443'],
  ])('marks malformed %s links unsupported with a stable code', (_protocol, input) => {
    const result = parseSubscription(input, options)
    expect(result.unsupportedCount).toBe(1)
    expect(result.issues.map((issue) => issue.code)).toContain('PROXY_LINK_MALFORMED')
  })

  it('rejects unknown Shadowsocks ciphers and marks non-portable plugins partial', () => {
    const unsupported = parseSubscription('ss://bm90LWEtY2lwaGVyOmRlbW8=@ss.example.com:8388#Cipher', options)
    expect(unsupported.unsupportedCount).toBe(1)
    expect(unsupported.issues.map((issue) => issue.code)).toContain('PROXY_CIPHER_UNSUPPORTED')

    const partial = parseSubscription('ss://YWVzLTEyOC1nY206ZGVtbw==@ss.example.com:8388/?plugin=obfs-local%3Bobfs%3Dtls#Plugin', options)
    expect(partial.partialCount).toBe(1)
    expect(partial.issues.map((issue) => issue.code)).toContain('PROXY_VARIANT_PARTIAL')
  })

  it('marks Reality and Vision variants partial instead of guessing', () => {
    const input = 'vless://88888888-8888-4888-8888-888888888888@reality.example.com:443?security=reality&flow=xtls-rprx-vision&pbk=fake&sid=abcd#Reality%20Vision'
    const result = parseSubscription(input, options)
    expect(result.partialCount).toBe(1)
    expect(result.proxies[0].metadata?.compatibility).toEqual(expect.objectContaining({ status: 'partial' }))
    expect(result.issues.map((issue) => issue.code)).toContain('PROXY_VARIANT_PARTIAL')
  })

  it('parses complete Reality and Vision nodes while isolating missing or unknown semantics', () => {
    const reality = parseSubscription(vlessReality, options)
    expect([reality.readyCount, reality.partialCount]).toEqual([1, 1])
    expect(reality.proxies[0]).toEqual(expect.objectContaining({
      protocol: 'vless', tls: expect.objectContaining({
        fingerprint: 'chrome', reality: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', shortId: 'abcd1234' },
      }),
    }))
    expect(reality.nodes[1].issues.map((issue) => issue.code)).toContain('PROXY_VARIANT_PARTIAL')

    const vision = parseSubscription(vlessVision, options)
    expect([vision.readyCount, vision.partialCount]).toEqual([1, 1])
    expect(vision.proxies[0]).toEqual(expect.objectContaining({ flow: 'xtls-rprx-vision' }))
    expect(vision.proxies[1].metadata?.compatibility?.unsupportedFeatures).toContain('flow:experimental-flow')
  })

  it('retains modern transport intent including WS early data, HTTP/2, HTTPUpgrade and XHTTP', () => {
    const result = parseSubscription(modernTransports, options)
    expect([result.detectedCount, result.readyCount, result.partialCount]).toEqual([5, 5, 0])
    expect(result.proxies.map((proxy) => 'transport' in proxy ? proxy.transport : undefined)).toEqual([
      { kind: 'ws', path: '/socket', host: 'cdn.example.com', maxEarlyData: 2048, earlyDataHeaderName: 'Sec-WebSocket-Protocol' },
      { kind: 'grpc', serviceName: 'proxyflow' },
      { kind: 'http', variant: 'h2', path: '/h2', host: 'h2-host.example.com' },
      { kind: 'httpupgrade', path: '/upgrade', host: 'upgrade-host.example.com' },
      { kind: 'xhttp', path: '/xhttp', host: 'xhttp-host.example.com', mode: 'stream-up' },
    ])
  })

  it('parses Hysteria2 and TUIC v5 without exposing credentials in IDs or diagnostics', () => {
    const result = parseSubscription(`${hysteria2}\n${tuic}`, options)
    expect(result.proxies.map((proxy) => proxy.protocol)).toEqual(['hysteria2', 'tuic'])
    expect(result.proxies[0]).toEqual(expect.objectContaining({
      password: 'hy2-demo-password', upMbps: 30, downMbps: 200,
      serverPorts: [{ kind: 'single', port: 443 }, { kind: 'range', start: 5000, end: 6000 }],
      hopInterval: { kind: 'fixed', seconds: 30 },
      obfs: { type: 'salamander', password: 'hy2-obfs-password' },
    }))
    expect(result.proxies[1]).toEqual(expect.objectContaining({
      uuid: '44444444-4444-4444-8444-444444444444', password: 'tuic-demo-password', congestionControl: 'bbr', udpRelayMode: 'native',
    }))
    const publicText = `${result.nodes.map((node) => node.id).join(' ')} ${result.issues.map((issue) => issue.message).join(' ')}`
    expect(publicText).not.toContain('hy2-demo-password')
    expect(publicText).not.toContain('tuic-demo-password')
    expect(publicText).not.toContain('44444444-4444-4444-8444-444444444444')
  })

  it('reports every malformed modern node and keeps warning-only modern nodes ready', () => {
    const result = parseSubscription(malformedModern, options)
    expect([result.detectedCount, result.readyCount, result.partialCount, result.unsupportedCount]).toEqual([5, 1, 2, 2])
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'PROXY_VARIANT_PARTIAL', 'PROXY_LINK_MALFORMED', 'PROXY_PARAMS_UNRECOGNIZED',
    ]))
  })

  it('parses modern Clash proxy objects into the same normalized IR', () => {
    const result = parseSubscription(`proxies:
  - { name: Reality Clash, type: vless, server: reality-clash.example.com, port: 443, uuid: 77777777-7777-4777-8777-777777777771, tls: true, servername: www.example.com, client-fingerprint: chrome, flow: xtls-rprx-vision, reality-opts: { public-key: CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC, short-id: abcd }, network: grpc, grpc-opts: { grpc-service-name: clash } }
  - { name: HY2 Clash, type: hysteria2, server: hy2-clash.example.com, port: 443, password: clash-hy2-password, sni: hy2-clash.example.com, obfs: salamander, obfs-password: clash-obfs, up: 20 Mbps, down: 100 Mbps }
  - { name: TUIC Clash, type: tuic, server: tuic-clash.example.com, port: 443, uuid: 77777777-7777-4777-8777-777777777773, password: clash-tuic-password, sni: tuic-clash.example.com, congestion-controller: cubic, udp-relay-mode: native }
`, options)
    expect(result.format).toBe('clash-yaml')
    expect(result.readyCount).toBe(3)
    expect(result.proxies.map((proxy) => proxy.protocol)).toEqual(['vless', 'hysteria2', 'tuic'])
    expect(result.proxies[0]).toEqual(expect.objectContaining({ flow: 'xtls-rprx-vision', transport: { kind: 'grpc', serviceName: 'clash' } }))
  })

  it('parses official Hysteria2 authority port selections and defaults an omitted port to 443', () => {
    const hopping = parseSubscription('hysteria2://demo@hy2.example.com:443,5000-6000/#Hopping', options)
    expect(hopping.readyCount).toBe(1)
    expect(hopping.proxies[0]).toEqual(expect.objectContaining({
      port: 443,
      serverPorts: [{ kind: 'single', port: 443 }, { kind: 'range', start: 5000, end: 6000 }],
    }))

    const defaultPort = parseSubscription('hysteria2://demo@hy2.example.com/#Default', options)
    expect(defaultPort.readyCount).toBe(1)
    expect(defaultPort.proxies[0]).toEqual(expect.objectContaining({ port: 443 }))
    expect(defaultPort.proxies[0]).not.toHaveProperty('serverPorts')
  })

  it('fails closed for Hysteria2 certificate pinning and ECH parameters', () => {
    const pinned = parseSubscription('hysteria2://demo@hy2.example.com:443/?pinSHA256=not-logged#Pinned', options)
    const ech = parseSubscription('hysteria2://demo@hy2.example.com:443/?ech=not-logged#ECH', options)
    expect(pinned.partialCount).toBe(1)
    expect(ech.partialCount).toBe(1)
    expect(pinned.proxies[0].metadata?.compatibility?.unsupportedFeatures).toContain('tls:pin-sha256')
    expect(ech.proxies[0].metadata?.compatibility?.unsupportedFeatures).toContain('tls:ech')
    expect(pinned.issues.map((issue) => issue.message).join(' ')).not.toContain('not-logged')
  })

  it('preserves TUIC allow_insecure and disable_sni security semantics', () => {
    const result = parseSubscription('tuic://99999999-9999-4999-8999-999999999993:demo@tuic.example.com:443?allow_insecure=true&disable_sni=true#TUIC', options)
    expect(result.readyCount).toBe(1)
    expect(result.proxies[0]).toEqual(expect.objectContaining({
      tls: expect.objectContaining({ allowInsecure: true, disableSni: true }),
    }))
  })

  it('fails closed for unknown VLESS security with a stable diagnostic', () => {
    const result = parseSubscription('vless://99999999-9999-4999-8999-999999999994@vless.example.com:443?security=future-security&type=tcp#Unknown', options)
    expect(result.partialCount).toBe(1)
    expect(result.readyCount).toBe(0)
    expect(result.issues.map((issue) => issue.code)).toContain('PROXY_SECURITY_UNSUPPORTED')
  })

  it('diagnoses invalid WebSocket early data instead of silently deleting it', () => {
    const result = parseSubscription('vless://99999999-9999-4999-8999-999999999995@vless.example.com:443?security=tls&type=ws&ed=not-a-number#Invalid%20ED', options)
    expect(result.partialCount).toBe(1)
    expect(result.issues.map((issue) => issue.code)).toContain('PROXY_WS_EARLY_DATA_INVALID')
    expect(result.proxies[0].metadata?.compatibility?.unsupportedFeatures).toContain('ws-early-data:invalid')
  })

  it('restores real Mihomo HTTPUpgrade structure and fails closed for certificate fingerprints', () => {
    const result = parseSubscription(clashModern, options)
    expect([result.readyCount, result.partialCount]).toEqual([2, 1])
    expect(result.proxies[0]).toEqual(expect.objectContaining({
      transport: { kind: 'httpupgrade', path: '/upgrade', host: 'upgrade-host.example.com' },
    }))
    expect(result.proxies[1].metadata?.compatibility?.unsupportedFeatures).toContain('tls:certificate-fingerprint')
    expect(result.nodes[1].issues.map((issue) => issue.code)).toContain('PROXY_SECURITY_CRITICAL_UNSUPPORTED')
    expect(result.proxies[2]).toEqual(expect.objectContaining({
      protocol: 'tuic', tls: expect.objectContaining({ allowInsecure: true, disableSni: true }),
    }))
  })

  it('preserves VMess H2 as distinct HTTP/2 transport intent', () => {
    const result = parseSubscription('vmess://eyJ2IjoiMiIsInBzIjoiVk1lc3MgSDIiLCJhZGQiOiJ2bWVzcy1oMi5leGFtcGxlLmNvbSIsInBvcnQiOiI0NDMiLCJpZCI6Ijk5OTk5OTk5LTk5OTktNDk5OS04OTk5LTk5OTk5OTk5OTk5MiIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwidGxzIjoidGxzIiwic25pIjoidm1lc3MtaDIuZXhhbXBsZS5jb20iLCJuZXQiOiJoMiIsImhvc3QiOiJoMi1ob3N0LmV4YW1wbGUuY29tIiwicGF0aCI6Ii9oMiJ9', options)
    expect(result.readyCount).toBe(1)
    expect(result.proxies[0]).toEqual(expect.objectContaining({
      transport: { kind: 'http', variant: 'h2', path: '/h2', host: 'h2-host.example.com' },
    }))
  })

  it('models a random Hysteria2 hop interval without parseInt downgrade', () => {
    const result = parseSubscription('hysteria2://demo@hy2.example.com:443,5000-6000/?hop-interval=15-30#Random', options)
    expect(result.readyCount).toBe(1)
    expect(result.proxies[0]).toEqual(expect.objectContaining({ hopInterval: { kind: 'range', minSeconds: 15, maxSeconds: 30 } }))
  })

  it('handles fuzz-like input without throwing', () => {
    const cases = [
      '', '\r\n\r\n', malformed, '%%%%', 'vmess://@@@', 'vless://%E0%A4%A@example.com:443',
      `# 注释\n${' '.repeat(10_000)}\nss://broken`,
      'trojan://pass@example.com:443?sni=a&sni=b#重复参数',
    ]
    for (const input of cases) expect(() => parseSubscription(input, options)).not.toThrow()
  })

  it('fails closed for conflicting duplicate SNI while keeping identical duplicates deterministic', () => {
    const input = 'trojan://demo-pass@warning.example.com:443?sni=warning.example.com&sni=duplicate.example.com&future-option=1#Warning%20Only'
    const result = parseSubscription(input, options)
    expect(result.readyCount).toBe(0)
    expect(result.partialCount).toBe(1)
    expect(result.nodes[0]).toEqual(expect.objectContaining({ status: 'partial' }))
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'DUPLICATE_QUERY_PARAM', 'PROXY_PARAMS_CONFLICT', 'PROXY_PARAMS_UNRECOGNIZED',
    ]))

    const identical = parseSubscription('trojan://demo-pass@warning.example.com:443?sni=warning.example.com&sni=warning.example.com#Same', options)
    expect(identical.readyCount).toBe(1)
    expect(identical.partialCount).toBe(0)
    expect(identical.proxies[0]).toEqual(expect.objectContaining({ tls: expect.objectContaining({ serverName: 'warning.example.com' }) }))
  })

  it.each([
    [
      'Reality fields with security=none',
      'vless://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@vless.example.com:443?security=none&sni=www.example.com&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd#RealityConflict',
      'PROXY_VLESS_REALITY_SECURITY_CONFLICT',
    ],
    [
      'Vision with security=none',
      'vless://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@vless.example.com:443?security=none&flow=xtls-rprx-vision#VisionConflict',
      'PROXY_VLESS_VISION_TLS_REQUIRED',
    ],
  ])('fails closed for VLESS cross-field conflict: %s', (_name, input, code) => {
    const result = parseSubscription(input, options)
    expect([result.readyCount, result.partialCount]).toEqual([0, 1])
    expect(result.issues.map((issue) => issue.code)).toContain(code)
  })

  it('preserves contradictory Clash Reality intent and marks it Partial', () => {
    const result = parseSubscription(`proxies:
  - name: Reality Conflict
    type: vless
    server: vless.example.com
    port: 443
    uuid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
    security: none
    tls: false
    sni: www.example.com
    reality-opts: { public-key: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA, short-id: abcd }
`, options)
    expect(result.partialCount).toBe(1)
    expect(result.proxies[0]).toEqual(expect.objectContaining({ security: 'none', tls: expect.objectContaining({ enabled: false, reality: expect.any(Object) }) }))
    expect(result.issues.map((issue) => issue.code)).toContain('PROXY_VLESS_REALITY_SECURITY_CONFLICT')
  })

  it.each([
    ['encryption', 'encryption=none&encryption=legacy'],
    ['ALPN', 'alpn=h2&alpn=http%2F1.1'],
    ['fingerprint', 'fp=chrome&client-fingerprint=firefox'],
    ['XHTTP mode', 'type=xhttp&mode=auto&mode=stream-up'],
  ])('fails closed for conflicting duplicate VLESS %s', (_field, query) => {
    const result = parseSubscription(`vless://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@vless.example.com:443?security=tls&${query}#Duplicate`, options)
    expect(result.partialCount).toBe(1)
    expect(result.issues.map((issue) => issue.code)).toContain('PROXY_PARAMS_CONFLICT')
  })

  it('normalizes equivalent duplicate critical values deterministically without making the endpoint Partial', () => {
    const input = 'vless://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@vless.example.com:443?security=tls&alpn=h2&alpn=h2#Same'
    const first = parseSubscription(input, options)
    const second = parseSubscription(input, options)
    expect([first.readyCount, first.partialCount]).toEqual([1, 0])
    expect(first.issues.map((issue) => issue.code)).toContain('DUPLICATE_QUERY_PARAM')
    expect(first.proxies).toEqual(second.proxies)
  })

  it.each([
    ['unknown TLS', { tls: 'future' }, 'PROXY_VMESS_TLS_UNSUPPORTED'],
    ['invalid aid', { aid: 'not-a-number' }, 'PROXY_VMESS_ALTER_ID_INVALID'],
    ['unsupported TCP header', { net: 'tcp', type: 'http' }, 'PROXY_VMESS_TCP_HEADER_UNSUPPORTED'],
  ])('fails closed for VMess %s', (_name, overrides, code) => {
    const result = parseSubscription(vmessLink(overrides), options)
    expect(result.partialCount).toBe(1)
    expect(result.issues.map((issue) => issue.code)).toContain(code)
  })

  it('preserves VMess client fingerprint with TLS and rejects it without TLS', () => {
    const secure = parseSubscription(vmessLink({ tls: 'tls', fp: 'chrome' }), options)
    expect(secure.readyCount).toBe(1)
    expect(secure.proxies[0]).toEqual(expect.objectContaining({ tls: expect.objectContaining({ enabled: true, fingerprint: 'chrome' }) }))

    const plaintext = parseSubscription(vmessLink({ tls: '', fp: 'chrome' }), options)
    expect(plaintext.partialCount).toBe(1)
    expect(plaintext.issues.map((issue) => issue.code)).toContain('PROXY_TLS_DISABLED_WITH_SECURITY_FIELDS')
  })

  it.each([
    ['Trojan', '{ name: Trojan TLS Off, type: trojan, server: trojan.example.com, port: 443, password: demo, tls: false }'],
    ['Hysteria2', '{ name: HY2 TLS Off, type: hysteria2, server: hy2.example.com, port: 443, password: demo, tls: false }'],
    ['TUIC', '{ name: TUIC TLS Off, type: tuic, server: tuic.example.com, port: 443, uuid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, password: demo, tls: false }'],
  ])('fails closed when Clash %s explicitly disables required TLS', (_protocol, proxy) => {
    const result = parseSubscription(`proxies:\n  - ${proxy}\n`, options)
    expect(result.partialCount).toBe(1)
    expect(result.issues.map((issue) => issue.code)).toContain('PROXY_TLS_REQUIRED')
  })

  it.each([
    ['HTTP SNI', '{ name: HTTP SNI, type: http, server: http.example.com, port: 8080, tls: false, sni: secure.example.com }'],
    ['VMess fingerprint', '{ name: VMess FP, type: vmess, server: vmess.example.com, port: 443, uuid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, tls: false, client-fingerprint: chrome }'],
  ])('fails closed for Clash TLS-only dependency without TLS: %s', (_name, proxy) => {
    const result = parseSubscription(`proxies:\n  - ${proxy}\n`, options)
    expect(result.partialCount).toBe(1)
    expect(result.issues.map((issue) => issue.code)).toContain('PROXY_TLS_DISABLED_WITH_SECURITY_FIELDS')
  })

  it.each([
    ['encryption:none', '{ name: Encryption None, type: vless, server: vless.example.com, port: 443, uuid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, encryption: none }'],
    ['flow:none', '{ name: Flow None, type: vless, server: vless.example.com, port: 443, uuid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, flow: none }'],
    ['disable-sni:false', '{ name: Disable SNI False, type: tuic, server: tuic.example.com, port: 443, uuid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, password: demo, disable-sni: false }'],
  ])('keeps canonical Clash no-op %s Ready', (_name, proxy) => {
    const result = parseSubscription(`proxies:\n  - ${proxy}\n`, options)
    expect([result.readyCount, result.partialCount]).toEqual([1, 0])
  })

  it('strictly distinguishes absent, valid, and invalid Hysteria2 bandwidth', () => {
    const invalidShare = parseSubscription('hysteria2://demo@hy2.example.com:443/?up=15garbage#InvalidShare', options)
    const invalidClash = parseSubscription('proxies:\n  - { name: Invalid Clash, type: hysteria2, server: hy2.example.com, port: 443, password: demo, up: 15garbage }\n', options)
    const valid = parseSubscription('hysteria2://demo@hy2.example.com:443/?up=15&down=30#Valid', options)
    for (const result of [invalidShare, invalidClash]) {
      expect(result.partialCount).toBe(1)
      expect(result.issues.map((issue) => issue.code)).toContain('PROXY_HYSTERIA2_BANDWIDTH_INVALID')
      expect(result.proxies[0]).not.toHaveProperty('upMbps')
    }
    expect(valid.readyCount).toBe(1)
    expect(valid.proxies[0]).toEqual(expect.objectContaining({ upMbps: 15, downMbps: 30 }))
  })

  it('enforces payload and node-count limits', () => {
    expect(parseSubscription('x'.repeat(101), { ...options, maxBytes: 100 }).issues[0].code).toBe('SUBSCRIPTION_TOO_LARGE')
    expect(parseSubscription(`${plainLinks}\n${plainLinks}`, { ...options, maxNodes: 6 }).issues[0].code).toBe('SUBSCRIPTION_TOO_LARGE')
  })

  it('returns stable opaque IDs across 100 parses', () => {
    const baseline = parseSubscription(plainLinks, options).nodes.map((node) => node.id)
    for (let index = 0; index < 100; index += 1) expect(parseSubscription(plainLinks, options).nodes.map((node) => node.id)).toEqual(baseline)
    expect(baseline.join(' ')).not.toContain('11111111-1111')
    expect(baseline.join(' ')).not.toContain('demo-pass')
  })

  it('redacts secrets and subscription query tokens', () => {
    expect(redactSecret('abc123')).toBe('***')
    expect(redactSubscriptionUrl('https://example.com/sub?token=abc123&mode=full')).toBe('https://example.com/sub?token=***&mode=full')
  })
})

function vmessLink(overrides: Record<string, unknown>) {
  return `vmess://${encodeBase64Text(JSON.stringify({
    v: '2', ps: 'VMess Semantic', add: 'vmess.example.com', port: '443',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', aid: '0', scy: 'auto', net: 'tcp',
    ...overrides,
  }))}`
}
