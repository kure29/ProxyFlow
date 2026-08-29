import { describe, expect, it } from 'vitest'
import type { DnsIR, DnsResolverIR } from '../ir'
import { projectDnsOwnership } from './ownership'

describe('DNS ownership projection', () => {
  it('keeps absent, disabled and automatic Shared intent distinct without inventing resolvers', () => {
    expect(projectDnsOwnership(undefined).shared).toBeUndefined()
    expect(projectDnsOwnership({ enabled: false, mode: 'custom', resolvers: [] }).shared).toBeUndefined()
    expect(projectDnsOwnership({ enabled: true, mode: 'automatic', resolvers: [{ id: 'ignored', kind: 'udp', address: '1.1.1.1' }] })).toEqual({
      shared: { enabled: true, mode: 'automatic' },
      targetSpecific: { mihomo: { directResolvers: [], fallbackResolvers: [] } },
    })
  })

  it('preserves Shared transport and resolver order while projecting Mihomo roles', () => {
    const resolvers: DnsResolverIR[] = [
      { id: 'system', kind: 'system', role: 'default', name: 'System', address: 'system' },
      { id: 'direct-a', kind: 'udp', role: 'direct', address: '192.0.2.53' },
      { id: 'doh', kind: 'doh', address: 'https://dns.example/dns-query' },
      { id: 'fallback-a', kind: 'dot', role: 'fallback', address: 'tls://dns.example' },
      { id: 'udp', kind: 'udp', role: 'default', address: '1.1.1.1' },
      { id: 'direct-b', kind: 'doh', role: 'direct', address: 'https://direct.example/dns-query' },
    ]
    const dns: DnsIR = { enabled: true, mode: 'custom', resolvers }
    const before = structuredClone(dns)

    expect(projectDnsOwnership(dns)).toEqual({
      shared: {
        enabled: true,
        mode: 'custom',
        resolvers: [
          { id: 'system', kind: 'system', name: 'System', address: 'system' },
          { id: 'doh', kind: 'doh', address: 'https://dns.example/dns-query' },
          { id: 'udp', kind: 'udp', address: '1.1.1.1' },
        ],
      },
      targetSpecific: {
        mihomo: {
          directResolvers: [
            { id: 'direct-a', kind: 'udp', address: '192.0.2.53' },
            { id: 'direct-b', kind: 'doh', address: 'https://direct.example/dns-query' },
          ],
          fallbackResolvers: [
            { id: 'fallback-a', kind: 'dot', address: 'tls://dns.example' },
          ],
        },
      },
    })
    expect(dns).toEqual(before)
  })

  it('preserves duplicate Shared resolvers for the existing validation boundary', () => {
    const duplicate: DnsResolverIR = { id: 'duplicate', kind: 'doh', address: 'https://dns.example/dns-query' }
    const ownership = projectDnsOwnership({ enabled: true, mode: 'custom', resolvers: [duplicate, { ...duplicate }] })
    expect(ownership.shared?.resolvers).toHaveLength(2)
  })

  it('does not reclassify an invalid runtime role as Shared intent', () => {
    const invalid = { id: 'invalid-role', kind: 'udp', role: 'mystery', address: '192.0.2.53' } as unknown as DnsResolverIR
    expect(projectDnsOwnership({ enabled: true, mode: 'custom', resolvers: [invalid] })).toEqual({
      shared: { enabled: true, mode: 'custom', resolvers: [] },
      targetSpecific: { mihomo: { directResolvers: [], fallbackResolvers: [] } },
    })
  })
})
