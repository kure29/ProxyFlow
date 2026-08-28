import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../../core/ir'
import type { TargetNativeSurgeDnsBehaviorIR } from '../../core/targetNative'
import { compileSurge } from './compiler'

function baseIR(): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'dns-surge', projectName: 'DNS', projectSchemaVersion: 2 },
    sources: [], transforms: [], strategies: [], services: [], routes: [],
    finalRoute: { target: { kind: 'direct' } },
    outputs: [{ id: 'output', name: 'Output', target: 'surge', enabled: true }],
  }
}

const valid = (overrides: Partial<TargetNativeSurgeDnsBehaviorIR> = {}): TargetNativeSurgeDnsBehaviorIR => ({
  dnsNodeId: 'dns', target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['example.com', '*.example.com'], ...overrides,
})

function general(content: string) {
  return content.split('[General]\n')[1]?.split('\n\n[Proxy]')[0].split('\n').filter(Boolean) ?? []
}

describe('Surge always-real-ip compiler boundary', () => {
  it('emits one ordered list entry and composes with Universal DNS independently', () => {
    const result = compileSurge(baseIR(), { effectiveDnsNodeId: 'dns', targetNativeSurgeDnsBehavior: valid({ alwaysRealIp: ['example.com', '*.example.com', 'example.com'] }) })
    expect(result.success).toBe(true)
    expect(general(result.content)).toEqual(['always-real-ip = example.com, *.example.com'])
  })

  it('fails closed for malformed runtime IR and owner mismatch', () => {
    const malformed = compileSurge(baseIR(), { effectiveDnsNodeId: 'dns', targetNativeSurgeDnsBehavior: { ...valid(), alwaysRealIp: [] } as never })
    expect(malformed.success).toBe(false)
    expect(malformed.content).toBe('')
    expect(malformed.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_DNS_INVALID', severity: 'error' }))

    const mismatch = compileSurge(baseIR(), { effectiveDnsNodeId: 'other', targetNativeSurgeDnsBehavior: valid() })
    expect(mismatch.success).toBe(false)
    expect(mismatch.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_DNS_OWNER_MISMATCH', severity: 'error' }))
  })

  it('composes with other typed General producers', () => {
    const duplicate = compileSurge(baseIR(), {
      outputNodeId: 'output', effectiveDnsNodeId: 'dns', targetNativeSurgeDnsBehavior: valid(),
      targetNativeSurgeGeneralNetwork: { outputNodeId: 'output', target: 'surge', kind: 'general-network', ipv6: true } as never,
    })
    expect(duplicate.success).toBe(true)
    expect(general(duplicate.content)).toContain('always-real-ip = example.com, *.example.com')
  })
})
