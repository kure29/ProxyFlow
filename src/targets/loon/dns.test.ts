import { describe, expect, it } from 'vitest'
import type { DnsIR, DnsResolverIR } from '../../core/ir'
import { planLoonDns } from './dns'
import { serializeLoonProfile } from './serializer'

function custom(resolvers: DnsResolverIR[]): DnsIR {
  return { enabled: true, mode: 'custom', resolvers }
}

function line(dns: DnsIR | undefined) {
  const plan = planLoonDns(dns)
  expect(plan.issues).toEqual([])
  const content = serializeLoonProfile({ general: plan.general, proxies: [], proxyGroups: [], rules: [], remoteRules: [] })
  return content.split('\n').find((value) => /^(?:dns-server|doh-server)\s*=/.test(value))
}

function failure(dns: DnsIR, code: string, entityId?: string) {
  const plan = planLoonDns(dns)
  expect(plan.general).toEqual([])
  expect(plan.issues).toContainEqual(expect.objectContaining({
    target: 'loon', code, severity: 'error', ...(entityId ? { entityId } : {}),
  }))
  return plan
}

describe('Loon DNS proven subset', () => {
  it.each([
    ['undefined', undefined],
    ['disabled', { enabled: false, mode: 'custom' as const, resolvers: [{ id: 'ignored', kind: 'dot' as const, address: 'tls://dns.example' }] }],
    ['automatic', { enabled: true, mode: 'automatic' as const, resolvers: [{ id: 'ignored', kind: 'dot' as const, address: 'tls://dns.example' }] }],
  ])('omits explicit DNS for %s configuration', (_label, dns) => {
    expect(planLoonDns(dns)).toEqual({ general: [], issues: [] })
    expect(line(dns)).toBeUndefined()
  })

  it('lowers System and IPv4 UDP resolvers to dns-server in declared order', () => {
    expect(line(custom([
      { id: 'system', kind: 'system' },
      { id: 'documentation', kind: 'udp', address: ' 192.0.2.53 ' },
    ]))).toBe('dns-server = system,192.0.2.53')
    expect(line(custom([{ id: 'blank-system', kind: 'system', address: '   ' }]))).toBe('dns-server = system')
  })

  it('lowers a pure DoH default set to doh-server in declared order', () => {
    expect(line(custom([
      { id: 'one', kind: 'doh', address: 'https://192.0.2.53/dns-query' },
      { id: 'two', kind: 'doh', address: 'https://dns.example.invalid/dns-query' },
    ]))).toBe('doh-server = https://192.0.2.53/dns-query,https://dns.example.invalid/dns-query')
  })

  it('is deterministic without mutating resolver order', () => {
    const dns = custom([
      { id: 'first', kind: 'doh', address: 'https://first.example.invalid/dns-query' },
      { id: 'second', kind: 'doh', address: 'https://second.example.invalid/dns-query' },
    ])
    const baseline = planLoonDns(dns)
    for (let index = 0; index < 100; index += 1) expect(planLoonDns(dns)).toEqual(baseline)
    expect(dns.resolvers?.map((resolver) => resolver.id)).toEqual(['first', 'second'])
  })
})

