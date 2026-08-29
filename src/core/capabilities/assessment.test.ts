import { describe, expect, it } from 'vitest'
import { validateIR } from '../semanticValidation'
import type { ProxyFlowIR, ResolvedProxyEndpointIR, StrategyIR } from '../ir'
import type { CompatibilityIssue } from '../../types/project'
import type { TargetNativeStrategyIR } from '../targetNative'
import { assessIntentCapability } from './assessment'

const httpProxy = (id = 'proxy-a'): ResolvedProxyEndpointIR => ({
  kind: 'http', protocol: 'http', id, name: `Proxy ${id}`, server: `${id}.example.com`, port: 8080,
})

function portableIR(target: ProxyFlowIR['outputs'][number]['target'] = 'mihomo'): ProxyFlowIR {
  return {
    version: 2,
    metadata: { projectId: 'capability-test', projectName: 'Capability Test', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'source-a', name: 'Source A', proxies: [httpProxy()] }],
    transforms: [{
      kind: 'filter', id: 'filter-a', name: 'Filter A', input: { kind: 'source', id: 'source-a' },
      include: ['Proxy'], exclude: [],
    }],
    strategies: [{ kind: 'select', id: 'select-a', name: 'Select A', candidates: [{ kind: 'transform', id: 'filter-a' }] }],
    services: [],
    routes: [{ id: 'route-a', name: 'Route A', matcher: { kind: 'domain-suffix', value: 'example.com' }, target: { kind: 'strategy', id: 'select-a' }, priority: 10 }],
    finalRoute: { target: { kind: 'direct' } },
    outputs: [{ id: 'output', name: 'Output', target, enabled: true }],
  }
}

function remoteIR(
  exportMode: 'auto' | 'remote' = 'auto',
  requestProfile: 'auto' | 'mihomo' = 'mihomo',
): ProxyFlowIR {
  const ir = portableIR('mihomo')
  ir.sources = [{
    kind: 'subscription', id: 'source-a', name: 'Source A', enabled: true,
    url: 'https://example.com/subscription', proxies: [httpProxy()],
    remote: {
      kind: 'remote-subscription', id: 'source-a', name: 'Source A', url: 'https://example.com/subscription',
      requestProfile, exportMode,
      snapshot: { id: 'snapshot-a', contentHash: 'fictional-content-hash', fetchedAt: '2026-08-29T00:00:00.000Z' },
    },
  }]
  ir.transforms = [{ kind: 'rename', id: 'rename-a', name: 'Rename A', input: { kind: 'source', id: 'source-a' }, pattern: 'Proxy', replacement: 'Node' }]
  ir.strategies = [
    { kind: 'select', id: 'direct', name: 'Direct Consumer', candidates: [{ kind: 'source', id: 'source-a' }] },
    { kind: 'auto-select', id: 'processed', name: 'Processed Consumer', source: { kind: 'transform', id: 'rename-a' } },
  ]
  ir.routes = [{ id: 'route-a', name: 'Route A', matcher: { kind: 'domain', value: 'example.com' }, target: { kind: 'strategy', id: 'direct' }, priority: 10 }]
  return ir
}

