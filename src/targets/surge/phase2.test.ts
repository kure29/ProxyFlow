import { describe, expect, it } from 'vitest'
import e2eProfile from '../../../fixtures/surge/e2e-materialized.conf?raw'
import fallbackProfile from '../../../fixtures/surge/fallback.conf?raw'
import fixedProfile from '../../../fixtures/surge/fixed-strategy.conf?raw'
import chainProfile from '../../../fixtures/surge/proxy-chain.conf?raw'
import selectProfile from '../../../fixtures/surge/select.conf?raw'
import serviceRulesProfile from '../../../fixtures/surge/service-rules.conf?raw'
import urlTestProfile from '../../../fixtures/surge/url-test.conf?raw'
import { subscriptionSnapshotFixture } from '../../core/__fixtures__/subscriptionFixtures'
import { openAiRouteFixture, subscriptionFilterAutoFixture } from '../../core/__fixtures__/graphFixtures'
import { compileGraph } from '../../core/graphCompiler'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type ResolvedProxyEndpointIR } from '../../core/ir'
import type { PolicyReference, TargetNativeStrategyIR } from '../../core/targetNative'
import { parseSubscription } from '../../core/subscription'
import { serviceCatalog } from '../../data/serviceCatalog'
import type { GraphEdge, GraphNode } from '../../types/project'
import { compileSurge } from './compiler'
import { compileSurgeGeneral } from './health'

const fixedNow = () => new Date('2026-08-23T00:00:00.000Z')

const proxyA = (): Extract<ResolvedProxyEndpointIR, { kind: 'http' }> => ({
  kind: 'http', protocol: 'http', id: 'proxy-a', name: 'Proxy A', server: 'proxy-a.example.com', port: 8080,
})

const proxyB = (): Extract<ResolvedProxyEndpointIR, { kind: 'http' }> => ({
  kind: 'http', protocol: 'http', id: 'proxy-b', name: 'Proxy B', server: 'proxy-b.example.com', port: 8081,
})

function irWith(proxies: ResolvedProxyEndpointIR[] = [proxyA(), proxyB()]): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'surge-phase-2', projectName: 'Surge Phase 2', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'manual', name: 'Manual', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [], routes: [],
    finalRoute: { target: { kind: 'strategy', id: 'manual' } },
    outputs: [{ id: 'output', name: 'Surge', target: 'surge', enabled: true }],
  }
}

function success(ir: ProxyFlowIR) {
  const result = compileSurge(ir, { now: fixedNow })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  return result
}

function failure(ir: ProxyFlowIR, code: string) {
  const result = compileSurge(ir, { now: fixedNow })
  expect(result.success).toBe(false)
  expect(result.content).toBe('')
  expect(result.issues).toContainEqual(expect.objectContaining({ code, target: 'surge', severity: 'error' }))
  return result
}

function nativeSmart(
  memberIds: string[] = ['proxy-a'],
  id = 'native-smart',
  name = 'Native Smart',
): TargetNativeStrategyIR {
  return {
    id, name, target: 'surge', kind: 'smart',
    members: memberIds.map((id) => ({ kind: 'proxy', id })),
  }
}

function nativeSubnet(defaultPolicy: PolicyReference, conditions: Array<{ policy: PolicyReference }> = []): TargetNativeStrategyIR {
  return {
    id: 'native-subnet', name: 'Native Subnet', target: 'surge', kind: 'subnet',
    defaultPolicy,
    conditions: conditions.map((condition, index) => ({
      matcher: { kind: 'ssid', value: `network-${index}` },
      policy: condition.policy,
    })),
  }
}

function compileWithNative(ir: ProxyFlowIR, nativeStrategies: TargetNativeStrategyIR[]) {
  return compileSurge(ir, { now: fixedNow, nativeStrategies })
}

function expectGlobalScopeFailure(ir: ProxyFlowIR, nativeStrategies: TargetNativeStrategyIR[]) {
  const result = compileWithNative(ir, nativeStrategies)
  expect(result.success).toBe(false)
  expect(result.content).toBe('')
  expect(result.issues).toContainEqual(expect.objectContaining({
    code: 'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED', target: 'surge', severity: 'error',
  }))
  return result
}

