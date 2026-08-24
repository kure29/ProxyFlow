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
        { key: 'username', value: 'foo' },
        { key: 'password', value: 'secret' },
      ],
    }],
    proxyGroups: [{ name: 'Select Strategy', type: 'select', arguments: ['HK Premium', 'DIRECT'] }],
    rules: [
      { type: 'DOMAIN-SUFFIX', payload: 'example.com', policy: 'Select Strategy' },
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
      'HK Premium = http,proxy.example.invalid:8080,username=foo,password=secret',
      '',
      '[Proxy Group]',
      'Select Strategy = select,HK Premium,DIRECT',
      '',
      '[Rule]',
      'DOMAIN-SUFFIX,example.com,Select Strategy',
      'final,DIRECT',
      '',
    ].join('\n'))
    expect(content).not.toContain('\r')
    expect(content.endsWith('\n')).toBe(true)
    expect(content.endsWith('\n\n')).toBe(false)
  })

  it('accepts only the proven simple token grammar', () => {
    expect(serializeLoonToken('plain')).toBe('plain')
    expect(serializeLoonToken('internal space')).toBe('internal space')
    expect(() => serializeLoonToken('HK, Premium')).toThrow(/simple token grammar|delimiters/)
    expect(() => serializeLoonToken('foo=bar')).toThrow(/simple token grammar|delimiters/)
    expect(() => serializeLoonToken('a"b')).toThrow(/simple token grammar|delimiters/)
    expect(() => serializeLoonToken('a\\b')).toThrow(/simple token grammar|delimiters/)
    expect(() => serializeLoonToken('东京')).toThrow(/ASCII|simple token grammar/)
    expect(() => serializeLoonToken('')).toThrow(/non-empty|simple token grammar/)
    expect(serializeLoonPolicyEntry({
      name: 'Policy', type: 'select', arguments: ['Simple', 'DIRECT'],
    })).toBe('Policy = select,Simple,DIRECT')
    expect(() => serializeLoonPolicyEntry({
      name: 'Policy', type: 'select', arguments: ['HK, Premium', 'DIRECT'],
    })).toThrow()
    expect(() => serializeLoonRule({
      type: 'DOMAIN-KEYWORD', payload: 'foo=bar', policy: 'Policy',
    })).toThrow()
  })

  it.each(['HK, Premium', 'foo=bar', 'quote"name', 'back\\slash', ' leading', 'trailing ', 'line\nfeed'])(
    'rejects unsafe left-hand policy name %j',
    (name) => expect(() => serializeLoonPolicyEntry({ name, type: 'select', arguments: ['DIRECT'] })).toThrow(/policy names/),
  )

  it.each(['line\nfeed', 'carriage\rreturn', 'nul\u0000byte', 'tab\tvalue', 'separator\u2028value', '东京']) (
    'rejects unsafe token %j',
    (unsafe) => expect(() => serializeLoonToken(unsafe)).toThrow(/tokens|ASCII|control|line-separator/),
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
