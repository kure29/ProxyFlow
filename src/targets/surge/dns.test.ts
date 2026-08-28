import { describe, expect, it } from 'vitest'
import dnsDohProfile from '../../../fixtures/surge/dns-doh.conf?raw'
import dnsDotProfile from '../../../fixtures/surge/dns-dot.conf?raw'
import dnsE2eProfile from '../../../fixtures/surge/dns-e2e.conf?raw'
import dnsHealthProfile from '../../../fixtures/surge/dns-health.conf?raw'
import dnsSystemProfile from '../../../fixtures/surge/dns-system.conf?raw'
import dnsUdpProfile from '../../../fixtures/surge/dns-udp.conf?raw'
import { openAiRouteFixture, subscriptionFilterAutoFixture } from '../../core/__fixtures__/graphFixtures'
import { subscriptionSnapshotFixture } from '../../core/__fixtures__/subscriptionFixtures'
import { compileGraph } from '../../core/graphCompiler'
import { PROXYFLOW_IR_VERSION, type DnsResolverIR, type ProxyFlowIR } from '../../core/ir'
import { parseSubscription } from '../../core/subscription'
import type { CompatibilityIssue, GraphEdge, GraphNode } from '../../types/project'
import { compileSurge } from './compiler'
import { composeSurgeGeneral } from './general'
import type { SurgeGeneralEntry } from './model'
import { serializeSurgeProfile } from './serializer'

const fixedNow = () => new Date('2026-08-23T00:00:00.000Z')

function baseIR(): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'surge-dns', projectName: 'Surge DNS', projectSchemaVersion: 2 },
    sources: [{
      kind: 'manual-proxy', id: 'source', name: 'Source',
      proxies: [{ kind: 'http', protocol: 'http', id: 'proxy-a', name: 'Proxy A', server: 'proxy.example.com', port: 8080 }],
    }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'manual', name: 'Proxy', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [{
      id: 'example', name: 'Example', matcher: { kind: 'domain-suffix', value: 'example.com' },
      target: { kind: 'strategy', id: 'manual' }, priority: 10,
    }],
    finalRoute: { target: { kind: 'strategy', id: 'manual' } },
    outputs: [{ id: 'output', name: 'Surge', target: 'surge', enabled: true }],
  }
}

function withDns(resolvers: DnsResolverIR[]) {
  const ir = baseIR()
  ir.dns = { enabled: true, mode: 'custom', resolvers }
  return ir
}

function success(ir: ProxyFlowIR) {
  const result = compileSurge(ir, { now: fixedNow })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  return result
}

function failure(ir: ProxyFlowIR, code: string, entityId?: string) {
  const result = compileSurge(ir, { now: fixedNow })
  expect(result.success).toBe(false)
  expect(result.content).toBe('')
  expect(result.issues).toContainEqual(expect.objectContaining({
    code, target: 'surge', severity: 'error', ...(entityId ? { entityId } : {}),
  }))
  return result
}

describe('Surge DNS independent fixtures', () => {
  it('lowers the canonical System sentinel', () => {
    expect(success(withDns([{ id: 'system', kind: 'system', role: 'default', address: 'system' }])).content)
      .toBe(dnsSystemProfile)
  })

  it('lowers ordered IPv4 UDP endpoints including a custom port', () => {
    expect(success(withDns([
      { id: 'cloudflare', kind: 'udp', role: 'default', address: '1.1.1.1' },
      { id: 'documentation', kind: 'udp', role: 'default', address: '192.0.2.53:5353' },
    ])).content).toBe(dnsUdpProfile)
  })

  it('lowers multiple DoH endpoints as an unquoted General list', () => {
    expect(success(withDns([
      { id: 'cloudflare', kind: 'doh', role: 'default', address: 'https://1.1.1.1/dns-query' },
      { id: 'google', kind: 'doh', role: 'default', address: 'https://dns.google/dns-query' },
    ])).content).toBe(dnsDohProfile)
  })

  it('lowers multiple DoT endpoints and preserves an explicit port', () => {
    expect(success(withDns([
      { id: 'cloudflare', kind: 'dot', role: 'default', address: 'tls://1.1.1.1' },
      { id: 'google', kind: 'dot', role: 'default', address: 'tls://dns.google:8853' },
    ])).content).toBe(dnsDotProfile)
  })

  it('composes proxy-test-url before DNS with no duplicate General key', () => {
    const ir = withDns([{ id: 'cloudflare', kind: 'doh', address: 'https://1.1.1.1/dns-query' }])
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://www.gstatic.com/generate_204', intervalSeconds: 120 },
    }]
    ir.routes = []
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    const content = success(ir).content
    expect(content).toBe(dnsHealthProfile)
    expect(content.match(/^\[General\]$/gm)).toHaveLength(1)
    expect(success(ir).content).toBe(content)
  })
})

