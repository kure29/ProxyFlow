import { describe, expect, it } from 'vitest'
import { surgeNativeAcceptanceProject } from '../../core/__fixtures__/surgeNativeStrategies'
import { compileGraph } from '../../core/graphCompiler'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../../core/ir'
import {
  isTargetNativeFinalRouteIR,
  isTargetNativeRouteIR,
  type TargetNativeFinalRouteIR,
  type TargetNativeRouteIR,
  type TargetNativeStrategyIR,
} from '../../core/targetNative'
import { compileMihomo } from '../mihomo/compiler'
import { compileSurge } from './compiler'

function baseIR(): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'native-runtime', projectName: 'Native runtime', projectSchemaVersion: 2 },
    sources: [{
      kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [{
        kind: 'socks', protocol: 'socks5', version: '5', id: 'proxy', name: 'Proxy', server: 'proxy.example.com', port: 1080,
      }],
    }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'universal', name: 'Universal', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [],
    finalRoute: { target: { kind: 'direct' } },
    outputs: [{ id: 'output', name: 'Output', target: 'surge', enabled: true }],
  }
}

const nativeStrategy: TargetNativeStrategyIR = {
  id: 'native', name: 'Native', target: 'surge', kind: 'smart', members: [{ kind: 'proxy', id: 'proxy' }],
}

const nativeSubnetStrategy: TargetNativeStrategyIR = {
  id: 'native-subnet', name: 'Native Subnet', target: 'surge', kind: 'subnet', conditions: [],
  defaultPolicy: { kind: 'builtin', id: 'DIRECT' },
}

function nativeRoute(overrides: Partial<TargetNativeRouteIR> = {}): TargetNativeRouteIR {
  return {
    id: 'route',
    name: 'Native route',
    matcher: { kind: 'ip-cidr', value: '203.0.113.0/24' },
    target: { kind: 'direct' },
    priority: 10,
    routingOrder: 0,
    ...overrides,
  }
}

function nativeFinal(overrides: Partial<TargetNativeFinalRouteIR> = {}): TargetNativeFinalRouteIR {
  return {
    id: 'final',
    name: 'Native final',
    target: { kind: 'strategy', id: 'native' },
    ...overrides,
  }
}