describe('Surge Phase 2 fixtures', () => {
  it('matches the independent Select fixture', () => {
    expect(success(irWith()).content).toBe(selectProfile)
  })

  it('matches the independent URL Test fixture including tolerance=0', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://www.gstatic.com/generate_204', intervalSeconds: 120, toleranceMs: 0 },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    expect(success(ir).content).toBe(urlTestProfile)
  })

  it('matches the independent Fallback fixture', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'fallback', id: 'fallback', name: 'Fallback', candidates: [{ kind: 'source', id: 'source' }],
      healthCheck: { url: 'https://www.gstatic.com/generate_204', intervalSeconds: 300 },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'fallback' } }
    expect(success(ir).content).toBe(fallbackProfile)
  })

  it('keeps the ten first-party Service Rule URLs byte-stable', () => {
    const ir = irWith([{ ...proxyA(), name: 'Proxy A', server: 'proxy.example.com' }])
    ir.strategies[0].name = 'Proxy'
    ir.services = structuredClone(serviceCatalog)
    ir.routes = serviceRuleCases.map(({ id }, index) => ({
      id: `${id}-route`, name: id, matcher: { kind: 'service' as const, serviceIds: [id] },
      target: { kind: 'strategy' as const, id: 'manual' }, priority: (index + 1) * 10,
    }))
    expect(success(ir).content).toBe(serviceRulesProfile)
  })
})

describe('Surge Remote Proxy Source decisions', () => {
  it('materializes Auto from the validated snapshot without guessing policy-path', () => {
    const ir = remoteIR('auto')
    const result = success(ir)
    expect(result.content).not.toContain('policy-path')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED', severity: 'info', entityId: 'remote',
    }))
  })

  it('fails forced Remote when the source format cannot be proven Surge-compatible', () => {
    const result = failure(remoteIR('remote'), 'SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN')
    expect(result.issues.find((issue) => issue.code === 'SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN')?.message)
      .toContain('Surge policy list or a Surge profile [Proxy] section')
  })

  it('honors explicit Materialized and preserves processing semantics', () => {
    const ir = remoteIR('materialized')
    ir.transforms = [{
      kind: 'filter', id: 'hk-only', name: 'HK only', input: { kind: 'source', id: 'remote' },
      include: ['Proxy A'], exclude: [],
    }]
    ir.strategies = [{ kind: 'select', id: 'manual', name: 'Manual', candidates: [{ kind: 'transform', id: 'hk-only' }] }]
    const result = success(ir)
    expect(result.content).toContain('Manual = select, Proxy A')
    expect(result.content).not.toContain('Proxy B =')
    expect(result.content).not.toContain('policy-path')
  })
})

describe('Surge Fixed Strategy', () => {
  it('preserves route identity with a one-member select group', () => {
    const ir = irWith([proxyA()])
    ir.strategies = [{ kind: 'fixed', id: 'fixed', name: 'Fixed', proxyId: 'proxy-a' }]
    ir.routes = [{
      id: 'example', name: 'Example', matcher: { kind: 'domain-suffix', value: 'example.com' },
      target: { kind: 'strategy', id: 'fixed' }, priority: 10,
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'fixed' } }
    expect(success(ir).content).toBe(fixedProfile)
  })

  it('supports a Fixed strategy as a nested candidate without mutating its proxy', () => {
    const ir = irWith([proxyA()])
    ir.strategies = [
      { kind: 'fixed', id: 'fixed', name: 'Fixed', proxyId: 'proxy-a' },
      { kind: 'select', id: 'nested', name: 'Nested', candidates: [{ kind: 'strategy', id: 'fixed' }, { kind: 'source', id: 'source' }] },
    ]
    ir.finalRoute = { target: { kind: 'strategy', id: 'nested' } }
    const result = success(ir)
    expect(result.content.match(/^Proxy A =/gm)).toHaveLength(1)
    expect(result.content).toContain('Fixed = select, Proxy A')
    expect(result.content).toContain('Nested = select, Fixed, Proxy A')
  })

  it('fails for missing and colliding Fixed policies', () => {
    const missing = irWith([proxyA()])
    missing.strategies = [{ kind: 'fixed', id: 'fixed', name: 'Fixed', proxyId: 'missing' }]
    missing.finalRoute = { target: { kind: 'strategy', id: 'fixed' } }
    failure(missing, 'IR_FIXED_PROXY_REFERENCE_NOT_FOUND')

    const collision = irWith([proxyA()])
    collision.strategies = [{ kind: 'fixed', id: 'fixed', name: 'Proxy A', proxyId: 'proxy-a' }]
    collision.finalRoute = { target: { kind: 'strategy', id: 'fixed' } }
    failure(collision, 'SURGE_POLICY_NAME_DUPLICATE')
  })
})

