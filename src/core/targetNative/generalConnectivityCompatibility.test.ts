import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../ir'
import { targetNativeUnsupportedIssues } from './compatibility'
import { compileMihomo } from '../../targets/mihomo/compiler'
import { compileLoon } from '../../targets/loon/compiler'
import { compileShadowrocket } from '../../targets/shadowrocket/compiler'
import { compileSingBox } from '../../targets/singbox/compiler'
import type { TargetNativeSurgeGeneralConnectivityIR } from './generalConnectivity'

const valid: TargetNativeSurgeGeneralConnectivityIR = {
  outputNodeId: 'output', target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://example.test/ping',
}

function baseIR(target: 'mihomo' | 'loon' | 'shadowrocket' | 'sing-box'): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'g2-cross-target', projectName: 'G2', projectSchemaVersion: 2 },
    sources: [], transforms: [], strategies: [], services: [], routes: [],
    finalRoute: { target: { kind: 'direct' } },
    outputs: [{ id: 'output', name: 'Output', target, enabled: true }],
  }
}

describe('Surge General Connectivity cross-target compatibility', () => {
  it.each(['mihomo', 'loon', 'shadowrocket', 'sing-box'] as const)('rejects retained G2 intent for %s', (target) => {
    expect(targetNativeUnsupportedIssues(target, [], [], [], undefined, [], undefined, undefined, 'output', baseIR(target).outputs, valid)).toContainEqual(expect.objectContaining({
      target, code: 'TARGET_NATIVE_GENERAL_UNSUPPORTED', severity: 'error', feature: 'target-native-general-connectivity',
    }))
  })

  it.each([
    ['mihomo', compileMihomo], ['loon', compileLoon], ['shadowrocket', compileShadowrocket], ['sing-box', compileSingBox],
  ] as const)('compiler fails closed for retained G2 on %s', (_target, compile) => {
    const result = compile(baseIR(_target), { outputNodeId: 'output', targetNativeSurgeGeneralConnectivity: valid })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_UNSUPPORTED', severity: 'error' }))
  })
})
