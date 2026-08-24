import { describe, expect, it } from 'vitest'
import type { ProxyFlowIR, RouteIR, RouteTargetIR, TrafficMatcherIR } from '../../core/ir'
import { PROXYFLOW_IR_VERSION } from '../../core/ir'
import { checkLoonCompatibility } from './compatibility'
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

function compatibilityIR(routes: RouteIR[]): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'loon-routing-test', projectName: 'Loon routing test', projectSchemaVersion: 2 },
    sources: [],
    transforms: [],
    strategies: [],
    services: [],
    routes,
    finalRoute: { target: { kind: 'direct' } },
    outputs: [],
  }
}

describe('Loon routing', () => {
  it('blocks active mixed domain and IP matcher families at compatibility time', () => {
    const result = checkLoonCompatibility(compatibilityIR([
      route('domain', { kind: 'domain', value: 'example.invalid' }, { kind: 'direct' }, 20),
      route('ip', { kind: 'ip-cidr', value: '192.0.2.0/24' }, { kind: 'reject' }, 10),
    ]))

    expect(result.supported).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      target: 'loon',
      code: 'LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED',
      severity: 'error',
      feature: 'route-order',
    }))
  })

  it.each([
    {
      label: 'domain family',
      routes: [
        route('exact', { kind: 'domain', value: 'exact.example.invalid' }, { kind: 'direct' }, 20),
        route('suffix', { kind: 'domain-suffix', value: 'example.invalid' }, { kind: 'reject' }, 10),
      ],
    },
    {
      label: 'IP family',
      routes: [
        route('ipv4', { kind: 'ip-cidr', value: '192.0.2.0/24' }, { kind: 'direct' }, 20),
        route('ipv6', { kind: 'ip-cidr6', value: '2001:db8::/32' }, { kind: 'reject' }, 10),
        route('geo', { kind: 'geo-ip', countryCode: 'US' }, { kind: 'direct' }, 5),
      ],
    },
  ])('preserves pure $label routes and FINAL without an order blocker', ({ routes }) => {
    const result = checkLoonCompatibility(compatibilityIR(routes))
    expect(result.supported).toBe(true)
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED' }))

    const plan = planLoonRouting({ routes, finalRoute: { target: { kind: 'direct' } } }, new Map(), new Set())
    expect(plan.issues).toEqual([])
    expect(plan.rules.at(-1)).toEqual({ type: 'FINAL', policy: 'DIRECT' })
    expect(plan.rules.slice(0, -1).map((rule) => rule.payload)).toEqual(
      [...routes].sort((left, right) => left.priority - right.priority).map((route) => (
        route.matcher.kind === 'geo-ip' ? route.matcher.countryCode : 'value' in route.matcher ? route.matcher.value : ''
      )),
    )
  })

  it('domain-only preserves Universal priority order and keeps FINAL last', () => {
    const input = context([
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
      'final,Proxy',
    ])
  })

  it('IP-only preserves Universal priority order and keeps FINAL last', () => {
    const input = context([
      route('geo', { kind: 'geo-ip', countryCode: 'US' }, { kind: 'reject' }, 30),
      route('ipv6', { kind: 'ip-cidr6', value: '2001:db8::/32' }, { kind: 'direct' }, 20),
      route('ipv4', { kind: 'ip-cidr', value: '192.0.2.0/24' }, { kind: 'strategy', id: 'manual' }, 10),
    ])
    const rules = compileLoonRules(input)
    expect(input.issues).toEqual([])
    expect(rules.map(serializeLoonRule)).toEqual([
      'IP-CIDR,192.0.2.0/24,Proxy',
      'IP-CIDR6,2001:db8::/32,DIRECT',
      'geoip,US,REJECT',
      'final,Proxy',
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
      'final,DIRECT',
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
    expect(rules.map(serializeLoonRule)).toEqual(['final,Proxy'])
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
      'final,REJECT',
    ])
  })
})
