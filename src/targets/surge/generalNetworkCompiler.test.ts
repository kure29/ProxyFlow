import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../../core/ir'
import type { TargetNativeSurgeGeneralNetworkIR } from '../../core/targetNative'
import { compileSurge } from './compiler'

function baseIR(): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'g1', projectName: 'G1', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [{
      kind: 'http', protocol: 'http', id: 'proxy', name: 'Proxy', server: 'proxy.example.test', port: 8080,
    }] }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'strategy', name: 'Manual', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [],
    finalRoute: { target: { kind: 'strategy', id: 'strategy' } },
    outputs: [{ id: 'output', name: 'Surge Output', target: 'surge', enabled: true }],
  }
}

const network = (overrides: Partial<TargetNativeSurgeGeneralNetworkIR> = {}): TargetNativeSurgeGeneralNetworkIR => ({
  outputNodeId: 'output', target: 'surge', kind: 'general-network', ...overrides,
})

function generalLines(content: string) {
  const lines = content.split('\n')
  const start = lines.indexOf('[General]')
  const end = lines.findIndex((line, index) => index > start && line.startsWith('['))
  return lines.slice(start + 1, end < 0 ? lines.length : end).filter(Boolean)
}

describe('Surge General Network runtime/compiler boundary', () => {
  it.each([
    ['ipv6 true', { ipv6: true }, 'ipv6 = true'],
    ['ipv6 false', { ipv6: false }, 'ipv6 = false'],
    ['VIF disabled', { ipv6Vif: 'disabled' }, 'ipv6-vif = disabled'],
    ['VIF auto', { ipv6Vif: 'auto' }, 'ipv6-vif = auto'],
    ['VIF always', { ipv6Vif: 'always' }, 'ipv6-vif = always'],
    ['ICMP enabled', { icmpForwarding: true }, 'icmp-forwarding = true'],
    ['ICMP disabled', { icmpForwarding: false }, 'icmp-forwarding = false'],
  ] as const)('serializes %s exactly', (_name, values, expected) => {
    const result = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network(values) })
    expect(result.success, result.issues.map((issue) => issue.message).join('\n')).toBe(true)
    expect(generalLines(result.content)).toEqual([expected])
  })

  it('omits all unset G1 values and preserves independent combinations', () => {
    const unset = compileSurge(baseIR(), { outputNodeId: 'output' })
    expect(unset.success).toBe(true)
    expect(generalLines(unset.content)).toEqual([])

    const combinations = [
      { ipv6: false, ipv6Vif: 'auto' as const },
      { ipv6: false, ipv6Vif: 'always' as const },
      { ipv6: true, ipv6Vif: 'disabled' as const },
    ]
    for (const values of combinations) {
      const result = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network(values) })
      expect(result.success).toBe(true)
      expect(generalLines(result.content)).toEqual(Object.entries(values).map(([key, value]) => `${key === 'ipv6Vif' ? 'ipv6-vif' : key} = ${value}`))
    }
  })

  it('orders G1 between health and DNS entries', () => {
    const ir = baseIR()
    ir.strategies = [{ kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' }, healthCheck: { url: 'https://example.test/ping' } }]
    ir.finalRoute = { target: { kind: 'strategy', id: 'auto' } }
    ir.dns = { enabled: true, mode: 'custom', resolvers: [{ id: 'dns', name: 'DNS', kind: 'udp', role: 'default', address: '1.1.1.1' }] }
    const result = compileSurge(ir, { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network({ ipv6: true, ipv6Vif: 'auto', icmpForwarding: false }) })
    expect(result.success, result.issues.map((issue) => issue.message).join('\n')).toBe(true)
    expect(generalLines(result.content)).toEqual([
      'proxy-test-url = https://example.test/ping',
      'ipv6 = true',
      'ipv6-vif = auto',
      'icmp-forwarding = false',
      'dns-server = 1.1.1.1',
    ])
  })

  it('lowers VIF route controls after G1 fields and preserves specificity overlap', () => {
    const result = compileSurge(baseIR(), {
      outputNodeId: 'output',
      targetNativeSurgeGeneralNetwork: network({
        ipv6: false,
        ipv6Vif: 'auto',
        tunExcludedRoutes: ['10.0.0.0/8'],
        tunIncludedRoutes: ['10.1.0.0/16'],
      }),
    })
    expect(result.success).toBe(true)
    expect(generalLines(result.content)).toEqual([
      'ipv6 = false', 'ipv6-vif = auto', 'tun-excluded-routes = 10.0.0.0/8', 'tun-included-routes = 10.1.0.0/16',
    ])
  })

  it('rejects equal-prefix conflicts and enforces IPv6 VIF dependency', () => {
    const conflict = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network({ tunExcludedRoutes: ['10.0.0.0/8'], tunIncludedRoutes: ['10.0.0.0/8'] }) })
    expect(conflict.success).toBe(false)
    expect(conflict.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_GENERAL_VIF_CROSS_LIST_CONFLICT' }))
    const missing = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network({ tunIncludedRoutes: ['2001:db8::/32'] }) })
    expect(missing.success).toBe(false)
    expect(missing.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_GENERAL_VIF_IPV6_VIF_REQUIRED' }))
    const conditional = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network({ ipv6: false, ipv6Vif: 'auto', tunIncludedRoutes: ['2001:db8::/32'] }) })
    expect(conditional.success).toBe(true)
    expect(conditional.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_GENERAL_VIF_IPV6_VIF_CONDITIONAL', severity: 'warning' }))
  })

  it('warns only for broad RFC1918 included ranges', () => {
    for (const route of ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']) {
      const result = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network({ tunIncludedRoutes: [route] }) })
      expect(result.success).toBe(true)
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_GENERAL_VIF_PRIVATE_RANGE', severity: 'warning' }))
    }
    for (const route of ['192.168.1.0/24', '192.168.1.100/32']) {
      const result = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network({ tunIncludedRoutes: [route] }) })
      expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'SURGE_GENERAL_VIF_PRIVATE_RANGE' }))
    }
  })

  it('fails closed for malformed runtime values, legacy off, and owner mismatch', () => {
    const malformed = network({ ipv6: true, extendedMatching: true } as never)
    const malformedResult = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: malformed })
    expect(malformedResult).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(malformedResult.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_GENERAL_INVALID', severity: 'error' }))

    const legacy = network({ ipv6Vif: 'off' } as never)
    const legacyResult = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: legacy })
    expect(legacyResult.success).toBe(false)
    expect(legacyResult.content).toBe('')
    expect(legacyResult.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_GENERAL_INVALID' }))

    const owner = compileSurge(baseIR(), { outputNodeId: 'other-output', targetNativeSurgeGeneralNetwork: network({ ipv6: true }) })
    expect(owner.success).toBe(false)
    expect(owner.content).toBe('')
    expect(owner.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH' }))
  })

  it('does not throw when runtime IR outputs are malformed', () => {
    const ir = baseIR() as unknown as { outputs: unknown }
    ir.outputs = [{ id: 'output', name: 'Malformed', target: 'surge', enabled: 'yes' }]
    const result = compileSurge(ir as ProxyFlowIR, { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network({ ipv6: true }) })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH' }))

    ir.outputs = [null]
    const nullResult = compileSurge(ir as ProxyFlowIR, { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: network({ ipv6: true }) })
    expect(nullResult.success).toBe(false)
    expect(nullResult.content).toBe('')
    expect(nullResult.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_IR_VALIDATION_EXCEPTION', severity: 'error' }))
  })
})
