import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../ir'
import { targetNativeUnsupportedIssues } from './compatibility'
import { compileLoon } from '../../targets/loon/compiler'
import { compileMihomo } from '../../targets/mihomo/compiler'
import { compileShadowrocket } from '../../targets/shadowrocket/compiler'
import { compileSingBox } from '../../targets/singbox/compiler'
import type { TargetNativeSurgeDnsBehaviorIR } from './dnsBehavior'

const valid: TargetNativeSurgeDnsBehaviorIR = {
  dnsNodeId: 'dns', target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['example.com'],
}

function baseIR(target: 'mihomo' | 'loon' | 'shadowrocket' | 'sing-box'): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'g3a-cross-target', projectName: 'G3-A', projectSchemaVersion: 2 },
    sources: [], transforms: [], strategies: [], services: [], routes: [], finalRoute: { target: { kind: 'direct' } },
    outputs: [{ id: 'output', name: 'Output', target, enabled: true }],
  }
}

describe('Surge always-real-ip cross-target compatibility', () => {
  it.each(['mihomo', 'loon', 'shadowrocket', 'sing-box'] as const)('rejects retained intent for %s', (target) => {
    const issues = targetNativeUnsupportedIssues(target, [], [], [], undefined, [], undefined, undefined, 'output', baseIR(target).outputs, undefined, valid, 'dns')
    expect(issues).toContainEqual(expect.objectContaining({ target, code: 'TARGET_NATIVE_DNS_UNSUPPORTED', severity: 'error' }))
  })

  it.each([
    ['mihomo', compileMihomo], ['loon', compileLoon], ['shadowrocket', compileShadowrocket], ['sing-box', compileSingBox],
  ] as const)('compiler fails closed for retained intent on %s', (_target, compile) => {
    const result = compile(baseIR(_target), { effectiveDnsNodeId: 'dns', targetNativeSurgeDnsBehavior: valid })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_DNS_UNSUPPORTED', severity: 'error' }))
  })
})
