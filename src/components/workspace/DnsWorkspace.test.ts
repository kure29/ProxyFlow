import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { explicitProxyIR } from '../../core/__fixtures__/crossTargetFixtures'
import { getTargetCapabilities } from '../../core/capabilities'
import {
  appendCustomDnsResolver, appendDnsResolverPreset, deleteDnsResolver, patchDnsResolver,
} from '../../core/dns/resolverProfiles'
import { compileMihomo } from '../../targets/mihomo/compiler'
import { compileSingBox } from '../../targets/singbox/compiler'
import type { DnsResolverConfig } from '../../types/project'
import { DnsWorkspace, type DnsWorkspaceCopy } from './DnsWorkspace'

const copy: DnsWorkspaceCopy = {
  emptyTitle: 'No DNS resolvers yet',
  emptyDescription: 'Add a resolver.',
  addDns: 'Add DNS settings',
  resolverDescription: 'Resolver capabilities are validated.',
  addResolver: 'Add resolver',
  customResolver: 'Custom resolver',
  name: 'Name',
  protocol: 'Protocol',
  endpoint: 'Endpoint',
  role: 'Role',
  enabled: 'Enabled',
  remove: 'Remove resolver',
  unsupported: 'Unsupported by target',
  roles: { default: 'Default', direct: 'Direct', fallback: 'Fallback' },
  regions: { system: 'Device', global: 'Global', 'mainland-china': 'Mainland China' },
}

describe('DNS Workspace mobile actions', () => {
  it('adds supported presets, edits resolver fields and deletes immediately', () => {
    let resolvers: DnsResolverConfig[] = []
    for (const preset of ['cloudflare', 'google', 'quad9', 'alidns']) {
      resolvers = appendDnsResolverPreset(resolvers, preset)
    }
    resolvers = appendCustomDnsResolver(resolvers)

    expect(resolvers.map((resolver) => resolver.name)).toEqual(['Cloudflare', 'Google', 'Quad9', 'AliDNS', 'Custom DNS'])
    expect(new Set(resolvers.map((resolver) => resolver.id)).size).toBe(resolvers.length)

    const googleId = resolvers.find((resolver) => resolver.presetId === 'google')!.id
    resolvers = patchDnsResolver(resolvers, googleId, { name: 'Google edited', role: 'fallback', enabled: false })
    expect(resolvers.find((resolver) => resolver.id === googleId)).toEqual(expect.objectContaining({
      name: 'Google edited', role: 'fallback', enabled: false,
    }))

    resolvers = deleteDnsResolver(resolvers, googleId)
    expect(resolvers.some((resolver) => resolver.id === googleId)).toBe(false)
  })

  it('keeps unsupported target capabilities disabled and visibly blocked', () => {
    expect(getTargetCapabilities('mihomo').dns.system.status).toBe('unsupported')
    expect(getTargetCapabilities('sing-box').dns.system.status).toBe('supported')
    expect(getTargetCapabilities('sing-box').dns['direct-role'].status).toBe('unsupported')
    expect(getTargetCapabilities('sing-box').dns['fallback-role'].status).toBe('unsupported')

    const html = renderToStaticMarkup(createElement(DnsWorkspace, {
      node: {
        id: 'dns',
        dnsResolvers: [{ id: 'direct', name: 'Direct DNS', kind: 'doh', role: 'direct', address: 'https://dns.example.com/dns-query', enabled: true }],
      },
      target: 'sing-box',
      copy,
      onCreateDns: () => undefined,
      onChange: () => undefined,
    }))

    expect(html).toContain('is-unsupported')
    expect(html).toContain('Unsupported by target')
    expect(html).toMatch(/<option[^>]*disabled=""[^>]*value="direct"|<option[^>]*value="direct"[^>]*disabled=""/)
  })

  it('passes supported preset state through both production target exports', () => {
    const resolvers = ['cloudflare', 'google', 'quad9', 'alidns']
      .reduce<DnsResolverConfig[]>((current, preset) => appendDnsResolverPreset(current, preset), [])
    const ir = explicitProxyIR()
    ir.dns = {
      enabled: true,
      mode: 'custom',
      resolvers: resolvers.map(({ id, kind, role, address }) => ({ id, kind, role, address })),
    }

    const mihomo = compileMihomo(ir)
    const singBox = compileSingBox(ir)

    expect(mihomo.success).toBe(true)
    expect(mihomo.content).toContain('https://1.1.1.1/dns-query')
    expect(singBox.success).toBe(true)
    expect(singBox.content).toContain('dns.alidns.com')
  })
})
