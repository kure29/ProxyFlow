import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../ir'
import { compileLoon } from '../../targets/loon/compiler'
import { compileMihomo } from '../../targets/mihomo/compiler'
import { compileShadowrocket } from '../../targets/shadowrocket/compiler'
import { compileSingBox } from '../../targets/singbox/compiler'
import { targetNativeUnsupportedIssues } from './compatibility'
import type { TargetNativeSurgeGeneralProxyBypassIR } from './generalProxyBypass'

const valid: TargetNativeSurgeGeneralProxyBypassIR = { outputNodeId: 'output', target: 'surge', kind: 'general-proxy-bypass', skipProxy: ['localhost'], excludeSimpleHostnames: false }
function baseIR(target: 'mihomo' | 'loon' | 'shadowrocket' | 'sing-box'): ProxyFlowIR {
  return { version: PROXYFLOW_IR_VERSION, metadata: { projectId: 'g3c-cross-target', projectName: 'G3-C', projectSchemaVersion: 2 }, sources: [], transforms: [], strategies: [], services: [], routes: [], finalRoute: { target: { kind: 'direct' } }, outputs: [{ id: 'output', name: 'Output', target, enabled: true }] }
}

describe('Surge G3-C cross-target compatibility', () => {
  it.each(['mihomo', 'loon', 'shadowrocket', 'sing-box'] as const)('retains intent but fails closed for %s', (target) => {
    expect(targetNativeUnsupportedIssues(target, [], [], [], undefined, [], undefined, undefined, 'output', baseIR(target).outputs, undefined, undefined, undefined, valid)).toContainEqual(expect.objectContaining({ target, code: 'TARGET_NATIVE_PROXY_BYPASS_UNSUPPORTED', severity: 'error', feature: 'target-native-proxy-bypass' }))
  })

  it.each([
    ['mihomo', compileMihomo], ['loon', compileLoon], ['shadowrocket', compileShadowrocket], ['sing-box', compileSingBox],
  ] as const)('compiler emits no content for retained G3-C on %s', (_target, compile) => {
    const result = compile(baseIR(_target), { outputNodeId: 'output', targetNativeSurgeGeneralProxyBypass: valid })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_PROXY_BYPASS_UNSUPPORTED', severity: 'error' }))
  })
})
