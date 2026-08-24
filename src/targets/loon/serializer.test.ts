import { describe, expect, it } from 'vitest'
import type { LoonProfile } from './model'
import {
  serializeLoonPolicyEntry,
  serializeLoonProfile,
  serializeLoonRule,
  serializeLoonToken,
} from './serializer'

function representativeProfile(): LoonProfile {
  return {
    general: [{ key: 'dns-server', value: { kind: 'list', items: ['system', '192.0.2.53'] } }],
    proxies: [{
      name: 'HK Premium', type: 'http', arguments: ['proxy.example.invalid:8080'],
      parameters: [
        { key: 'username', value: 'foo=bar' },
        { key: 'password', value: 'quote" and \\' },
      ],
    }],
    proxyGroups: [{ name: '选择策略', type: 'select', arguments: ['HK Premium', 'DIRECT'] }],
    rules: [
      { type: 'DOMAIN-SUFFIX', payload: 'example.com', policy: '选择策略' },
      { type: 'FINAL', policy: 'DIRECT' },
    ],
  }
}

describe('Loon serializer', () => {
  it('serializes the four typed sections with LF and exactly one trailing newline', () => {
    const content = serializeLoonProfile(representativeProfile())
    expect(content).toBe([
      '[General]',
      'dns-server = system,192.0.2.53',
      '',
      '[Proxy]',
      'HK Premium = http,proxy.example.invalid:8080,username="foo=bar",password="quote\\" and \\\\"',
      '',
      '[Proxy Group]',
      '选择策略 = select,HK Premium,DIRECT',
      '',
      '[Rule]',
      'DOMAIN-SUFFIX,example.com,选择策略',
      'FINAL,DIRECT',
      '',
    ].join('\n'))
    expect(content).not.toContain('\r')
    expect(content.endsWith('\n')).toBe(true)
    expect(content.endsWith('\n\n')).toBe(false)
  })

  it('uses one escaping contract for commas, equals, quotes, backslashes and Unicode', () => {
    expect(serializeLoonToken('plain')).toBe('plain')
    expect(serializeLoonToken('HK, Premium')).toBe('"HK, Premium"')
    expect(serializeLoonToken('foo=bar')).toBe('"foo=bar"')
    expect(serializeLoonToken('a"b')).toBe('"a\\"b"')
    expect(serializeLoonToken('a\\b')).toBe('"a\\\\b"')
    expect(serializeLoonToken('东京')).toBe('东京')
    expect(serializeLoonToken('')).toBe('""')
    expect(serializeLoonPolicyEntry({
      name: 'Policy', type: 'select', arguments: ['HK, Premium', '东京'],
    })).toBe('Policy = select,"HK, Premium",东京')
    expect(serializeLoonRule({
      type: 'DOMAIN-KEYWORD', payload: 'foo=bar', policy: 'HK, Premium',
    })).toBe('DOMAIN-KEYWORD,"foo=bar","HK, Premium"')
  })

  it.each(['HK, Premium', 'foo=bar', 'quote"name', 'back\\slash', ' leading', 'trailing ', 'line\nfeed'])(
    'rejects unsafe left-hand policy name %j',
    (name) => expect(() => serializeLoonPolicyEntry({ name, type: 'select', arguments: ['DIRECT'] })).toThrow(/policy names/),
  )

  it.each(['line\nfeed', 'carriage\rreturn', 'nul\u0000byte', 'tab\tvalue', 'separator\u2028value'])(
    'rejects unsafe token %j',
    (unsafe) => expect(() => serializeLoonToken(unsafe)).toThrow(/control|line-separator/),
  )

  it('rejects unsafe text no matter which section would consume it', () => {
    expect(() => serializeLoonPolicyEntry({
      name: 'bad\nname', type: 'http', arguments: ['proxy.example.invalid:8080'],
    })).toThrow(/policy names/)
    expect(() => serializeLoonPolicyEntry({
      name: 'Proxy', type: 'http', arguments: ['bad\u0000argument'],
    })).toThrow()
    expect(() => serializeLoonPolicyEntry({
      name: 'Proxy', type: 'http', arguments: [], parameters: [{ key: 'password', value: 'bad\nvalue' }],
    })).toThrow()
    expect(() => serializeLoonRule({ type: 'DOMAIN', payload: 'bad\n.example', policy: 'DIRECT' })).toThrow()

    const profile = representativeProfile()
    profile.general[0].value.items[0] = 'bad\u0000resolver'
    expect(() => serializeLoonProfile(profile)).toThrow()
  })

  it('rejects ambiguous General entries and non-finite numbers', () => {
    const duplicate = representativeProfile()
    duplicate.general.push({ key: 'dns-server', value: { kind: 'list', items: ['192.0.2.54'] } })
    expect(() => serializeLoonProfile(duplicate)).toThrow(/Duplicate Loon/)

    const empty = representativeProfile()
    empty.general = [{ key: 'doh-server', value: { kind: 'list', items: [] } }]
    expect(() => serializeLoonProfile(empty)).toThrow(/must not be empty/)
    expect(() => serializeLoonToken(Number.NaN)).toThrow(/finite/)
  })

  it('is byte-identical across repeated serialization', () => {
    const profile = representativeProfile()
    const baseline = serializeLoonProfile(profile)
    for (let index = 0; index < 100; index += 1) expect(serializeLoonProfile(profile)).toBe(baseline)
  })
})
