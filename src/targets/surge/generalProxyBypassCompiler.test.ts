import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../../core/ir'
import type { TargetNativeSurgeGeneralProxyBypassIR } from '../../core/targetNative'
import { compileSurge } from './compiler'

function baseIR(outputs = [{ id: 'output', name: 'Output', target: 'surge' as const, enabled: true }]): ProxyFlowIR {
  return { version: PROXYFLOW_IR_VERSION, metadata: { projectId: 'g3c-surge', projectName: 'G3-C', projectSchemaVersion: 2 }, sources: [], transforms: [], strategies: [], services: [], routes: [], finalRoute: { target: { kind: 'direct' } }, outputs }
}

const valid = (overrides: Partial<TargetNativeSurgeGeneralProxyBypassIR> = {}): TargetNativeSurgeGeneralProxyBypassIR => ({ outputNodeId: 'output', target: 'surge', kind: 'general-proxy-bypass', skipProxy: ['apple.com', '*apple.com', 'localhost', '192.168.2.0/24'], excludeSimpleHostnames: false, ...overrides })

function general(content: string) { return content.split('[General]\n')[1]?.split('\n\n[Proxy]')[0].split('\n').filter(Boolean) ?? [] }

describe('Surge G3-C compiler boundary', () => {
  it('validates provenance and emits typed General entries', () => {
    const result = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralProxyBypass: valid() })
    expect(result.success).toBe(true)
    expect(general(result.content)).toEqual(['skip-proxy = apple.com, *apple.com, localhost, 192.168.2.0/24', 'exclude-simple-hostnames = false'])
  })

  it('fails closed for malformed, spoofed, and ambiguous runtime owners', () => {
    const malformed = compileSurge(baseIR(), { outputNodeId: 'output', targetNativeSurgeGeneralProxyBypass: { ...valid(), skipProxy: ['bad value'] } as never })
    expect(malformed.success).toBe(false)
    expect(malformed.content).toBe('')
    expect(malformed.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_PROXY_BYPASS_HOST_INVALID', severity: 'error' }))
    const spoofed = compileSurge(baseIR(), { outputNodeId: 'other', targetNativeSurgeGeneralProxyBypass: valid() })
    expect(spoofed.success).toBe(false)
    expect(spoofed.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_PROXY_BYPASS_OWNER_MISMATCH', severity: 'error' }))
    const ambiguous = compileSurge(baseIR([{ id: 'output', name: 'A', target: 'surge', enabled: true }, { id: 'output-b', name: 'B', target: 'surge', enabled: true }]), { outputNodeId: 'output', targetNativeSurgeGeneralProxyBypass: valid() })
    expect(ambiguous.success).toBe(false)
    expect(ambiguous.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_PROXY_BYPASS_OWNER_MISMATCH', severity: 'error' }))
  })
})