describe('Surge DNS omission and exact encrypted subset', () => {
  it.each([
    ['undefined DNS', undefined],
    ['disabled DNS', { enabled: false, mode: 'custom' as const, resolvers: [{ id: 'bad', kind: 'udp' as const, address: 'not-an-ip' }] }],
    ['automatic DNS', { enabled: true, mode: 'automatic' as const, resolvers: [{ id: 'ignored', kind: 'udp' as const, address: 'not-an-ip' }] }],
  ])('emits no DNS keys for %s', (_label, dns) => {
    const ir = baseIR()
    ir.dns = dns
    const general = section(success(ir).content, 'General')
    expect(general).not.toContainEqual(expect.stringMatching(/^(?:dns-server|encrypted-dns-server)\s*=/i))
  })

  it('accepts absent/blank System address and an undefined role as Default', () => {
    expect(section(success(withDns([{ id: 'system', kind: 'system' }])).content, 'General')).toEqual(['dns-server = system'])
    expect(section(success(withDns([{ id: 'system', kind: 'system', address: '   ' }])).content, 'General')).toEqual(['dns-server = system'])
  })

  it('preserves a mixed System/IPv4 traditional list and normalizes only outer whitespace', () => {
    const ir = withDns([
      { id: 'system', kind: 'system', address: 'system' },
      { id: 'udp', kind: 'udp', address: '  1.1.1.1:5353  ' },
    ])
    const first = success(ir).content
    expect(section(first, 'General')).toEqual(['dns-server = system, 1.1.1.1:5353'])
    expect(success(ir).content).toBe(first)
  })

  it('combines DoH and DoT because Surge queries one heterogeneous encrypted list concurrently', () => {
    const result = success(withDns([
      { id: 'doh', kind: 'doh', address: 'https://dns.example.com/dns-query' },
      { id: 'dot', kind: 'dot', address: 'tls://dns.example.net' },
    ]))
    expect(section(result.content, 'General')).toEqual([
      'encrypted-dns-server = https://dns.example.com/dns-query, tls://dns.example.net',
    ])
    expect(result.content).not.toMatch(/encrypted-dns-(?:follow-outbound-mode|skip-cert-verification)/)
  })

  it('lowers a single DoT resolver', () => {
    expect(section(success(withDns([{
      id: 'dot', kind: 'dot', address: 'tls://dns.example:8853',
    }])).content, 'General')).toEqual(['encrypted-dns-server = tls://dns.example:8853'])
  })

  it('accepts encrypted DNS at an IPv6 literal without enabling full IPv6 hostname behavior', () => {
    const result = success(withDns([{
      id: 'ipv6-doh', kind: 'doh', address: 'https://[2001:db8::53]/dns-query',
    }]))
    expect(section(result.content, 'General')).toEqual([
      'encrypted-dns-server = https://[2001:db8::53]/dns-query',
    ])
    expect(result.content).not.toContain('ipv6 = true')
  })
})