describe('Loon DNS fail-closed boundaries', () => {
  it('blocks DoT instead of mapping it to another encrypted transport', () => {
    failure(custom([{ id: 'dot', kind: 'dot', address: 'tls://dns.example.invalid' }]), 'LOON_DNS_DOT_UNSUPPORTED', 'dot')
  })

  it('blocks Direct and Fallback resolver roles', () => {
    failure(custom([{ id: 'direct', kind: 'udp', role: 'direct', address: '192.0.2.53' }]), 'LOON_DNS_DIRECT_RESOLVER_UNSUPPORTED', 'direct')
    failure(custom([{ id: 'fallback', kind: 'doh', role: 'fallback', address: 'https://dns.example.invalid/dns-query' }]), 'LOON_DNS_FALLBACK_RESOLVER_UNSUPPORTED', 'fallback')
  })

  it('blocks every traditional/DoH mixture as one all-or-nothing plan', () => {
    failure(custom([
      { id: 'system', kind: 'system' },
      { id: 'doh', kind: 'doh', address: 'https://dns.example.invalid/dns-query' },
    ]), 'LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED', 'dns')
    failure(custom([
      { id: 'udp', kind: 'udp', address: '192.0.2.53' },
      { id: 'doh', kind: 'doh', address: 'https://dns.example.invalid/dns-query' },
    ]), 'LOON_DNS_MIXED_SEMANTICS_UNSUPPORTED', 'dns')
  })

  it('blocks custom DNS without a resolver and duplicate identities', () => {
    failure(custom([]), 'LOON_DNS_CUSTOM_EMPTY', 'dns')
    failure(custom([
      { id: 'one', kind: 'udp', address: '192.0.2.53' },
      { id: 'two', kind: 'udp', address: '192.0.2.53' },
    ]), 'LOON_DNS_RESOLVER_DUPLICATE', 'two')
    failure(custom([
      { id: 'same', kind: 'udp', address: '192.0.2.53' },
      { id: 'same', kind: 'udp', address: '192.0.2.54' },
    ]), 'LOON_DNS_RESOLVER_ID_DUPLICATE', 'same')
  })

  it.each([
    ['invalid System address', { id: 'system', kind: 'system', address: '192.0.2.53' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['missing UDP address', { id: 'udp', kind: 'udp' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['UDP hostname', { id: 'udp-host', kind: 'udp', address: 'dns.example.invalid' }, 'LOON_DNS_UDP_HOSTNAME_UNSUPPORTED'],
    ['UDP explicit port', { id: 'udp-port', kind: 'udp', address: '192.0.2.53:5353' }, 'LOON_DNS_UDP_PORT_UNPROVEN'],
    ['IPv6 UDP', { id: 'udp-v6', kind: 'udp', address: '2001:db8::53' }, 'LOON_DNS_IPV6_UDP_UNPROVEN'],
    ['invalid IPv4', { id: 'bad-ip', kind: 'udp', address: '999.0.2.53' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH scheme mismatch', { id: 'doh-http', kind: 'doh', address: 'http://dns.example.invalid/dns-query' }, 'LOON_DNS_RESOLVER_SCHEME_MISMATCH'],
    ['malformed DoH', { id: 'doh-bad', kind: 'doh', address: 'https://[invalid' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH credentials', { id: 'doh-user', kind: 'doh', address: 'https://user@dns.example.invalid/dns-query' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH fragment', { id: 'doh-fragment', kind: 'doh', address: 'https://dns.example.invalid/dns-query#fragment' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH raw space', { id: 'doh-space', kind: 'doh', address: 'https://dns.example.invalid/dns query' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['newline injection', { id: 'newline', kind: 'udp', address: '192.0.2.53\ndoh-server=https://evil.invalid' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['NUL injection', { id: 'nul', kind: 'doh', address: 'https://dns.example.invalid/\u0000dns-query' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['comma injection', { id: 'comma', kind: 'udp', address: '192.0.2.53,system' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
    ['backslash injection', { id: 'slash', kind: 'doh', address: 'https://dns.example.invalid/\\dns-query' }, 'LOON_DNS_RESOLVER_ADDRESS_INVALID'],
  ] satisfies Array<[string, DnsResolverIR, string]>)('blocks %s', (_label, resolver, code) => {
    failure(custom([resolver]), code, resolver.id)
  })

  it('does not emit a valid resolver when any active resolver is unsafe', () => {
    const plan = failure(custom([
      { id: 'valid', kind: 'udp', address: '192.0.2.53' },
      { id: 'unsafe', kind: 'udp', address: '192.0.2.54\ninvalid' },
    ]), 'LOON_DNS_RESOLVER_ADDRESS_INVALID', 'unsafe')
    expect(plan.general).toEqual([])
  })
})
