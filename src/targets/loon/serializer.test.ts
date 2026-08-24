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
        { key: 'password', value: { kind: 'quoted', value: 'secret' } },
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
      'HK Premium = http,proxy.example.invalid:8080,username=foo,password="secret"',
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

  it('serializes a fixed quoted literal verbatim without inventing escapes', () => {
    expect(serializeLoonToken({ kind: 'quoted', value: 'password' })).toBe('"password"')
    expect(serializeLoonToken({ kind: 'quoted', value: 'fixture-key==:fixture-user==' })).toBe('"fixture-key==:fixture-user=="')
    expect(serializeLoonToken({ kind: 'quoted', value: 'user,name', grammar: 'http-username' })).toBe('"user,name"')
    expect(serializeLoonPolicyEntry({
      name: 'HTTP Auth', type: 'http', arguments: ['example.com', 80, 'user', { kind: 'quoted', value: 'password' }],
    })).toBe('HTTP Auth = http,example.com,80,user,"password"')
  })

  it.each([
    '',
    ' leading',
    'trailing ',
    'bad"quote',
    'back\\slash',
    'comma,value',
    'a,b',
    '#comment',
    ';comment',
    '//comment',
    'value #comment',
    'line\nfeed',
    'carriage\rreturn',
    'nul\u0000byte',
    'tab\tvalue',
    '东京',
  ])('rejects unsafe fixed quoted literal value %j', (value) => {
    expect(() => serializeLoonToken({ kind: 'quoted', value })).toThrow(/quoted literals/)
  })

  it('does not generalize comma support beyond the explicitly tagged HTTP username grammar', () => {
    expect(() => serializeLoonToken({ kind: 'quoted', value: 'password,with,commas' })).toThrow(/quoted literals/)
    expect(() => serializeLoonToken({ kind: 'quoted', value: 'user,name', grammar: 'http-username' })).not.toThrow()
  })

  it.each(['HK, Premium', 'foo=bar', 'quote"name', 'back\\slash', ' leading', 'trailing ', 'line\nfeed'])(
    'rejects unsafe left-hand policy name %j',
    (name) => expect(() => serializeLoonPolicyEntry({ name, type: 'select', arguments: ['DIRECT'] })).toThrow(/policy names/),
  )

  it.each(['control\u0001name', 'c1\u0085name', 'line\u2028name', 'paragraph\u2029name'])(
    'rejects control or invalid-Unicode policy name %j',
    (name) => expect(() => serializeLoonPolicyEntry({ name, type: 'select', arguments: ['DIRECT'] })).toThrow(/policy names/),
  )

  it('rejects an unpaired UTF-16 surrogate in a policy name', () => {
    const name = `lone-surrogate${String.fromCharCode(0xd800)}`
    expect(() => serializeLoonPolicyEntry({ name, type: 'select', arguments: ['DIRECT'] })).toThrow(/policy names/)
  })

  it('preserves syntax-safe Unicode policy names and their group/rule references verbatim', () => {
    const profile: LoonProfile = {
      general: [],
      proxies: [{ name: '香港01', type: 'http', arguments: ['proxy.example.invalid', 8080] }],
      proxyGroups: [{ name: '🇭🇰 香港 01', type: 'select', arguments: ['香港01', 'DIRECT'] }],
      rules: [{ type: 'DOMAIN', payload: 'example.invalid', policy: '🇭🇰 香港 01' }, { type: 'FINAL', policy: '香港01' }],
    }
    expect(serializeLoonProfile(profile)).toBe([
      '[General]',
      '',
      '[Proxy]',
      '香港01 = http,proxy.example.invalid,8080',
      '',
      '[Proxy Group]',
      '🇭🇰 香港 01 = select,香港01,DIRECT',
      '',
      '[Rule]',
      'DOMAIN,example.invalid,🇭🇰 香港 01',
      'final,香港01',
      '',
    ].join('\n'))
  })

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