describe('Surge DNS fail-closed diagnostics', () => {
  it('rejects Direct and Fallback role intent independently', () => {
    failure(withDns([{ id: 'direct', kind: 'udp', role: 'direct', address: '1.1.1.1' }]), 'SURGE_DNS_DIRECT_RESOLVER_UNSUPPORTED', 'direct')
    failure(withDns([{ id: 'fallback', kind: 'doh', role: 'fallback', address: 'https://dns.example/dns-query' }]), 'SURGE_DNS_FALLBACK_RESOLVER_UNSUPPORTED', 'fallback')
  })

  it('rejects a supported Default resolver when Direct or Fallback intent is also present', () => {
    failure(withDns([
      { id: 'default', kind: 'udp', role: 'default', address: '1.1.1.1' },
      { id: 'direct', kind: 'udp', role: 'direct', address: '8.8.8.8' },
    ]), 'SURGE_DNS_DIRECT_RESOLVER_UNSUPPORTED', 'direct')
    failure(withDns([
      { id: 'default', kind: 'doh', role: 'default', address: 'https://dns.example/dns-query' },
      { id: 'fallback', kind: 'dot', role: 'fallback', address: 'tls://dns.example' },
    ]), 'SURGE_DNS_FALLBACK_RESOLVER_UNSUPPORTED', 'fallback')
  })

  it('rejects every traditional/encrypted mixture instead of changing resolver roles', () => {
    for (const traditional of [
      { id: 'system', kind: 'system', address: 'system' },
      { id: 'udp', kind: 'udp', address: '1.1.1.1' },
    ] satisfies DnsResolverIR[]) {
      failure(withDns([
        traditional,
        { id: 'doh', kind: 'doh', address: 'https://dns.example/dns-query' },
      ]), 'SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED')
    }

    failure(withDns([
      { id: 'system', kind: 'system', address: 'system' },
      { id: 'dot', kind: 'dot', address: 'tls://dns.example' },
    ]), 'SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED')

    failure(withDns([
      { id: 'udp', kind: 'udp', address: '1.1.1.1' },
      { id: 'doh', kind: 'doh', address: 'https://dns.example/dns-query' },
      { id: 'dot', kind: 'dot', address: 'tls://dns.example' },
    ]), 'SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED')
  })

  it('rejects custom DNS with no resolvers', () => {
    failure(withDns([]), 'SURGE_DNS_CUSTOM_EMPTY', 'dns')
  })

  it.each([
    ['invalid System payload', { id: 'system', kind: 'system', address: '1.1.1.1' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['missing UDP address', { id: 'udp', kind: 'udp' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['UDP hostname', { id: 'udp-host', kind: 'udp', address: 'dns.example.com:53' }, 'SURGE_DNS_UDP_HOSTNAME_UNSUPPORTED'],
    ['invalid IPv4', { id: 'bad-ip', kind: 'udp', address: '999.1.1.1' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['zero UDP port', { id: 'zero-port', kind: 'udp', address: '1.1.1.1:0' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['oversized UDP port', { id: 'large-port', kind: 'udp', address: '1.1.1.1:65536' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['malformed IPv6 brackets', { id: 'bad-brackets', kind: 'udp', address: '[2001:db8::53' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['embedded IPv4 before compression', { id: 'bad-embedded-ipv4', kind: 'udp', address: '192.0.2.1::' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['embedded IPv4 before compressed tail', { id: 'bad-embedded-ipv4-tail', kind: 'udp', address: '192.0.2.1::1' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH scheme mismatch', { id: 'doh-http', kind: 'doh', address: 'http://dns.example/dns-query' }, 'SURGE_DNS_RESOLVER_SCHEME_MISMATCH'],
    ['missing DoH address', { id: 'doh-empty', kind: 'doh', address: '' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['malformed DoH URL', { id: 'doh-malformed', kind: 'doh', address: 'https://[invalid' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['forgiving DoH URL without slashes', { id: 'doh-no-slashes', kind: 'doh', address: 'https:dns.example/dns-query' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['forgiving DoH URL with one slash', { id: 'doh-one-slash', kind: 'doh', address: 'https:/dns.example/dns-query' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['forgiving DoH URL with three slashes', { id: 'doh-three-slashes', kind: 'doh', address: 'https:///dns.example/dns-query' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH credentials', { id: 'doh-user', kind: 'doh', address: 'https://user@dns.example/dns-query' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH empty userinfo', { id: 'doh-empty-user', kind: 'doh', address: 'https://@dns.example/dns-query' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH empty port', { id: 'doh-empty-port', kind: 'doh', address: 'https://dns.example:/dns-query' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH fragment', { id: 'doh-fragment', kind: 'doh', address: 'https://dns.example/dns-query#fragment' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH empty fragment', { id: 'doh-empty-fragment', kind: 'doh', address: 'https://dns.example/dns-query#' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoH zero port', { id: 'doh-zero', kind: 'doh', address: 'https://dns.example:0/dns-query' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoT scheme mismatch', { id: 'dot-https', kind: 'dot', address: 'https://dns.example' }, 'SURGE_DNS_RESOLVER_SCHEME_MISMATCH'],
    ['missing DoT address', { id: 'dot-empty', kind: 'dot', address: '' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['forgiving DoT URL without slashes', { id: 'dot-no-slashes', kind: 'dot', address: 'tls:dns.example' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoT empty userinfo', { id: 'dot-empty-user', kind: 'dot', address: 'tls://@dns.example' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoT empty credential fields', { id: 'dot-empty-credentials', kind: 'dot', address: 'tls://:@dns.example' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoT empty port', { id: 'dot-empty-port', kind: 'dot', address: 'tls://dns.example:' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoT path', { id: 'dot-path', kind: 'dot', address: 'tls://dns.example/dns-query' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoT query', { id: 'dot-query', kind: 'dot', address: 'tls://dns.example?mode=strict' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoT empty query', { id: 'dot-empty-query', kind: 'dot', address: 'tls://dns.example?' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoT empty fragment', { id: 'dot-empty-fragment', kind: 'dot', address: 'tls://dns.example#' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['DoT zero port', { id: 'dot-zero', kind: 'dot', address: 'tls://dns.example:0' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
    ['line injection', { id: 'injection', kind: 'doh', address: 'https://dns.example/dns-query\nFINAL,DIRECT' }, 'SURGE_DNS_RESOLVER_ADDRESS_INVALID'],
  ] satisfies Array<[string, DnsResolverIR, string]>)('rejects $0', (_label, resolver, code) => {
    failure(withDns([resolver]), code, resolver.id)
  })

  it.each([
    ['bare IPv6 UDP', { id: 'ipv6', kind: 'udp', address: '2001:db8::53' }],
    ['IPv6 UDP with port', { id: 'ipv6-port', kind: 'udp', address: '[2001:db8::53]:5353' }],
    ['IPv4-mapped IPv6 UDP', { id: 'ipv6-mapped', kind: 'udp', address: '::ffff:192.0.2.1' }],
  ] satisfies Array<[string, DnsResolverIR]>)('protects the unmodeled Surge ipv6 interaction for $0', (_label, resolver) => {
    const result = failure(withDns([resolver]), 'SURGE_DNS_IPV6_RESOLVER_UNMODELED', resolver.id)
    expect(result.content).not.toContain('ipv6 = true')
  })

  it('rejects duplicate ids, deduplicates identical traditional endpoints, and fails closed for encrypted duplicates', () => {
    failure(withDns([
      { id: 'duplicate', kind: 'udp', address: '1.1.1.1' },
      { id: 'duplicate', kind: 'udp', address: '8.8.8.8' },
    ]), 'SURGE_DNS_RESOLVER_ID_DUPLICATE', 'duplicate')

    expect(section(success(withDns([
      { id: 'first-system', kind: 'system' },
      { id: 'second-system', kind: 'system', address: 'system' },
      { id: 'first-udp', kind: 'udp', address: '1.1.1.1' },
      { id: 'second-udp', kind: 'udp', address: '1.1.1.1:53' },
    ])).content, 'General')).toEqual(['dns-server = system, 1.1.1.1'])

    failure(withDns([
      { id: 'first', kind: 'doh', address: 'https://DNS.EXAMPLE/dns-query' },
      { id: 'second', kind: 'doh', address: 'https://dns.example/dns-query' },
    ]), 'SURGE_DNS_RESOLVER_DUPLICATE', 'second')
  })
})

describe('Surge General internal validation', () => {
  it('detects duplicate keys during composition and in the serializer defense', () => {
    const issues: CompatibilityIssue[] = []
    const differentlyCasedDuplicate = [
      { key: 'DNS-SERVER', value: { kind: 'list', items: ['1.1.1.1'] } },
    ] as unknown as SurgeGeneralEntry[]
    const general = composeSurgeGeneral([
      [{ key: 'dns-server', value: { kind: 'list', items: ['system'] } }],
      differentlyCasedDuplicate,
    ], issues)
    expect(general).toHaveLength(1)
    expect(issues).toContainEqual(expect.objectContaining({ code: 'SURGE_GENERAL_KEY_DUPLICATE', severity: 'error' }))
    expect(() => serializeSurgeProfile({
      general: [
        { key: 'dns-server', value: { kind: 'list', items: ['system'] } },
        ...differentlyCasedDuplicate,
      ] as SurgeGeneralEntry[],
      proxies: [], proxyGroups: [], rules: [],
    })).toThrow('Invalid Surge [General] entry')
    expect(() => serializeSurgeProfile({
      general: [
        { key: 'dns-server', value: { kind: 'list', items: ['system'] } },
        { key: 'dns-server', value: { kind: 'list', items: ['1.1.1.1'] } },
      ],
      proxies: [], proxyGroups: [], rules: [],
    })).toThrow('Duplicate Surge [General] key')
  })
})

describe('Project → IR → Surge DNS E2E', () => {
  it('combines a snapshot, HK Filter, Auto, OpenAI, DNS and FINAL', () => {
    const project = e2eProject()
    const parsed = parseSubscription([
      'http://alice:secret@hk.example.com:8080#HK%20HTTP',
      'http://bob:secret@us.example.com:8081#US%20HTTP',
    ].join('\n'), { sourceId: 'subscription', sourceName: 'subscription' })
    const graph = compileGraph(project, {
      subscriptionSnapshots: {
        subscription: subscriptionSnapshotFixture('subscription', parsed, '2026-08-23T00:00:00.000Z', 'url'),
      },
    })
    expect(graph.success, graph.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(graph.ir?.dns).toEqual(expect.objectContaining({
      enabled: true, mode: 'custom',
      resolvers: [expect.objectContaining({ id: 'cloudflare', kind: 'doh', role: 'default' })],
    }))
    const result = success(graph.ir!)
    expect(result.content).toBe(dnsE2eProfile)
    expect(result.content).not.toContain('US HTTP')
    expect(result.content).not.toContain('policy-path')
  })
})

function section(profile: string, name: 'General' | 'Proxy' | 'Proxy Group' | 'Rule') {
  const lines = profile.split('\n')
  const start = lines.indexOf(`[${name}]`)
  const endOffset = lines.slice(start + 1).findIndex((line) => /^\[[^\]]+\]$/.test(line))
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset
  return lines.slice(start + 1, end).filter(Boolean)
}

function e2eProject() {
  const project = structuredClone(subscriptionFilterAutoFixture)
  const serviceNode = structuredClone(openAiRouteFixture.graph.nodes.find((node) => node.id === 'openai-route')!)
  serviceNode.data.targetId = 'auto'
  serviceNode.data.targetLabel = 'auto'
  project.graph.nodes.push(serviceNode, {
    id: 'dns', type: 'block', position: { x: 960, y: 700 },
    data: {
      blockType: 'dns', category: 'dns', title: 'DNS', subtitle: 'Cloudflare DoH', icon: 'globe-2',
      dnsResolvers: [{
        id: 'cloudflare', name: 'Cloudflare', kind: 'doh', role: 'default',
        address: 'https://1.1.1.1/dns-query', enabled: true,
      }],
    },
  } satisfies GraphNode)
  project.graph.edges.push(...([
    { id: 'e-openai-auto', source: 'openai-route', target: 'auto', type: 'smoothstep', data: { semantic: 'route' } },
    { id: 'e-dns-output', source: 'dns', target: 'output', type: 'smoothstep', data: { semantic: 'dns' } },
  ] satisfies GraphEdge[]))
  const output = project.graph.nodes.find((node) => node.id === 'output')!
  output.data.client = 'surge'
  return project
}