describe('Surge Proxy Chain', () => {
  it('matches the independent two-hop fixture and leaves shared proxies unchanged', () => {
    const result = success(chainIR())
    expect(result.content).toBe(chainProfile)
    expect(section(result.content, 'Proxy')).not.toContain('underlying-proxy')
  })

  it('lowers three hops in declared order with deterministic collision-safe intermediate names', () => {
    const ir = chainIR()
    ir.sources.push({
      kind: 'manual-proxy', id: 'middle-source', name: 'Middle Source',
      proxies: [{ ...proxyA(), id: 'middle-proxy', name: 'Middle Proxy', server: 'middle.example.com' }],
    })
    ir.strategies.splice(1, 0,
      { kind: 'select', id: 'middle', name: 'Middle', candidates: [{ kind: 'source', id: 'middle-source' }] },
      { kind: 'select', id: 'reserved-hop-name', name: 'Chain · Hop 2', candidates: [{ kind: 'source', id: 'entry-source' }] },
    )
    const chain = ir.strategies.find((strategy) => strategy.kind === 'chain')!
    if (chain.kind !== 'chain') throw new Error('Expected chain')
    chain.hops = [{ kind: 'strategy', id: 'entry' }, { kind: 'strategy', id: 'middle' }, { kind: 'strategy', id: 'exit' }]
    const result = success(ir)
    expect(section(result.content, 'Proxy Group')).toContain(
      'Chain · Hop 2 2 = select, Middle Proxy, underlying-proxy=Entry',
    )
    expect(section(result.content, 'Proxy Group')).toContain(
      'Chain = select, Exit Proxy, underlying-proxy=Chain · Hop 2 2',
    )
    expect(compileSurge(ir, { now: fixedNow }).content).toBe(result.content)
  })

  it('allows a nested group as the first hop but rejects it downstream', () => {
    const first = chainIR()
    first.strategies.splice(2, 0, {
      kind: 'select', id: 'wrapper', name: 'Wrapper', candidates: [{ kind: 'strategy', id: 'entry' }],
    })
    const firstChain = first.strategies.find((strategy) => strategy.kind === 'chain')!
    if (firstChain.kind !== 'chain') throw new Error('Expected chain')
    firstChain.hops = [{ kind: 'strategy', id: 'wrapper' }, { kind: 'strategy', id: 'exit' }]
    expect(success(first).content).toContain('Chain = select, Exit Proxy, underlying-proxy=Wrapper')

    const downstream = structuredClone(first)
    const downstreamChain = downstream.strategies.find((strategy) => strategy.kind === 'chain')!
    if (downstreamChain.kind !== 'chain') throw new Error('Expected chain')
    downstreamChain.hops = [{ kind: 'strategy', id: 'entry' }, { kind: 'strategy', id: 'wrapper' }]
    failure(downstream, 'SURGE_PROXY_CHAIN_NESTED_MEMBER_UNSUPPORTED')
  })

  it('rejects nested chains, downstream port hopping, and derived dependency cycles', () => {
    const nested = chainIR()
    nested.strategies.push({ kind: 'chain', id: 'outer', name: 'Outer', hops: [{ kind: 'strategy', id: 'chain' }, { kind: 'strategy', id: 'exit' }] })
    nested.finalRoute = { target: { kind: 'strategy', id: 'outer' } }
    failure(nested, 'SURGE_PROXY_CHAIN_NESTED_CHAIN_UNSUPPORTED')

    const hopping = chainIR()
    const exitSource = hopping.sources.find((source) => source.id === 'exit-source')!
    if (exitSource.kind !== 'manual-proxy') throw new Error('Expected manual source')
    exitSource.proxies = [{
      kind: 'hysteria2', protocol: 'hysteria2', id: 'exit-proxy', name: 'Exit Proxy',
      server: 'exit.example.com', port: 443, password: 'secret', tls: { enabled: true },
      serverPorts: [{ kind: 'range', start: 5000, end: 6000 }], hopInterval: { kind: 'fixed', seconds: 30 },
    }]
    failure(hopping, 'SURGE_PROXY_CHAIN_PORT_HOPPING_UNSUPPORTED')

    const cyclic = chainIR()
    const entry = cyclic.strategies.find((strategy) => strategy.id === 'entry')!
    if (entry.kind !== 'select') throw new Error('Expected select')
    entry.candidates = [{ kind: 'strategy', id: 'chain' }]
    failure(cyclic, 'SURGE_STRATEGY_CYCLE')
  })
})

