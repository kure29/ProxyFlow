import { describe, expect, it } from 'vitest'
import { parseCidr, parseCidrAuthoring } from './cidr'

describe('shared CIDR parser', () => {
  it('canonicalizes authored host bits and IPv6 spelling', () => {
    expect(parseCidrAuthoring('192.0.2.123/24')).toMatchObject({ ok: true, cidr: { value: '192.0.2.0/24', family: 'ipv4' } })
    expect(parseCidrAuthoring('2001:db8::1234/32')).toMatchObject({ ok: true, cidr: { value: '2001:db8::/32', family: 'ipv6' } })
    expect(parseCidrAuthoring('2001:0DB8::/32')).toMatchObject({ ok: true, cidr: { value: '2001:db8::/32' } })
    expect(parseCidrAuthoring('192.0.2.1/32')).toMatchObject({ ok: true, cidr: { value: '192.0.2.1/32' } })
  })

  it('requires strict canonical persisted spelling', () => {
    for (const value of ['192.0.2.123/24', '2001:0DB8::/32', '2001:db8:0:0::/32', '10.0.0.0/024']) {
      expect(parseCidr(value, 'strict').ok).toBe(false)
    }
    expect(parseCidr('192.0.2.0/24', 'strict').ok).toBe(true)
    expect(parseCidr('2001:db8::/32', 'strict').ok).toBe(true)
  })

  it('rejects unsafe, mapped, and non-CIDR forms', () => {
    for (const value of [
      '192.0.2.1', '2001:db8::1', '192.168.1.*', 'example.com', '1.2.3.4:443',
      '[2001:db8::1]/64', '10.0.0.0/33', '2001:db8::/129', '01.02.03.04/24',
      '::ffff:192.0.2.0/120', '::ffff:c000:0200/120', 'fe80::1%en0/64', '10.0.0.0/8,foo',
      '10.0.0.0 /8', '10.0.0.0/8\n203.0.113.0/24',
    ]) expect(parseCidrAuthoring(value).ok).toBe(false)
  })
})
