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
    const second = { ...sourcePortRoute({ kind: 'reject' }), id: 'source-port-second', name: 'Second', targetNativeSourcePort: { ...sourcePortRoute({ kind: 'reject' }).targetNativeSourcePort!, routeId: 'source-port-second' } }
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