describe('target-native route runtime boundary', () => {
  it('accepts a valid Universal matcher route and a valid SRC-PORT route', () => {
    const ordinary = nativeRoute({ target: { kind: 'strategy', id: 'native' } })
    expect(isTargetNativeRouteIR(ordinary)).toBe(true)
    const sourcePort = nativeRoute({
      matcher: { kind: 'source-port', port: 443 },
      targetNativeSourcePort: { routeId: 'route', target: 'surge', kind: 'source-port', port: 443 },
    })
    expect(isTargetNativeRouteIR(sourcePort)).toBe(true)
    const result = compileSurge(baseIR(), { nativeStrategies: [nativeStrategy], nativeRoutes: [ordinary] })
    expect(result.success, result.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(result.content).toContain('IP-CIDR,203.0.113.0/24,Native')
  })

  it.each([
    [nativeStrategy, 'Native'],
    [nativeSubnetStrategy, 'Native Subnet'],
  ] as const)('admits an ordinary matcher only when it targets native strategy %s', (strategy, policyName) => {
    const route = nativeRoute({ target: { kind: 'strategy', id: strategy.id } })
    const result = compileSurge(baseIR(), { nativeStrategies: [strategy], nativeRoutes: [route] })
    expect(result.success, result.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(result.content).toContain(`IP-CIDR,203.0.113.0/24,${policyName}`)
  })

  it.each([
    ['DIRECT', { kind: 'direct' }],
    ['REJECT', { kind: 'reject' }],
    ['Universal strategy', { kind: 'strategy', id: 'universal' }],
    ['missing strategy', { kind: 'strategy', id: 'missing' }],
  ] as const)('rejects ordinary matcher → %s smuggled through nativeRoutes', (_label, target) => {
    const result = compileSurge(baseIR(), { nativeStrategies: [nativeStrategy], nativeRoutes: [nativeRoute({ target })] })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_ROUTE_INVALID', severity: 'error' }))
  })

  it.each([
    ['ambiguous native strategy', [nativeStrategy, { ...nativeStrategy }]],
    ['invalid native strategy', [{ ...nativeStrategy, extendedMatching: true }]],
  ] as const)('rejects an ordinary route with %s ownership', (_label, nativeStrategies) => {
    const result = compileSurge(baseIR(), {
      nativeStrategies: nativeStrategies as never,
      nativeRoutes: [nativeRoute({ target: { kind: 'strategy', id: 'native' } })],
    })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_ROUTE_INVALID', severity: 'error' }))
  })

  it.each([
    ['DIRECT', { kind: 'direct' }],
    ['REJECT', { kind: 'reject' }],
    ['Universal strategy', { kind: 'strategy', id: 'universal' }],
    ['native strategy', { kind: 'strategy', id: 'native' }],
  ] as const)('preserves SRC-PORT → %s target semantics', (_label, target) => {
    const route = nativeRoute({
      matcher: { kind: 'source-port', port: 443 },
      target,
      targetNativeSourcePort: { routeId: 'route', target: 'surge', kind: 'source-port', port: 443 },
    })
    const result = compileSurge(baseIR(), { nativeStrategies: [nativeStrategy], nativeRoutes: [route] })
    expect(result.success, result.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(result.content).toContain('SRC-PORT,443,')
  })

  it.each([
    ['missing matcher', { matcher: undefined }],
    ['missing routing order', { routingOrder: undefined }],
    ['unknown top-level field', { futureSemantic: true }],
    ['malformed target', { target: { kind: 'direct', futureSemantic: true } }],
    ['malformed matcher', { matcher: { kind: 'ip-cidr', value: 'not-cidr' } }],
    ['matcher extra field', { matcher: { kind: 'ip-cidr', value: '203.0.113.0/24', extendedMatching: true } }],
    ['misplaced source-port provenance', { targetNativeSourcePort: { routeId: 'route', target: 'surge', kind: 'source-port', port: 443 } }],
  ])('rejects %s without serializing it', (_label, patch) => {
    const malformed = { ...nativeRoute(), ...patch } as never
    const result = compileSurge(baseIR(), { nativeRoutes: [malformed] })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_ROUTE_INVALID', severity: 'error' }))
  })

  it('rejects symbol fields and non-object routes without throwing', () => {
    const symbol = Symbol('future')
    const withSymbol = nativeRoute() as unknown as Record<PropertyKey, unknown>
    withSymbol[symbol] = true
    expect(isTargetNativeRouteIR(withSymbol)).toBe(false)
    for (const route of [null, undefined, 42, 'route', withSymbol]) {
      const result = compileSurge(baseIR(), { nativeRoutes: [route] as never })
      expect(result.success).toBe(false)
      expect(result.content).toBe('')
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_ROUTE_INVALID', severity: 'error' }))
    }
  })

  it('rejects invalid source-port provenance while retaining the specific diagnostic', () => {
    const result = compileSurge(baseIR(), {
      nativeRoutes: [nativeRoute({
        matcher: { kind: 'source-port', port: 443 },
        targetNativeSourcePort: { routeId: 'other', target: 'surge', kind: 'source-port', port: 80 },
      }) as never],
    })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_SOURCE_PORT_INVALID', severity: 'error' }))
  })
})

describe('target-native Final runtime boundary', () => {
  it('accepts only a native strategy target and proves the strategy reference', () => {
    expect(isTargetNativeFinalRouteIR(nativeFinal())).toBe(true)
    const ir = baseIR()
    ir.finalRoute = undefined
    const result = compileSurge(ir, {
      nativeStrategies: [nativeStrategy],
      nativeFinalRoute: nativeFinal(),
      effectiveFinalNodeId: 'final',
    })
    expect(result.success, result.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(result.content).toContain('FINAL,Native')
  })

  it.each([
    ['missing id', { id: '' }],
    ['extra field', { extendedMatching: true }],
    ['matcher', { matcher: { kind: 'domain', value: 'example.com' } }],
    ['routing order', { routingOrder: 0 }],
    ['source-port provenance', { targetNativeSourcePort: { routeId: 'final', target: 'surge', kind: 'source-port', port: 443 } }],
    ['DIRECT target', { target: { kind: 'direct' } }],
    ['REJECT target', { target: { kind: 'reject' } }],
  ])('rejects malformed native Final with %s', (_label, patch) => {
    const ir = baseIR()
    ir.finalRoute = undefined
    const result = compileSurge(ir, {
      nativeStrategies: [nativeStrategy],
      nativeFinalRoute: { ...nativeFinal(), ...patch } as never,
      effectiveFinalNodeId: 'final',
      targetNativeFinalOptions: { finalNodeId: 'final', target: 'surge', kind: 'final-options', dnsFailed: true },
    })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_FINAL_ROUTE_INVALID', severity: 'error' }))
    expect(result.content).not.toContain('FINAL,DIRECT,dns-failed')
  })

  it('rejects missing and Universal strategy references and owner mismatches', () => {
    const ir = baseIR()
    ir.finalRoute = undefined
    const missing = compileSurge(ir, { nativeFinalRoute: nativeFinal(), effectiveFinalNodeId: 'final' })
    expect(missing.success).toBe(false)
    expect(missing.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_FINAL_ROUTE_INVALID', severity: 'error' }))

    const universal = compileSurge(ir, {
      nativeStrategies: [nativeStrategy],
      nativeFinalRoute: nativeFinal({ target: { kind: 'strategy', id: 'universal' } }),
      effectiveFinalNodeId: 'final',
    })
    expect(universal.success).toBe(false)
    expect(universal.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_FINAL_ROUTE_INVALID', severity: 'error' }))

    const mismatch = compileSurge(ir, {
      nativeStrategies: [nativeStrategy],
      nativeFinalRoute: nativeFinal(),
      effectiveFinalNodeId: 'other-final',
      targetNativeFinalOptions: { finalNodeId: 'other-final', target: 'surge', kind: 'final-options', dnsFailed: true },
    })
    expect(mismatch.success).toBe(false)
    expect(mismatch.content).toBe('')
    expect(mismatch.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_FINAL_ROUTE_INVALID', severity: 'error' }))
  })

  it('requires compiler-owned Final provenance even without Final options', () => {
    const ir = baseIR()
    ir.finalRoute = undefined
    for (const effectiveFinalNodeId of [undefined, '', '  ', 'other-final']) {
      const result = compileSurge(ir, {
        nativeStrategies: [nativeStrategy],
        nativeFinalRoute: nativeFinal(),
        effectiveFinalNodeId,
      })
      expect(result.success).toBe(false)
      expect(result.content).toBe('')
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'SURGE_TARGET_NATIVE_FINAL_ROUTE_INVALID', severity: 'error',
      }))
    }
  })

  it.each(['hk-smart', 'hk-subnet'] as const)('keeps Graph → Surge native Final ownership valid for %s', (targetId) => {
    const project = structuredClone(surgeNativeAcceptanceProject)
    const final = project.graph.nodes.find((node) => node.id === 'final-route')!
    final.data.targetId = targetId
    const graph = compileGraph(project, { validationTarget: 'surge' })
    const result = compileSurge(graph.ir!, {
      nativeStrategies: graph.nativeStrategies,
      nativeRoutes: graph.nativeRoutes,
      nativeFinalRoute: graph.nativeFinalRoute,
      effectiveFinalNodeId: graph.effectiveFinalNodeId,
    })
    expect(result.success, result.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(result.content).toContain('FINAL,')
  })

  it('rejects malformed native Final before dns-failed can bypass DIRECT safety', () => {
    const ir = baseIR()
    const result = compileSurge(ir, {
      nativeStrategies: [nativeStrategy],
      nativeFinalRoute: { ...nativeFinal(), target: { kind: 'direct' }, priority: 1 } as never,
      effectiveFinalNodeId: 'final',
      targetNativeFinalOptions: { finalNodeId: 'final', target: 'surge', kind: 'final-options', dnsFailed: true },
    })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.content).not.toContain('FINAL,DIRECT,dns-failed')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_FINAL_ROUTE_INVALID', severity: 'error' }))
  })

  it('distinguishes malformed native Final from a valid cross-target extension', () => {
    const malformed = compileMihomo(baseIR(), { nativeFinalRoute: null as never })
    expect(malformed.success).toBe(false)
    expect(malformed.content).toBe('')
    expect(malformed.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_FINAL_ROUTE_INVALID', severity: 'error' }))

    const valid = compileMihomo(baseIR(), { nativeFinalRoute: nativeFinal(), nativeStrategies: [nativeStrategy] })
    expect(valid.success).toBe(false)
    expect(valid.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_FINAL_ROUTE_UNSUPPORTED', severity: 'error' }))
  })

  it('distinguishes invalid native-route roles from valid cross-target native routes', () => {
    const malformed = compileMihomo(baseIR(), {
      nativeStrategies: [nativeStrategy], nativeRoutes: [nativeRoute({ target: { kind: 'direct' } })],
    })
    expect(malformed.success).toBe(false)
    expect(malformed.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_ROUTE_INVALID', severity: 'error' }))

    const valid = compileMihomo(baseIR(), {
      nativeStrategies: [nativeStrategy],
      nativeRoutes: [nativeRoute({ target: { kind: 'strategy', id: 'native' } })],
    })
    expect(valid.success).toBe(false)
    expect(valid.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_STRATEGY_UNSUPPORTED', severity: 'error' }))
  })
})
