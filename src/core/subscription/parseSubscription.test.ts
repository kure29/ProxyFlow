import { describe, expect, it } from 'vitest'
import plainLinks from '../../../fixtures/subscriptions/plain-links.txt?raw'
import base64Subscription from '../../../fixtures/subscriptions/base64-subscription.txt?raw'
import clashYaml from '../../../fixtures/subscriptions/clash-proxies.yaml?raw'
import malformed from '../../../fixtures/subscriptions/malformed.txt?raw'
import mixed from '../../../fixtures/subscriptions/mixed-valid-invalid.txt?raw'
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
    expect(result.readyCount).toBe(1)
    expect(result.unsupportedCount).toBe(3)
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['PROXY_PROTOCOL_UNSUPPORTED', 'PROXY_LINK_UNRECOGNIZED', 'PROXY_LINK_MALFORMED']))
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

  it('handles fuzz-like input without throwing', () => {
    const cases = [
      '', '\r\n\r\n', malformed, '%%%%', 'vmess://@@@', 'vless://%E0%A4%A@example.com:443',
      `# 注释\n${' '.repeat(10_000)}\nss://broken`,
      'trojan://pass@example.com:443?sni=a&sni=b#重复参数',
    ]
    for (const input of cases) expect(() => parseSubscription(input, options)).not.toThrow()
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
