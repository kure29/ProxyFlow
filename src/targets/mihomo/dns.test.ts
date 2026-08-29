import { describe, expect, it } from 'vitest'
import type { DnsIR } from '../../core/ir'
import {
  compileMihomoDns,
  deriveMihomoDnsDefaults,
  resolveMihomoDnsOwnership,
} from './dns'

describe('Mihomo DNS ownership', () => {
  it('centralizes Shared and target-specific DNS gates with Shared absence taking precedence', () => {
    expect(resolveMihomoDnsOwnership(undefined, { dnsMode: 'fake-ip', ipv6: true })).toEqual(expect.objectContaining({
      shared: undefined,
      dnsMode: 'fake-ip',
      ipv6: true,
      gate: 'shared-disabled',
    }))
    expect(resolveMihomoDnsOwnership(
      { enabled: false, mode: 'custom', resolvers: [] },
      { dnsMode: 'disabled', ipv6: false },
    ).gate).toBe('shared-disabled')
    expect(resolveMihomoDnsOwnership(
      { enabled: true, mode: 'automatic' },
      { dnsMode: 'disabled', ipv6: false },
    ).gate).toBe('target-disabled')
    expect(resolveMihomoDnsOwnership(
      { enabled: true, mode: 'automatic' },
      { dnsMode: 'redir-host', ipv6: false },
    ).gate).toBe('enabled')
  })

  it('lowers ordered Shared defaults separately from Mihomo direct and fallback behavior', () => {
    const dns: DnsIR = {
      enabled: true,
      mode: 'custom',
      resolvers: [
        { id: 'udp', kind: 'udp', address: '1.1.1.1' },
        { id: 'direct', kind: 'doh', role: 'direct', address: 'https://direct.example/dns-query' },
        { id: 'doh', kind: 'doh', role: 'default', address: 'https://dns.example/dns-query' },
        { id: 'fallback', kind: 'dot', role: 'fallback', address: 'tls://fallback.example:853' },
        { id: 'dot', kind: 'dot', role: 'default', address: 'tls://dns.example:853' },
      ],
    }
    const before = structuredClone(dns)
    const ownership = resolveMihomoDnsOwnership(dns, { dnsMode: 'redir-host', ipv6: true })

    expect(compileMihomoDns(ownership)).toEqual({
      enable: true,
      ipv6: true,
      'enhanced-mode': 'redir-host',
      'default-nameserver': ['223.5.5.5'],
      nameserver: ['1.1.1.1', 'https://dns.example/dns-query', 'tls://dns.example:853'],
      'direct-nameserver': ['https://direct.example/dns-query'],
      fallback: ['tls://fallback.example:853'],
    })
    expect(dns).toEqual(before)
  })

  it('derives fallback nameservers and Fake-IP range without persisting them into Shared intent', () => {
    const dns: DnsIR = { enabled: true, mode: 'automatic' }
    const before = structuredClone(dns)
    const ownership = resolveMihomoDnsOwnership(dns, { dnsMode: 'fake-ip', ipv6: false })
    const config = compileMihomoDns(ownership)

    expect(deriveMihomoDnsDefaults('redir-host')).toEqual({
      defaultNameservers: ['223.5.5.5'],
      nameservers: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'],
    })
    expect(config).toEqual({
      enable: true,
      ipv6: false,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.0/16',
      'default-nameserver': ['223.5.5.5'],
      nameserver: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'],
    })
    expect(dns).toEqual(before)
    expect(ownership.shared).toEqual({ enabled: true, mode: 'automatic' })

    config!.nameserver.push('mutated-output')
    expect(compileMihomoDns(resolveMihomoDnsOwnership(dns, { dnsMode: 'fake-ip', ipv6: false }))?.nameserver)
      .toEqual(['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'])
  })

  it('emits no DNS config when either compatibility gate disables it', () => {
    const automatic: DnsIR = { enabled: true, mode: 'automatic' }
    expect(compileMihomoDns(resolveMihomoDnsOwnership(undefined, { dnsMode: 'redir-host', ipv6: true }))).toBeUndefined()
    expect(compileMihomoDns(resolveMihomoDnsOwnership(automatic, { dnsMode: 'disabled', ipv6: true }))).toBeUndefined()
  })
})
