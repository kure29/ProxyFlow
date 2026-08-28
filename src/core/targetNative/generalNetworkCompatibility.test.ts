import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../ir'
import { targetNativeUnsupportedIssues } from './compatibility'
import type { TargetNativeSurgeGeneralNetworkIR } from './generalNetwork'
import { compileLoon } from '../../targets/loon/compiler'
import { compileMihomo } from '../../targets/mihomo/compiler'
import { compileShadowrocket } from '../../targets/shadowrocket/compiler'
import { compileSingBox } from '../../targets/singbox/compiler'

const valid: TargetNativeSurgeGeneralNetworkIR = {
  outputNodeId: 'output', target: 'surge', kind: 'general-network', ipv6: true,
}

function baseIR(target: 'mihomo' | 'loon' | 'shadowrocket' | 'sing-box' | 'surge'): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'g1-cross-target', projectName: 'G1', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [{
      kind: 'http', protocol: 'http', id: 'proxy', name: 'Proxy', server: 'proxy.example.test', port: 8080,
    }] }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'strategy', name: 'Proxy', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [],
    finalRoute: { target: { kind: 'strategy', id: 'strategy' } },
    outputs: [{ id: 'output', name: 'Output', target, enabled: true }],
  }
}

describe('Surge General Network cross-target compatibility', () => {
  it.each(['mihomo', 'loon', 'shadowrocket', 'sing-box'] as const)('classifies valid G1 intent as unsupported for %s', (target) => {
    const issues = targetNativeUnsupportedIssues(target, [], [], [], undefined, [], undefined, valid, 'output')
    expect(issues).toContainEqual(expect.objectContaining({
      target, code: 'TARGET_NATIVE_GENERAL_UNSUPPORTED', severity: 'error', entityId: 'output',
    }))
  })

  it('classifies malformed and wrong-owner runtime values without stripping them', () => {
    const malformed = { ...valid, extendedMatching: true } as never
    expect(targetNativeUnsupportedIssues('mihomo', [], [], [], undefined, [], undefined, malformed, 'output'))
      .toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_INVALID', severity: 'error' }))
    expect(targetNativeUnsupportedIssues('mihomo', [], [], [], undefined, [], undefined, valid, 'other-output'))
      .toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_OWNER_MISMATCH', severity: 'error' }))
  })

  it('requires an independently proven enabled output owner when adapters provide Universal outputs', () => {
    const mihomo = baseIR('mihomo')
    const wrongTarget = baseIR('surge')
    expect(targetNativeUnsupportedIssues('mihomo', [], [], [], undefined, [], undefined, valid, 'output', wrongTarget.outputs))
      .toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_OWNER_MISMATCH', severity: 'error' }))

    const owned = { ...mihomo, outputs: [{ ...mihomo.outputs[0], id: 'output', target: 'mihomo' as const }] }
    expect(targetNativeUnsupportedIssues('mihomo', [], [], [], undefined, [], undefined, valid, 'output', owned.outputs))
      .toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_UNSUPPORTED', severity: 'error' }))

    const duplicate = { ...owned, outputs: [...owned.outputs, { ...owned.outputs[0], name: 'Duplicate' }] }
    expect(targetNativeUnsupportedIssues('mihomo', [], [], [], undefined, [], undefined, valid, 'output', duplicate.outputs))
      .toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_OWNER_MISMATCH', severity: 'error' }))
  })

  it.each([
    ['mihomo', (ir: ProxyFlowIR, options: { outputNodeId: string; targetNativeSurgeGeneralNetwork: TargetNativeSurgeGeneralNetworkIR }) => compileMihomo(ir, options)],
    ['loon', (ir: ProxyFlowIR, options: { outputNodeId: string; targetNativeSurgeGeneralNetwork: TargetNativeSurgeGeneralNetworkIR }) => compileLoon(ir, options)],
    ['shadowrocket', (ir: ProxyFlowIR, options: { outputNodeId: string; targetNativeSurgeGeneralNetwork: TargetNativeSurgeGeneralNetworkIR }) => compileShadowrocket(ir, options)],
    ['sing-box', (ir: ProxyFlowIR, options: { outputNodeId: string; targetNativeSurgeGeneralNetwork: TargetNativeSurgeGeneralNetworkIR }) => compileSingBox(ir, options)],
  ] as const)('fails closed with empty content in the %s compiler', (target, compile) => {
    const result = compile(baseIR(target), { outputNodeId: 'output', targetNativeSurgeGeneralNetwork: valid })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_UNSUPPORTED', severity: 'error' }))
  })
})