describe('Surge Health Check exactness', () => {
  it('uses one global URL only when all testing groups share it', () => {
    const ir = irWith()
    ir.strategies = [
      { kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' }, healthCheck: { url: 'https://example.com/ping' } },
      { kind: 'fallback', id: 'fallback', name: 'Fallback', candidates: [{ kind: 'source', id: 'source' }], healthCheck: { url: 'https://example.com/ping' } },
    ]
    ir.finalRoute = { target: { kind: 'strategy', id: 'fallback' } }
    expect(section(success(ir).content, 'General')).toEqual(['proxy-test-url = https://example.com/ping'])
  })

  it('keeps the existing Auto Select lowering byte-stable without native strategies', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    expect(section(success(ir).content, 'General')).toEqual(['proxy-test-url = https://example.com/ping'])
  })

  it('blocks Auto Select plus target-native Smart even when members are shared', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    expectGlobalScopeFailure(ir, [nativeSmart(['proxy-a', 'proxy-b'])])
    expect(compileSurgeGeneral(ir, [nativeSmart(['proxy-a', 'proxy-b'])])).toEqual([])
  })

  it('blocks Fallback plus target-native Smart', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'fallback', id: 'fallback', name: 'Fallback', candidates: [{ kind: 'source', id: 'source' }],
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'fallback' } }
    expectGlobalScopeFailure(ir, [nativeSmart(['proxy-a'])])
  })

  it('blocks a Subnet with a direct proxy default policy', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    expectGlobalScopeFailure(ir, [nativeSubnet({ kind: 'proxy', id: 'proxy-a' })])
  })

  it('blocks a Subnet with a direct proxy condition policy', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    expectGlobalScopeFailure(ir, [nativeSubnet(
      { kind: 'builtin', id: 'DIRECT' },
      [{ policy: { kind: 'proxy', id: 'proxy-b' } }],
    )])
  })

  it('does not block a Subnet whose policies are only DIRECT and REJECT', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    const result = compileWithNative(ir, [nativeSubnet(
      { kind: 'builtin', id: 'DIRECT' },
      [{ policy: { kind: 'builtin', id: 'REJECT' } }],
    )])
    expect(result.success).toBe(true)
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED' }))
  })

  it('blocks mixed Subnet DIRECT / REJECT / proxy references', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    expectGlobalScopeFailure(ir, [nativeSubnet(
      { kind: 'builtin', id: 'DIRECT' },
      [{ policy: { kind: 'builtin', id: 'REJECT' } }, { policy: { kind: 'proxy', id: 'proxy-a' } }],
    )])
  })

  it('does not treat a Subnet reference to a covered Universal Auto Select as a new surface', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    const result = compileWithNative(ir, [nativeSubnet({ kind: 'strategy', id: 'auto' })])
    expect(result.success).toBe(true)
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED' }))
  })

  it('blocks a Subnet that references a target-native Smart strategy with proxy members', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    expectGlobalScopeFailure(ir, [
      nativeSmart(['proxy-a'], 'native-smart', 'Native Smart'),
      nativeSubnet({ kind: 'strategy', id: 'native-smart' }),
    ])
  })

  it('keeps the existing Universal Select protection when Subnet references it', () => {
    const ir = irWith()
    ir.strategies = [
      {
        kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
        healthCheck: { url: 'https://example.com/ping' },
      },
      { kind: 'select', id: 'select', name: 'Select', candidates: [{ kind: 'source', id: 'source' }] },
    ]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    expectGlobalScopeFailure(ir, [nativeSubnet({ kind: 'strategy', id: 'select' })])
  })

  it('does not derive a global URL merely because native Smart exists', () => {
    const ir = irWith()
    const result = compileWithNative(ir, [nativeSmart(['proxy-a', 'proxy-b'])])
    expect(result.success).toBe(true)
    expect(section(result.content, 'General')).toEqual([])
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED' }))
  })

  it('rejects malformed native strategy data without allowing the lowerer to emit', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    const malformed = { ...nativeSmart(), futureField: true } as never
    const result = compileSurge(ir, { now: fixedNow, nativeStrategies: [malformed] })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_STRATEGY_INVALID', severity: 'error' }))
    expect(compileSurgeGeneral(ir, [malformed])).toEqual([])
  })

  it('keeps native-surface analysis deterministic across strategy array order', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' },
      healthCheck: { url: 'https://example.com/ping' },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    const first = expectGlobalScopeFailure(ir, [nativeSmart(['proxy-a'], 'smart-a', 'Smart A'), nativeSmart(['proxy-b'], 'smart-b', 'Smart B')])
    const second = expectGlobalScopeFailure(ir, [nativeSmart(['proxy-b'], 'smart-b', 'Smart B'), nativeSmart(['proxy-a'], 'smart-a', 'Smart A')])
    expect(first.issues.filter((issue) => issue.code === 'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED')).toHaveLength(2)
    expect(second.issues.filter((issue) => issue.code === 'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED')).toHaveLength(2)
  })

  it('fails for conflicting, missing, unsafe, or globally widened URL intent', () => {
    const conflicting = irWith()
    conflicting.strategies = [
      { kind: 'auto-select', id: 'a', name: 'A', source: { kind: 'source', id: 'source' }, healthCheck: { url: 'https://a.example/ping' } },
      { kind: 'fallback', id: 'b', name: 'B', candidates: [{ kind: 'source', id: 'source' }], healthCheck: { url: 'https://b.example/ping' } },
    ]
    conflicting.finalRoute = { target: { kind: 'strategy', id: 'a' } }
    failure(conflicting, 'SURGE_STRATEGY_TEST_URL_CONFLICT')

    const missing = structuredClone(conflicting)
    const fallback = missing.strategies[1]
    if (fallback.kind !== 'fallback') throw new Error('Expected fallback')
    delete fallback.healthCheck
    failure(missing, 'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED')

    const unsafe = irWith()
    unsafe.strategies = [{ kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' }, healthCheck: { url: 'javascript:alert(1)' } }]
    unsafe.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    failure(unsafe, 'SURGE_STRATEGY_TEST_URL_INVALID')

    const widened = irWith()
    widened.strategies.push({ kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' }, healthCheck: { url: 'https://example.com/ping' } })
    failure(widened, 'SURGE_STRATEGY_TEST_URL_GLOBAL_SCOPE_UNSUPPORTED')
  })

  it('keeps Fallback tolerance fail-closed', () => {
    const ir = irWith()
    ir.strategies = [{
      kind: 'fallback', id: 'fallback', name: 'Fallback', candidates: [{ kind: 'source', id: 'source' }],
      healthCheck: { toleranceMs: 10 },
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'fallback' } }
    failure(ir, 'SURGE_FALLBACK_TOLERANCE_UNSUPPORTED')
  })
})

describe('Project → IR → Surge E2E', () => {
  it('combines snapshot materialization, HK Filter, Auto, Service, ordinary route, and FINAL', () => {
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
    expect(graph.ir?.transforms).toContainEqual(expect.objectContaining({ kind: 'filter', include: ['HK'] }))
    const result = success(graph.ir!)
    expect(result.content).toBe(e2eProfile)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED' }))
    expect(result.content).not.toContain('US HTTP')
  })
})

const serviceRuleCases = [
  { id: 'openai' }, { id: 'claude' }, { id: 'google' }, { id: 'gemini' }, { id: 'youtube' },
  { id: 'netflix' }, { id: 'disney' }, { id: 'telegram' }, { id: 'github' }, { id: 'steam' },
] as const

function remoteIR(exportMode: 'auto' | 'remote' | 'materialized') {
  const ir = irWith()
  ir.sources = [{
    kind: 'subscription', id: 'remote', name: 'Remote', url: 'https://example.com/subscription', enabled: true,
    proxies: [proxyA(), proxyB()],
    remote: {
      kind: 'remote-subscription', id: 'remote', name: 'Remote', url: 'https://example.com/subscription',
      requestProfile: 'auto', exportMode,
      snapshot: { id: 'snapshot', contentHash: 'fixture-hash', fetchedAt: '2026-08-23T00:00:00.000Z' },
    },
    materialization: { status: 'ready' },
  }]
  ir.strategies = [{ kind: 'select', id: 'manual', name: 'Manual', candidates: [{ kind: 'source', id: 'remote' }] }]
  return ir
}

function chainIR() {
  const ir = irWith([])
  ir.sources = [
    { kind: 'manual-proxy', id: 'entry-source', name: 'Entry Source', proxies: [{ ...proxyA(), id: 'entry-proxy', name: 'Entry Proxy', server: 'entry.example.com' }] },
    { kind: 'manual-proxy', id: 'exit-source', name: 'Exit Source', proxies: [{ ...proxyB(), id: 'exit-proxy', name: 'Exit Proxy', server: 'exit.example.com' }] },
  ]
  ir.strategies = [
    { kind: 'select', id: 'entry', name: 'Entry', candidates: [{ kind: 'source', id: 'entry-source' }] },
    { kind: 'select', id: 'exit', name: 'Exit', candidates: [{ kind: 'source', id: 'exit-source' }] },
    { kind: 'chain', id: 'chain', name: 'Chain', hops: [{ kind: 'strategy', id: 'entry' }, { kind: 'strategy', id: 'exit' }] },
  ]
  ir.routes = [{
    id: 'example', name: 'Example', matcher: { kind: 'domain-suffix', value: 'example.com' },
    target: { kind: 'strategy', id: 'chain' }, priority: 10,
  }]
  ir.finalRoute = { target: { kind: 'strategy', id: 'chain' } }
  return ir
}

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
  const customNode: GraphNode = {
    ...structuredClone(serviceNode), id: 'custom-route',
    data: {
      ...serviceNode.data, blockType: 'custom-rule', title: 'Example', services: undefined,
      routeMatcherKind: 'domain-suffix', routeMatcherValue: 'example.com', targetId: 'auto', targetLabel: 'auto',
    },
  }
  project.graph.nodes.push(serviceNode, customNode)
  const routeEdge = (id: string, source: string): GraphEdge => ({
    id, source, target: 'auto', type: 'smoothstep', data: { semantic: 'route' },
  })
  project.graph.edges.push(routeEdge('e-openai-auto', 'openai-route'), routeEdge('e-custom-auto', 'custom-route'))
  const output = project.graph.nodes.find((node) => node.id === 'output')!
  output.data.client = 'surge'
  return project
}
