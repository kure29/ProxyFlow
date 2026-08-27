import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../../core/ir'
import type { TargetNativeRouteIR, TargetNativeSourcePortIR } from '../../core/targetNative'
import { compileMihomo } from '../mihomo/compiler'
import { compileLoon } from '../loon/compiler'
import { compileShadowrocket } from '../shadowrocket/compiler'
import { compileSingBox } from '../singbox/compiler'
import { compileSurge } from './compiler'

function baseIR(): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'source-port', projectName: 'Source port', projectSchemaVersion: 2 },
    sources: [{
      kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [{
        kind: 'socks', protocol: 'socks5', version: '5', id: 'proxy', name: 'Endpoint', server: 'proxy.example.com', port: 1080,
      }],
    }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'proxy-group', name: 'Proxy', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [],
    finalRoute: { target: { kind: 'direct' } },
    dns: undefined,
    outputs: [{ id: 'output', name: 'Output', target: 'surge', enabled: true }],
  }
}

function sourcePortRoute(target: TargetNativeRouteIR['target']): TargetNativeRouteIR {
  const provenance: TargetNativeSourcePortIR = { routeId: 'source-port-route', target: 'surge', kind: 'source-port', port: 443 }
  return {
    id: 'source-port-route',
    name: 'Source port',
    matcher: { kind: 'source-port', port: 443 },
    target,
    priority: 10,
    routingOrder: 0,
    targetNativeSourcePort: provenance,
  }
}

