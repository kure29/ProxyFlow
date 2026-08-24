import { describe, expect, it } from 'vitest'
import type { ProxyFlowIR, RouteIR, RouteTargetIR, TrafficMatcherIR } from '../../core/ir'
import { compileLoonRules, planLoonRouting, type LoonRoutingContext } from './routing'
import { serializeLoonRule } from './serializer'

function route(
  id: string,
  matcher: TrafficMatcherIR,
  target: RouteTargetIR,
  priority: number,
): RouteIR {
  return { id, name: id, matcher, target, priority }
}

function context(
  routes: RouteIR[],
  finalRoute: ProxyFlowIR['finalRoute'] = { target: { kind: 'strategy', id: 'manual' } },
): LoonRoutingContext & { strategyNames: Map<string, string> } {
  return {
    ir: { routes, finalRoute },
    issues: [],
    strategyNames: new Map([['manual', 'Proxy']]),
    compiledStrategyIds: new Set(['manual']),
  }
}

describe('Loon routing', () => {
  it('maps the proven matcher baseline in semantic priority order and keeps FINAL last', () => {
    const input = context([
      route('geo', { kind: 'geo-ip', countryCode: 'US' }, { kind: 'reject' }, 60),
      route('ipv6', { kind: 'ip-cidr6', value: '2001:db8::/32' }, { kind: 'direct' }, 50),
      route('ipv4', { kind: 'ip-cidr', value: '192.0.2.0/24' }, { kind: 'strategy', id: 'manual' }, 40),
      route('keyword', { kind: 'domain-keyword', value: 'needle' }, { kind: 'reject' }, 30),
      route('suffix', { kind: 'domain-suffix', value: 'suffix.example' }, { kind: 'direct' }, 20),
      route('domain', { kind: 'domain', value: 'exact.example' }, { kind: 'strategy', id: 'manual' }, 10),
      route('tie', { kind: 'domain', value: 'tie.example' }, { kind: 'direct' }, 10),
    ])

    const rules = compileLoonRules(input)
    expect(input.issues).toEqual([])
    expect(rules.map(serializeLoonRule)).toEqual([
      'DOMAIN,exact.example,Proxy',
      'DOMAIN,tie.example,DIRECT',
      'DOMAIN-SUFFIX,suffix.example,DIRECT',
      'DOMAIN-KEYWORD,needle,REJECT',
      'IP-CIDR,192.0.2.0/24,Proxy',
      'IP-CIDR6,2001:db8::/32,DIRECT',
      'GEOIP,US,REJECT',
      'FINAL,Proxy',
    ])
  })

  it('does not guess no-resolve when Universal IR has no such field', () => {
    const plan = planLoonRouting({
      routes: [
        route('ipv4', { kind: 'ip-cidr', value: '198.51.100.0/24' }, { kind: 'direct' }, 10),
        route('ipv6', { kind: 'ip-cidr6', value: '2001:db8::/32' }, { kind: 'reject' }, 20),
      ],
      finalRoute: { target: { kind: 'direct' } },
    }, new Map(), new Set())
    expect(plan.issues).toEqual([])
    expect(plan.rules.map(serializeLoonRule)).toEqual([
      'IP-CIDR,198.51.100.0/24,DIRECT',
      'IP-CIDR6,2001:db8::/32,REJECT',
      'FINAL,DIRECT',
    ])
    expect(plan.rules).not.toContainEqual(expect.objectContaining({ noResolve: true }))
  })

  it.each([
    { kind: 'service', serviceIds: ['openai'] },
    { kind: 'port', port: 443 },
    { kind: 'asn', value: 64_496 },
    { kind: 'geo-site', category: 'cn' },
    { kind: 'rule-set', id: 'remote-rules' },
  ] satisfies TrafficMatcherIR[])('blocks unsupported matcher $kind instead of silently dropping it', (matcher) => {
    const input = context([route('unsupported', matcher, { kind: 'direct' }, 10)])
    const rules = compileLoonRules(input)
    expect(rules.map(serializeLoonRule)).toEqual(['FINAL,Proxy'])
    expect(input.issues).toContainEqual(expect.objectContaining({
      target: 'loon', code: matcher.kind === 'asn' ? 'LOON_ROUTE_NO_RESOLVE_UNMODELED' : 'LOON_MATCHER_UNSUPPORTED', severity: 'error', entityId: 'unsupported',
    }))
  })

  it('blocks references to strategies that did not compile', () => {
    const input = context([
      route('missing', { kind: 'domain', value: 'missing.example' }, { kind: 'strategy', id: 'missing' }, 10),
    ], { target: { kind: 'strategy', id: 'allocated-only' } })
    input.strategyNames.set('missing', 'Missing')
    input.strategyNames.set('allocated-only', 'Allocated')
    const rules = compileLoonRules(input)
    expect(rules).toEqual([])
    expect(input.issues).toEqual([
      expect.objectContaining({ code: 'LOON_TARGET_REFERENCE_NOT_FOUND', entityId: 'missing' }),
      expect.objectContaining({ code: 'LOON_TARGET_REFERENCE_NOT_FOUND', entityId: 'final' }),
    ])
  })

  it('maps DIRECT and REJECT for ordinary and final routes', () => {
    const input = context([
      route('direct', { kind: 'domain', value: 'direct.example' }, { kind: 'direct' }, 10),
      route('reject', { kind: 'domain', value: 'reject.example' }, { kind: 'reject' }, 20),
    ], { target: { kind: 'reject' } })
    expect(compileLoonRules(input).map(serializeLoonRule)).toEqual([
      'DOMAIN,direct.example,DIRECT',
      'DOMAIN,reject.example,REJECT',
      'FINAL,REJECT',
    ])
  })
})
