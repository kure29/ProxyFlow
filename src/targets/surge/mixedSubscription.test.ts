import { describe, expect, it } from 'vitest'
import mixedSubscription from '../../../fixtures/subscriptions/surge-mixed-realistic.yaml?raw'
import {
  PROXYFLOW_IR_VERSION,
  type ProxyFlowIR,
  type ResolvedProxyEndpointIR,
} from '../../core/ir'
import { parseSubscription } from '../../core/subscription'
import { compileSurge } from './compiler'

const parsed = parseSubscription(mixedSubscription, {
  sourceId: 'mixed-source',
  sourceName: 'Realistic mixed fixture',
})

function fixtureIR(
  proxies: ResolvedProxyEndpointIR[] = parsed.proxies,
  sourceRef: { kind: 'source'; id: string } | { kind: 'transform'; id: string } = { kind: 'source', id: 'mixed-source' },
): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'surge-mixed', projectName: 'Surge Mixed', projectSchemaVersion: 2 },
    sources: [{ kind: 'subscription', id: 'mixed-source', name: 'Realistic mixed fixture', enabled: true, proxies }],
    transforms: sourceRef.kind === 'transform' ? [{
      kind: 'filter', id: sourceRef.id, name: 'Hong Kong', input: { kind: 'source', id: 'mixed-source' },
      include: [], exclude: [], criterion: { mode: 'region', operation: 'include', regions: ['HK'] },
    }] : [],
    strategies: [{ kind: 'auto-select', id: 'auto', name: 'Auto', source: sourceRef }],
    services: [],
    routes: [],
    finalRoute: { target: { kind: 'strategy', id: 'auto' } },
    outputs: [{ id: 'surge-output', name: 'Surge', target: 'surge', enabled: true }],
  }
}

function expectProjection(result: ReturnType<typeof compileSurge>, expected: {
  compatible: number
  total: number
  skipped: number
  blocking: number
}) {
  expect(result.stats).toEqual(expect.objectContaining({
    compatibleEndpointCount: expected.compatible,
    candidateCount: expected.total,
    skippedEndpointCount: expected.skipped,
    blockingIssueCount: expected.blocking,
  }))
}

