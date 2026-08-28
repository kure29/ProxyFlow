import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../../core/ir'
import type { TargetNativeSurgeGeneralConnectivityIR } from '../../core/targetNative'
import { compileSurge } from './compiler'

function baseIR(outputs = [{ id: 'output', name: 'Output', target: 'surge' as const, enabled: true }]): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'g2-surge', projectName: 'G2', projectSchemaVersion: 2 },
    sources: [], transforms: [], strategies: [], services: [], routes: [],
    finalRoute: { target: { kind: 'direct' } }, outputs,
  }
}

const valid = (overrides: Partial<TargetNativeSurgeGeneralConnectivityIR> = {}): TargetNativeSurgeGeneralConnectivityIR => ({
  outputNodeId: 'output', target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://example.test/ping', ...overrides,
})

function general(content: string) {
  return content.split('[General]\n')[1]?.split('\n\n[Proxy]')[0].split('\n').filter(Boolean) ?? []
}

describe('Surge General Connectivity runtime boundary', () => {
  it('emits internet-test-url exactly and composes with proxy-test-url/G1', () => {
    const result = compileSurge(baseIR(), {
      outputNodeId: 'output',
      targetNativeSurgeGeneralConnectivity: valid(),
    })
    expect(result.success).toBe(true)
    expect(general(result.content)).toEqual(['internet-test-url = https://example.test/ping'])
    const both = compileSurge(baseIR(), {
      outputNodeId: 'output',
      targetNativeSurgeGeneralConnectivity: valid(),
      targetNativeSurgeGeneralNetwork: { outputNodeId: 'output', target: 'surge', kind: 'general-network', ipv6: true },
    })
    expect(both.success).toBe(true)
    expect(general(both.content)).toEqual(['internet-test-url = https://example.test/ping', 'ipv6 = true'])
  })

  it('fails closed on malformed, unsafe, spoofed, or ambiguous runtime ownership', () => {
    for (const value of [
      { ...valid(), proxyTestUrl: 'https://bad.example.test' },
      { ...valid(), internetTestUrl: 'https://user:pass@example.test' },
      { ...valid(), testTimeout: 5 },
    ]) {
      const result = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralConnectivity: value as never })
      expect(result.success).toBe(false)
      expect(result.content).toBe('')
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_GENERAL_INVALID', severity: 'error' }))
    }
    const spoofed = compileSurge(baseIR(), { outputNodeId: 'other', targetNativeSurgeGeneralConnectivity: valid() })
    expect(spoofed.success).toBe(false)
    expect(spoofed.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH', severity: 'error' }))
    const ambiguous = compileSurge(baseIR([
      { id: 'output', name: 'A', target: 'surge', enabled: true },
      { id: 'output-b', name: 'B', target: 'surge', enabled: true },
    ]), { outputNodeId: 'output', targetNativeSurgeGeneralConnectivity: valid() })
    expect(ambiguous.success).toBe(false)
    expect(ambiguous.content).toBe('')
    expect(ambiguous.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_GENERAL_OWNER_MISMATCH', severity: 'error' }))
  })
})