describe('intent capability assessment', () => {
  it('reports portable source, transform, strategy, and route intent as exact', async () => {
    const result = await assessIntentCapability(portableIR(), 'mihomo')

    expect(result.support).toBe('exact')
    expect(result.exactCount).toBeGreaterThanOrEqual(5)
    expect(result.degradedCount).toBe(0)
    expect(result.unsupportedCount).toBe(0)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ feature: 'source:manual-proxy', support: 'exact', entityId: 'source-a', entityType: 'source' }),
      expect.objectContaining({ feature: 'transform:filter', support: 'exact', entityId: 'filter-a', entityType: 'transform' }),
      expect.objectContaining({ feature: 'strategy:select', support: 'exact', entityId: 'select-a', entityType: 'strategy' }),
      expect.objectContaining({ feature: 'routing:domain-suffix', support: 'exact', entityId: 'route-a', entityType: 'route' }),
    ]))
  })

  it('normalizes an existing warning-only sing-box selector limitation as degraded', async () => {
    const result = await assessIntentCapability(portableIR('sing-box'), 'sing-box')

    expect(result.support).toBe('degraded')
    expect(result.degradedCount).toBeGreaterThan(0)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'SINGBOX_SELECTOR_CLASH_API_REQUIRED',
      support: 'degraded',
      entityType: 'strategy',
      entityId: 'select-a',
    }))
  })

  it('loads existing Loon compatibility evidence without reproducing its protocol rules', async () => {
    const ir = portableIR('loon')
    ;(ir.sources[0] as Extract<ProxyFlowIR['sources'][number], { kind: 'manual-proxy' }>).proxies = [{
      kind: 'socks', protocol: 'socks5', version: '5', id: 'socks-a', name: 'SOCKS A', server: 'socks.example.com', port: 1080,
    }]

    const result = await assessIntentCapability(ir, 'loon')
    expect(result.support).toBe('unsupported')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'LOON_PROXY_PROTOCOL_UNSUPPORTED', support: 'unsupported', entityId: 'socks-a', entityType: 'endpoint',
    }))
  })

  it('attributes unsupported endpoint, chain, route matcher, and rule-source capabilities', async () => {
    const surge = portableIR('surge')
    ;(surge.sources[0] as Extract<ProxyFlowIR['sources'][number], { kind: 'manual-proxy' }>).proxies = [{
      kind: 'vless', protocol: 'vless', id: 'vless-a', name: 'VLESS A', server: 'vless.example.com', port: 443,
      uuid: '00000000-0000-4000-8000-000000000001', security: 'reality', encryption: 'none', flow: 'xtls-rprx-vision',
      tls: { enabled: true, serverName: 'vless.example.com', reality: { publicKey: 'A'.repeat(43) } },
    }]
    const surgeResult = await assessIntentCapability(surge, 'surge')
    expect(surgeResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'SURGE_PROXY_PROTOCOL_UNSUPPORTED', support: 'unsupported', entityType: 'endpoint', entityId: 'vless-a',
    }))

    const shadowrocket = portableIR('shadowrocket')
    shadowrocket.strategies.push(
      { kind: 'fixed', id: 'fixed-a', name: 'Fixed A', proxyId: 'proxy-a' },
      { kind: 'fixed', id: 'fixed-b', name: 'Fixed B', proxyId: 'proxy-a' },
      { kind: 'chain', id: 'chain-a', name: 'Chain A', hops: [{ kind: 'strategy', id: 'fixed-a' }, { kind: 'strategy', id: 'fixed-b' }] },
    )
    shadowrocket.routes[0].target = { kind: 'strategy', id: 'chain-a' }
    const shadowrocketResult = await assessIntentCapability(shadowrocket, 'shadowrocket')
    expect(shadowrocketResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'SHADOWROCKET_PROXY_CHAIN_UNPROVEN', support: 'unsupported', entityType: 'chain', entityId: 'chain-a',
    }))

    const singBox = portableIR('sing-box')
    singBox.routes[0].matcher = { kind: 'geo-ip', countryCode: 'US' }
    const singBoxResult = await assessIntentCapability(singBox, 'sing-box')
    expect(singBoxResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'SINGBOX_MATCHER_UNSUPPORTED', support: 'unsupported', entityType: 'route', entityId: 'route-a',
    }))

    const mihomo = portableIR('mihomo')
    mihomo.services = [{ id: 'service-a', name: 'Service A', ruleSources: [{ id: 'rules-a', provider: 'remote', format: 'sing-box-binary', url: 'https://example.com/rules.srs' }] }]
    mihomo.routes[0].matcher = { kind: 'rule-set', id: 'rules-a' }
    const mihomoResult = await assessIntentCapability(mihomo, 'mihomo', { compatibilityIssues: [] })
    expect(mihomoResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED', support: 'unsupported', entityType: 'route', entityId: 'route-a',
    }))
  })

  it('keeps a Surge-native strategy native-only for Surge and unsupported for a non-owner', async () => {
    const nativeStrategy: TargetNativeStrategyIR = {
      id: 'surge-smart', name: 'Surge Smart', target: 'surge', kind: 'smart',
      members: [{ kind: 'proxy', id: 'proxy-a' }],
    }
    const targetOptions = { targetNativeStrategies: [nativeStrategy] }

    const surge = await assessIntentCapability(portableIR('surge'), 'surge', { targetOptions })
    expect(surge.support).toBe('native-only')
    expect(surge.nativeOnlyCount).toBe(1)
    expect(surge.diagnostics).toContainEqual(expect.objectContaining({
      code: 'CAPABILITY_NATIVE_ONLY', support: 'native-only', entityType: 'strategy', entityId: 'surge-smart',
    }))

    const mihomo = await assessIntentCapability(portableIR('mihomo'), 'mihomo', { targetOptions })
    expect(mihomo.support).toBe('unsupported')
    expect(mihomo.diagnostics).toContainEqual(expect.objectContaining({
      code: 'TARGET_NATIVE_STRATEGY_UNSUPPORTED', support: 'unsupported', entityId: 'surge-smart',
    }))
  })

  it('keeps malformed native runtime data diagnosable instead of throwing', async () => {
    const result = await assessIntentCapability(portableIR('surge'), 'surge', {
      targetOptions: { targetNativeStrategies: [{ id: 42 } as unknown as TargetNativeStrategyIR] },
    })

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'TARGET_NATIVE_STRATEGY_INVALID', support: 'unsupported', entityType: 'strategy',
    }))
  })

  it('does not confuse a target-native lowering primitive with native-only intent', async () => {
    const ir = portableIR('mihomo')
    ir.strategies = [{
      kind: 'load-balance', id: 'balance-a', name: 'Balance A',
      source: { kind: 'transform', id: 'filter-a' }, mode: 'round-robin',
    }]
    ir.routes[0].target = { kind: 'strategy', id: 'balance-a' }

    const result = await assessIntentCapability(ir, 'mihomo')
    expect(result.support).toBe('exact')
    expect(result.nativeOnlyCount).toBe(0)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      feature: 'strategy:load-balance', support: 'exact', entityId: 'balance-a',
    }))
  })

  it('assesses native-remote and materialized branches independently', async () => {
    const result = await assessIntentCapability(remoteIR(), 'mihomo')
    const remotePaths = result.diagnostics.filter((diagnostic) => diagnostic.feature.startsWith('remote-source:'))

    expect(remotePaths).toEqual([
      expect.objectContaining({
        feature: 'remote-source:native-remote', support: 'exact', entityId: 'direct',
        path: 'source:source-a>consumer:direct',
      }),
      expect.objectContaining({
        feature: 'remote-source:materialized', support: 'exact', entityId: 'processed',
        path: 'source:source-a>transform:rename-a>consumer:processed',
      }),
    ])
  })

  it('degrades a native remote path when Auto request fallback cannot be preserved', async () => {
    const result = await assessIntentCapability(remoteIR('auto', 'auto'), 'mihomo')

    expect(result.support).toBe('degraded')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'REMOTE_REQUEST_FALLBACK_NOT_PORTABLE',
      support: 'degraded',
      entityId: 'direct',
      path: 'source:source-a>consumer:direct',
    }))
  })

  it('reports a forced remote processed path as unsupported instead of silently degrading it', async () => {
    const result = await assessIntentCapability(remoteIR('remote'), 'mihomo')

    expect(result.support).toBe('unsupported')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED',
      support: 'unsupported',
      entityId: 'processed',
      path: 'source:source-a>transform:rename-a>consumer:processed',
    }))
  })

  it('sorts and deduplicates diagnostics deterministically', async () => {
    const ir = portableIR()
    ir.routes.push({ id: 'route-b', name: 'Route B', matcher: { kind: 'domain', value: 'b.example.com' }, target: { kind: 'strategy', id: 'select-a' }, priority: 20 })
    const issues: CompatibilityIssue[] = [
      { target: 'mihomo', code: 'TEST_ROUTE_DEGRADED', severity: 'warning', feature: 'route', message: 'Route evidence.', entityId: 'route-b' },
      { target: 'mihomo', code: 'TEST_SOURCE_UNSUPPORTED', severity: 'error', feature: 'source', message: 'Source evidence.', entityId: 'source-a' },
      { target: 'mihomo', code: 'TEST_ROUTE_DEGRADED', severity: 'warning', feature: 'route', message: 'Route evidence.', entityId: 'route-b' },
    ]
    const first = await assessIntentCapability(ir, 'mihomo', { compatibilityIssues: issues })
    const reordered = structuredClone(ir)
    reordered.routes.reverse()
    reordered.strategies.reverse()
    const second = await assessIntentCapability(reordered, 'mihomo', { compatibilityIssues: [...issues].reverse() })

    expect(second).toEqual(first)
    expect(first.diagnostics.filter((diagnostic) => diagnostic.code === 'TEST_ROUTE_DEGRADED')).toHaveLength(1)
  })

  it('keeps semantic validity outside capability assessment', async () => {
    const ir = portableIR()
    ;(ir.sources[0] as Extract<ProxyFlowIR['sources'][number], { kind: 'manual-proxy' }>).proxies = [{
      kind: 'vless', protocol: 'vless', id: 'invalid-vless', name: 'Invalid VLESS', server: 'vless.example.com', port: 443,
      uuid: 'not-a-uuid', encryption: 'none',
    }]

    expect(validateIR(ir).map((issue) => issue.code)).toContain('PROXY_UUID_INVALID')
    const capability = await assessIntentCapability(ir, 'mihomo', { compatibilityIssues: [] })
    expect(capability.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('PROXY_UUID_INVALID')
  })

  it('uses the existing strategy declarations rather than target syntax for unsupported behavior', async () => {
    const ir = portableIR('sing-box')
    const fallback: StrategyIR = {
      kind: 'fallback', id: 'fallback-a', name: 'Fallback A', candidates: [{ kind: 'source', id: 'source-a' }],
    }
    ir.strategies = [fallback]
    ir.routes[0].target = { kind: 'strategy', id: fallback.id }

    const result = await assessIntentCapability(ir, 'sing-box')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'SINGBOX_STRATEGY_FALLBACK_UNSUPPORTED', support: 'unsupported', entityId: 'fallback-a',
    }))
  })
})
