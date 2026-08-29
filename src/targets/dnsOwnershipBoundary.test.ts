import { describe, expect, it } from 'vitest'
import { explicitProxyIR } from '../core/__fixtures__/crossTargetFixtures'
import type { ProxyFlowIR } from '../core/ir'
import { compileLoon } from './loon/compiler'
import { compileShadowrocket } from './shadowrocket/compiler'
import { compileSingBox } from './singbox/compiler'
import { compileSurge } from './surge/compiler'

function sharedPlusMihomoRoles(): ProxyFlowIR {
  const ir = explicitProxyIR()
  ir.dns = {
    enabled: true,
    mode: 'custom',
    resolvers: [
      { id: 'shared', kind: 'doh', role: 'default', address: 'https://dns.example.com/dns-query' },
      { id: 'direct', kind: 'udp', role: 'direct', address: '192.0.2.53' },
      { id: 'fallback', kind: 'doh', role: 'fallback', address: 'https://fallback.example.com/dns-query' },
    ],
  }
  return ir
}

describe('cross-target DNS ownership boundary', () => {
  it.each([
    ['Surge', compileSurge, ['SURGE_DNS_DIRECT_RESOLVER_UNSUPPORTED', 'SURGE_DNS_FALLBACK_RESOLVER_UNSUPPORTED']],
    ['Loon', compileLoon, ['LOON_DNS_DIRECT_RESOLVER_UNSUPPORTED', 'LOON_DNS_FALLBACK_RESOLVER_UNSUPPORTED']],
    ['Shadowrocket', compileShadowrocket, ['SHADOWROCKET_DNS_ROLE_UNSUPPORTED']],
    ['sing-box', compileSingBox, ['SINGBOX_DNS_ROLE_UNSUPPORTED']],
  ] as const)('%s fails closed instead of silently dropping Mihomo resolver roles', (_target, compile, expectedCodes) => {
    const result = compile(sharedPlusMihomoRoles())
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    for (const code of expectedCodes) expect(result.issues).toContainEqual(expect.objectContaining({ code, severity: 'error' }))
  })

  it.each([
    ['Surge', compileSurge, 'SURGE_DNS_RESOLVER_ROLE_UNSUPPORTED'],
    ['Loon', compileLoon, 'LOON_DNS_RESOLVER_ROLE_UNSUPPORTED'],
    ['Shadowrocket', compileShadowrocket, 'SHADOWROCKET_DNS_ROLE_UNSUPPORTED'],
    ['sing-box', compileSingBox, 'SINGBOX_DNS_ROLE_UNSUPPORTED'],
  ] as const)('%s rejects an unclassified runtime role', (_target, compile, expectedCode) => {
    const ir = explicitProxyIR()
    ir.dns!.resolvers = [
      { id: 'shared', kind: 'udp', address: '192.0.2.53' },
      { id: 'invalid-role', kind: 'udp', role: 'mystery', address: '192.0.2.54' } as never,
    ]
    const result = compile(ir)
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: expectedCode, severity: 'error' }))
  })
})
