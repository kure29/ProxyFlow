import { describe, expect, it } from 'vitest'
import { isSurgeGeneralEntry, type SurgeProfile } from './model'
import { serializeSurgeProfile } from './serializer'

function profile(general: unknown): SurgeProfile {
  return { general: general as SurgeProfile['general'], proxies: [], proxyGroups: [], rules: [] }
}

function serialize(general: unknown) {
  return serializeSurgeProfile(profile(general))
}

describe('Surge General runtime boundary', () => {
  it('accepts the current exact scalar and list entry shapes', () => {
    expect(isSurgeGeneralEntry({ key: 'proxy-test-url', value: 'https://example.com/ping' })).toBe(true)
    expect(isSurgeGeneralEntry({ key: 'dns-server', value: { kind: 'list', items: ['system', '1.1.1.1'] } })).toBe(true)
    expect(isSurgeGeneralEntry({ key: 'encrypted-dns-server', value: { kind: 'list', items: ['https://dns.example/dns-query'] } })).toBe(true)
    expect(isSurgeGeneralEntry({ key: 'PROXY-TEST-URL', value: 'https://example.com/ping' })).toBe(true)
  })

  it.each([
    ['null entry', null],
    ['primitive entry', 'proxy-test-url'],
    ['missing key', { value: 'https://example.com/ping' }],
    ['missing value', { key: 'proxy-test-url' }],
    ['unknown key', { key: 'future-key', value: 'value' }],
    ['extra field', { key: 'proxy-test-url', value: 'https://example.com/ping', futureSemantic: true }],
    ['symbol field', Object.assign({ key: 'proxy-test-url', value: 'https://example.com/ping' }, { [Symbol('future')]: true })],
    ['inherited field', Object.assign(Object.create({ futureSemantic: true }), { key: 'proxy-test-url', value: 'https://example.com/ping' })],
  ])('rejects %s', (_label, entry) => {
    expect(isSurgeGeneralEntry(entry)).toBe(false)
    expect(() => serialize([entry])).toThrow(/Invalid Surge \[General\] entry/)
  })

  it.each([
    ['proxy-test-url number', { key: 'proxy-test-url', value: 42 }],
    ['proxy-test-url object', { key: 'proxy-test-url', value: { url: 'https://example.com' } }],
    ['list value as array', { key: 'dns-server', value: ['system'] }],
    ['list wrapper extra field', { key: 'dns-server', value: { kind: 'list', items: ['system'], futureSemantic: true } }],
    ['empty list', { key: 'dns-server', value: { kind: 'list', items: [] } }],
    ['non-string list member', { key: 'dns-server', value: { kind: 'list', items: ['system', 1] } }],
  ])('rejects %s', (_label, entry) => {
    expect(isSurgeGeneralEntry(entry)).toBe(false)
    expect(() => serialize([entry])).toThrow(/Invalid Surge \[General\] entry/)
  })

  it('rejects malformed General arrays at the serializer boundary', () => {
    expect(() => serialize(null)).toThrow('Surge [General] entries must be an array.')
    expect(() => serialize('not-an-array')).toThrow('Surge [General] entries must be an array.')
  })

  it.each([
    ['NUL', '\u0000'],
    ['C0 control', '\u001f'],
    ['DEL', '\u007f'],
    ['line separator', '\u2028'],
    ['paragraph separator', '\u2029'],
    ['CR', '\r'],
    ['LF', '\n'],
  ])('rejects %s in scalar and list tokens', (_label, character) => {
    expect(isSurgeGeneralEntry({ key: 'proxy-test-url', value: `https://example.com/${character}` })).toBe(false)
    expect(isSurgeGeneralEntry({ key: 'dns-server', value: { kind: 'list', items: [`1.1.1.1${character}`] } })).toBe(false)
    expect(() => serialize([{ key: 'proxy-test-url', value: `https://example.com/${character}` }])).toThrow(/Invalid Surge \[General\] entry/)
    expect(() => serialize([{ key: 'dns-server', value: { kind: 'list', items: [`1.1.1.1${character}`] } }])).toThrow(/Invalid Surge \[General\] entry/)
  })

  it('preserves case-insensitive duplicate-key rejection', () => {
    expect(() => serialize([
      { key: 'proxy-test-url', value: 'https://example.com/ping' },
      { key: 'PROXY-TEST-URL', value: 'https://example.com/ping' },
    ])).toThrow('Duplicate Surge [General] key')
  })

  it('keeps valid General output byte-stable and ordered', () => {
    expect(serialize([
      { key: 'proxy-test-url', value: 'https://example.com/ping' },
      { key: 'dns-server', value: { kind: 'list', items: ['system', '1.1.1.1'] } },
      { key: 'encrypted-dns-server', value: { kind: 'list', items: ['https://dns.example/dns-query'] } },
    ])).toBe('[General]\nproxy-test-url = https://example.com/ping\ndns-server = system, 1.1.1.1\nencrypted-dns-server = https://dns.example/dns-query\n\n[Proxy]\n\n[Proxy Group]\n\n[Rule]\n')
  })
})
