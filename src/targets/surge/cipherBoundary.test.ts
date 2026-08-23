import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type ResolvedProxyEndpointIR } from '../../core/ir'
import { parseSubscription } from '../../core/subscription'
import { compileMihomo } from '../mihomo'
import { compileSingBox } from '../singbox'
import { compileSurge } from './compiler'

const surgeOnlyMethods = ['rc4', 'salsa20', 'chacha20'] as const

function projectIR(proxies: ResolvedProxyEndpointIR[]): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'surge-cipher-boundary', projectName: 'Surge Cipher Boundary', projectSchemaVersion: 2 },
    sources: [{ kind: 'subscription', id: 'source', name: 'Cipher Fixture', enabled: true, proxies }],
    transforms: [],
    strategies: [{ kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' } }],
    services: [],
    routes: [],
    finalRoute: { target: { kind: 'strategy', id: 'auto' } },
    outputs: [{ id: 'surge-output', name: 'Surge', target: 'surge', enabled: true }],
  }
}

function parseFixture(format: 'sip002' | 'clash') {
  const input = format === 'sip002'
    ? surgeOnlyMethods.map((method) => `ss://${method}:fixture-password@${method}.example.invalid:8388#${method}`).join('\n')
    : `proxies:\n${surgeOnlyMethods.map((method) => `  - { name: ${method}, type: ss, server: ${method}.example.invalid, port: 8388, cipher: ${method}, password: fixture-password }`).join('\n')}`
  return parseSubscription(input, { sourceId: 'source', sourceName: 'Cipher Fixture' })
}

describe('Surge Shadowsocks cipher boundary', () => {
  it.each(['sip002', 'clash'] as const)('keeps Surge-native methods through the %s parser and compiler', (format) => {
    const parsed = parseFixture(format)

    expect(parsed.proxies.map((proxy) => proxy.protocol === 'shadowsocks' ? proxy.method : undefined)).toEqual(surgeOnlyMethods)
    expect(parsed).toEqual(expect.objectContaining({ detectedCount: 3, readyCount: 3, unsupportedCount: 0 }))

    const result = compileSurge(projectIR(parsed.proxies))
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    for (const method of surgeOnlyMethods) expect(result.content).toContain(`encrypt-method=${method}`)
  })

  it.each(surgeOnlyMethods)('rejects %s target-locally for Mihomo and sing-box', (method) => {
    const parsed = parseSubscription(
      `ss://${method}:fixture-password@${method}.example.invalid:8388#${method}`,
      { sourceId: 'source', sourceName: 'Cipher Fixture' },
    )
    const ir = projectIR(parsed.proxies)

    const mihomo = compileMihomo(ir)
    expect(mihomo).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(mihomo.issues.map((issue) => issue.code)).toContain('MIHOMO_SHADOWSOCKS_METHOD_UNSUPPORTED')
    expect(mihomo.issues.map((issue) => issue.code)).not.toContain('IR_PROXY_CIPHER_UNSUPPORTED')

    const singBox = compileSingBox(ir)
    expect(singBox).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(singBox.issues.map((issue) => issue.code)).toContain('SINGBOX_SHADOWSOCKS_METHOD_UNSUPPORTED')
    expect(singBox.issues.map((issue) => issue.code)).not.toContain('IR_PROXY_CIPHER_UNSUPPORTED')
  })
})