describe('Surge-native SRC-PORT lowering', () => {
  it.each([
    ['DIRECT', { kind: 'direct' } as const],
    ['REJECT', { kind: 'reject' } as const],
    ['strategy', { kind: 'strategy', id: 'proxy-group' } as const],
  ])('serializes an exact source port for %s', (_label, target) => {
    const result = compileSurge(baseIR(), { nativeRoutes: [sourcePortRoute(target)] })
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(result.content).toContain(`SRC-PORT,443,${target.kind === 'direct' ? 'DIRECT' : target.kind === 'reject' ? 'REJECT' : 'Proxy'}`)
  })

  it('preserves priority and insertion order for source-port routes', () => {
    const first = sourcePortRoute({ kind: 'direct' })
    const second = { ...sourcePortRoute({ kind: 'reject' }), id: 'source-port-second', name: 'Second', routingOrder: 1, targetNativeSourcePort: { ...sourcePortRoute({ kind: 'reject' }).targetNativeSourcePort!, routeId: 'source-port-second' } }
    first.priority = 20
    second.priority = 20
    const result = compileSurge(baseIR(), { nativeRoutes: [first, second] })
    expect(result.success).toBe(true)
    const rules = result.content.split('\n').filter((line) => line.startsWith('SRC-PORT'))
    expect(rules).toEqual(['SRC-PORT,443,DIRECT', 'SRC-PORT,443,REJECT'])
  })

  it('fails closed for malformed runtime source-port data and extra semantic fields', () => {
    const malformed = sourcePortRoute({ kind: 'direct' })
    malformed.targetNativeSourcePort = { ...malformed.targetNativeSourcePort!, extendedMatching: true } as never
    const malformedResult = compileSurge(baseIR(), { nativeRoutes: [malformed] })
    expect(malformedResult.success).toBe(false)
    expect(malformedResult.content).toBe('')
    expect(malformedResult.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_SOURCE_PORT_INVALID', severity: 'error' }))

    const spoofedOwner = sourcePortRoute({ kind: 'direct' })
    spoofedOwner.targetNativeSourcePort = { ...spoofedOwner.targetNativeSourcePort!, routeId: 'another-route' }
    const spoofedOwnerResult = compileSurge(baseIR(), { nativeRoutes: [spoofedOwner] })
    expect(spoofedOwnerResult.success).toBe(false)
    expect(spoofedOwnerResult.content).toBe('')
    expect(spoofedOwnerResult.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_SOURCE_PORT_INVALID', severity: 'error' }))

    const malformedMatcher = sourcePortRoute({ kind: 'direct' })
    malformedMatcher.matcher = { kind: 'source-port', port: 443, extendedMatching: true } as never
    const malformedMatcherResult = compileSurge(baseIR(), { nativeRoutes: [malformedMatcher] })
    expect(malformedMatcherResult.success).toBe(false)
    expect(malformedMatcherResult.content).toBe('')
    expect(malformedMatcherResult.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_SOURCE_PORT_INVALID', severity: 'error' }))
  })

  it('fails closed whenever runtime matcher and source-port provenance are not an exact pair', () => {
    const misplaced = sourcePortRoute({ kind: 'direct' })
    misplaced.matcher = { kind: 'domain', value: 'example.com' }

    const missingMatcher = sourcePortRoute({ kind: 'direct' })
    missingMatcher.matcher = undefined as never

    const missingProvenance = sourcePortRoute({ kind: 'direct' })
    missingProvenance.targetNativeSourcePort = undefined

    const mismatchedPort = sourcePortRoute({ kind: 'direct' })
    mismatchedPort.targetNativeSourcePort = { ...mismatchedPort.targetNativeSourcePort!, port: 80 }

    for (const route of [misplaced, missingMatcher, missingProvenance, mismatchedPort]) {
      const result = compileSurge(baseIR(), { nativeRoutes: [route] })
      expect(result.success).toBe(false)
      expect(result.content).toBe('')
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'SURGE_TARGET_NATIVE_SOURCE_PORT_INVALID',
        severity: 'error',
        entityId: 'source-port-route',
      }))
    }
  })

  it('fails closed on malformed compiler-owned mixed-route ordering provenance', () => {
    const ir = baseIR()
    ir.routes.push({
      id: 'domain-route', name: 'Domain', matcher: { kind: 'domain', value: 'example.com' },
      target: { kind: 'direct' }, priority: 10,
    })
    const nativeRoute = sourcePortRoute({ kind: 'direct' })
    nativeRoute.routingOrder = 2
    const result = compileSurge(ir, { nativeRoutes: [nativeRoute] })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'SURGE_ROUTE_ORDER_INVALID', severity: 'error',
    }))
  })

  it('requires routingOrder on every native route', () => {
    const missing = sourcePortRoute({ kind: 'direct' })
    delete (missing as { routingOrder?: number }).routingOrder
    const result = compileSurge(baseIR(), { nativeRoutes: [missing] })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_ROUTE_ORDER_INVALID', severity: 'error' }))
  })

  it.each([
    ['duplicate', [0, 0]],
    ['negative', [-1, 1]],
    ['float', [0.5, 1]],
    ['NaN', [Number.NaN, 1]],
    ['Infinity', [Number.POSITIVE_INFINITY, 1]],
    ['out-of-range', [0, 2]],
  ] as const)('rejects %s native routingOrder provenance', (_label, orders) => {
    const first = sourcePortRoute({ kind: 'direct' })
    const second = { ...sourcePortRoute({ kind: 'reject' }), id: 'source-port-second', name: 'Second', targetNativeSourcePort: { ...sourcePortRoute({ kind: 'reject' }).targetNativeSourcePort!, routeId: 'source-port-second' } }
    first.routingOrder = orders[0]
    second.routingOrder = orders[1]
    const result = compileSurge(baseIR(), { nativeRoutes: [first, second] })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_ROUTE_ORDER_INVALID', severity: 'error' }))
  })

  it('reconstructs valid mixed Universal/native route positions from routingOrder', () => {
    const ir = baseIR()
    ir.routes.push({
      id: 'universal-route', name: 'Universal', matcher: { kind: 'domain', value: 'example.com' },
      target: { kind: 'direct' }, priority: 10,
    })
    const native = sourcePortRoute({ kind: 'reject' })
    native.routingOrder = 1
    const result = compileSurge(ir, { nativeRoutes: [native] })
    expect(result.success).toBe(true)
    expect(result.content.split('\n').filter((line) => line.startsWith('DOMAIN,') || line.startsWith('SRC-PORT,'))).toEqual([
      'DOMAIN,example.com,DIRECT',
      'SRC-PORT,443,REJECT',
    ])
  })

  it('rejects the Surge-native route on every non-Surge compiler', async () => {
    const compilers = [compileMihomo, compileLoon, compileShadowrocket, compileSingBox]
    for (const compiler of compilers) {
      const result = await compiler(baseIR(), { nativeRoutes: [sourcePortRoute({ kind: 'direct' })] })
      expect(result.success).toBe(false)
      expect(result.content).toBe('')
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_SOURCE_PORT_UNSUPPORTED', severity: 'error' }))
    }
  })
})