describe('Surge realistic mixed subscription projection', () => {
  it('parses the synthetic fixture without real hosts or credentials', () => {
    expect(parsed.detectedCount).toBe(30)
    expect(parsed.proxies).toHaveLength(30)
    expect(mixedSubscription).not.toMatch(/(?<!example)\.(?:com|net|org)\b/)
  })

  it('A: exports a mixed pool with only its 18 compatible members', () => {
    const result = compileSurge(fixtureIR())

    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expectProjection(result, { compatible: 18, total: 30, skipped: 12, blocking: 0 })
    expect(result.content.match(/^Auto = url-test, (.+)$/m)?.[1].split(', ').filter((member) => !member.includes('='))).toHaveLength(18)
    expect(result.issues.filter((issue) => issue.severity === 'warning').length).toBeLessThan(12)
  })

  it('B: projects only the ten candidates materialized by the HK filter', () => {
    const result = compileSurge(fixtureIR(parsed.proxies, { kind: 'transform', id: 'hk-filter' }))

    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expectProjection(result, { compatible: 7, total: 10, skipped: 3, blocking: 0 })
    expect(result.content).not.toContain('US Plain SS A')
  })

  it('C: ignores an unreferenced inventory of unsupported VLESS endpoints', () => {
    const supported = parsed.proxies.filter((proxy) => ['HK Plain SS', 'HK Trojan', 'HK SOCKS5', 'HK Hysteria2', 'HK TUIC'].includes(proxy.name))
    const vless = parsed.proxies.find((proxy) => proxy.name === 'HK VLESS')!
    const ir = fixtureIR(supported, { kind: 'source', id: 'supported-source' })
    ir.sources = [
      { kind: 'subscription', id: 'unused-source', name: 'Unused VLESS inventory', enabled: true, proxies: Array.from({ length: 100 }, (_, index) => ({ ...vless, id: `${vless.id}-${index}`, name: `Unused, VLESS ${index + 1}` })) },
      { kind: 'subscription', id: 'supported-source', name: 'Supported source', enabled: true, proxies: supported },
    ]

    const result = compileSurge(ir)
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expectProjection(result, { compatible: 5, total: 5, skipped: 0, blocking: 0 })
    expect(result.issues.map((issue) => issue.code)).not.toContain('SURGE_POLICY_NAME_UNSAFE')
  })

  it('deduplicates projection totals when more than one strategy reuses the same pool', () => {
    const ir = fixtureIR()
    ir.strategies.push({
      kind: 'select', id: 'manual', name: 'Manual', candidates: [{ kind: 'source', id: 'mixed-source' }],
    })

    const result = compileSurge(ir)
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expectProjection(result, { compatible: 18, total: 30, skipped: 12, blocking: 0 })
  })

  it('blocks conflicting projected endpoints that reuse the same id', () => {
    const first = parsed.proxies.find((proxy) => proxy.name === 'HK Plain SS')!
    const second = parsed.proxies.find((proxy) => proxy.name === 'US Plain SS A')!
    const result = compileSurge(fixtureIR([first, { ...second, id: first.id }]))

    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'SURGE_PROXY_ID_DUPLICATE', severity: 'error',
    }))
    expectProjection(result, { compatible: 2, total: 2, skipped: 0, blocking: 1 })
  })

  it('D: blocks an explicit Fixed strategy that names VLESS', () => {
    const vless = parsed.proxies.find((proxy) => proxy.name === 'HK VLESS')!
    const ir = fixtureIR()
    ir.strategies = [{ kind: 'fixed', id: 'fixed', name: 'Exact VLESS', proxyId: vless.id }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'fixed' } }

    const result = compileSurge(ir)
    expect(result.success).toBe(false)
    expectProjection(result, { compatible: 0, total: 1, skipped: 0, blocking: 1 })
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'SURGE_PROXY_PROTOCOL_UNSUPPORTED', severity: 'error', entityId: vless.id,
    }))
  })

  it('E: blocks a pool when projection leaves no compatible members', () => {
    const unsupported = parsed.proxies.filter((proxy) => /VMess|VLESS|V2Ray|gRPC/.test(proxy.name))
    expect(unsupported).toHaveLength(12)

    const result = compileSurge(fixtureIR(unsupported))
    expect(result.success).toBe(false)
    expectProjection(result, { compatible: 0, total: 12, skipped: 12, blocking: 1 })
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'SURGE_STRATEGY_NO_COMPATIBLE_MEMBERS', severity: 'error', entityId: 'auto',
    }))
  })

  it('does not validate policy names for endpoints excluded by projection', () => {
    const supported = parsed.proxies.find((proxy) => proxy.name === 'HK Plain SS')!
    const vless = parsed.proxies.find((proxy) => proxy.name === 'HK VLESS')!
    const result = compileSurge(fixtureIR([supported, { ...vless, name: 'DIRECT' }]))

    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expectProjection(result, { compatible: 1, total: 2, skipped: 1, blocking: 0 })
    expect(result.issues.map((issue) => issue.code)).not.toContain('SURGE_POLICY_NAME_RESERVED')
  })

  it('does not double-count one pool referenced more than once', () => {
    const ir = fixtureIR()
    ir.strategies = [{
      kind: 'select', id: 'select', name: 'Select',
      candidates: [{ kind: 'source', id: 'mixed-source' }, { kind: 'source', id: 'mixed-source' }],
    }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'select' } }

    const result = compileSurge(ir)
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expectProjection(result, { compatible: 18, total: 30, skipped: 12, blocking: 0 })
    expect(result.content.match(/^Select = select, (.+)$/m)?.[1].split(', ')).toHaveLength(18)
  })

  it('keeps emitted counts at zero when compatible projection is blocked', () => {
    const first = parsed.proxies.find((proxy) => proxy.name === 'HK Plain SS')!
    const second = parsed.proxies.find((proxy) => proxy.name === 'US Plain SS A')!
    const result = compileSurge(fixtureIR([first, { ...second, id: first.id }]))

    expect(result.success).toBe(false)
    expect(result.stats).toEqual(expect.objectContaining({
      proxyCount: 0,
      endpointCount: 0,
      compatibleEndpointCount: 2,
    }))
  })
})
