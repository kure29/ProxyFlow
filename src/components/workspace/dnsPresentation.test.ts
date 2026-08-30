import { describe, expect, it } from 'vitest'
import type { DnsResolverConfig } from '../../types/project'
import { deriveDnsWorkspacePresentation } from './dnsPresentation'

const resolver = (id: string, role: DnsResolverConfig['role']): DnsResolverConfig => ({
  id,
  name: id,
  kind: 'doh',
  role,
  address: `https://dns.example.com/${id}`,
  enabled: true,
})

describe('deriveDnsWorkspacePresentation', () => {
  it('keeps default resolvers general and projects Mihomo roles into target groups', () => {
    const result = deriveDnsWorkspacePresentation({
      target: 'mihomo',
      resolvers: [resolver('default', 'default'), resolver('direct', 'direct'), resolver('fallback', 'fallback')],
      hasSurgeNativeBehavior: false,
    })

    expect(result.generalResolvers.map(({ id }) => id)).toEqual(['default'])
    expect(result.mihomoDirectResolvers.map(({ id }) => id)).toEqual(['direct'])
    expect(result.mihomoFallbackResolvers.map(({ id }) => id)).toEqual(['fallback'])
    expect(result.retainedTargets).toEqual([])
    expect(result.showClientSpecific).toBe(true)
  })

  it('retains foreign target-specific state without presenting it as editable current-target data', () => {
    const result = deriveDnsWorkspacePresentation({
      target: 'surge',
      resolvers: [resolver('direct', 'direct'), resolver('fallback', 'fallback')],
      hasSurgeNativeBehavior: false,
    })
    expect(result.generalResolvers).toEqual([])
    expect(result.retainedTargets).toEqual(['mihomo'])
    expect(result.showClientSpecific).toBe(true)

    const mihomoResult = deriveDnsWorkspacePresentation({
      target: 'mihomo',
      resolvers: [],
      hasSurgeNativeBehavior: true,
    })
    expect(mihomoResult.retainedTargets).toEqual(['surge'])
    expect(mihomoResult.showClientSpecific).toBe(true)
  })

  it.each(['loon', 'shadowrocket', 'sing-box'] as const)('omits an empty client-specific section for %s', (target) => {
    const result = deriveDnsWorkspacePresentation({
      target,
      resolvers: [resolver('default', 'default')],
      hasSurgeNativeBehavior: false,
    })
    expect(result.retainedTargets).toEqual([])
    expect(result.showClientSpecific).toBe(false)
  })
})
