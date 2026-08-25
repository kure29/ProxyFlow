import { describe, expect, it } from 'vitest'
import { DEFAULT_PRODUCT_TARGET, PRIMARY_TARGETS, PRODUCT_TARGETS, capabilityIsAvailable, getTargetCapabilities, isPrimaryTarget, resolveActiveProductTarget, strategyCapabilityForBlockType } from './targetCapabilities'
import { proxyCompatibilityForTarget } from './proxyCompatibility'

describe('target capability registry', () => {
  it('keeps all compiler targets registered while exposing release-ready product targets', () => {
    expect(PRIMARY_TARGETS).toEqual(['mihomo', 'surge', 'sing-box', 'loon'])
    expect(PRODUCT_TARGETS).toEqual(['mihomo', 'surge', 'loon'])
    expect(PRODUCT_TARGETS).not.toContain('sing-box')
    expect(getTargetCapabilities('mihomo').baselineVersion).toBe('v1.19.30')
    expect(getTargetCapabilities('surge').baselineVersion).toBe('iOS 5.22+ / Mac 6.9+')
    expect(getTargetCapabilities('sing-box').baselineVersion).toBe('v1.13.18')
    expect(getTargetCapabilities('mihomo').productStatus).toBe('supported')
    expect(getTargetCapabilities('surge').productStatus).toBe('supported')
    expect(getTargetCapabilities('sing-box').productStatus).toBe('paused')
    expect(getTargetCapabilities('loon').productStatus).toBe('supported')
    expect(getTargetCapabilities('loon').label).toBe('Loon')
    expect(isPrimaryTarget('loon')).toBe(true)
    expect(isPrimaryTarget('future-target')).toBe(false)
    expect(resolveActiveProductTarget('surge')).toBe('surge')
    expect(resolveActiveProductTarget('sing-box')).toBe('mihomo')
    expect(resolveActiveProductTarget('loon')).toBe('loon')
    expect(DEFAULT_PRODUCT_TARGET).toBe('mihomo')
  })

  it('keeps Loon capability declarations conservative after product exposure', () => {
    const loon = getTargetCapabilities('loon')
    expect(PRODUCT_TARGETS).toContain('loon')
    expect(loon.protocols.http).toEqual(expect.objectContaining({
      status: 'partial', reason: 'LOON_PROXY_TLS_VARIANT_UNSUPPORTED',
      notes: 'Bare HTTP is supported; HTTPS is limited to the validated TLS subset.',
    }))
    expect(loon.protocols.socks5).toEqual(expect.objectContaining({ status: 'unsupported', reason: 'LOON_PROXY_PROTOCOL_UNSUPPORTED' }))
    expect(loon.protocols.shadowsocks).toEqual(expect.objectContaining({ status: 'partial', reason: 'LOON_PROXY_CIPHER_UNSUPPORTED' }))
    expect(loon.routingMatchers.domain.status).toBe('partial')
    expect(loon.routingMatchers['rule-set']).toEqual(expect.objectContaining({ status: 'unsupported', reason: 'LOON_RULE_SOURCE_FORMAT_UNPROVEN' }))
    expect(loon.remoteProxySource.source).toEqual(expect.objectContaining({ status: 'unsupported', reason: 'LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN' }))
  })

  it('keeps target-specific strategy differences explicit', () => {
    expect(getTargetCapabilities('mihomo').strategies.manual.status).toBe('supported')
    expect(getTargetCapabilities('mihomo').strategies['load-balance'].status).toBe('target-native')
    expect(getTargetCapabilities('sing-box').strategies.manual).toEqual(expect.objectContaining({
      status: 'partial', reason: 'SINGBOX_SELECTOR_CLASH_API_REQUIRED',
    }))
    expect(getTargetCapabilities('sing-box').strategies.failover).toEqual(expect.objectContaining({
      status: 'unsupported', reason: 'SINGBOX_STRATEGY_FALLBACK_UNSUPPORTED',
    }))
    expect(getTargetCapabilities('surge').strategies['load-balance']).toEqual(expect.objectContaining({
      status: 'unsupported', reason: 'SURGE_LOAD_BALANCE_ROUND_ROBIN_UNSUPPORTED',
    }))
    expect(getTargetCapabilities('surge').strategies.chain.status).toBe('partial')
    expect(capabilityIsAvailable(getTargetCapabilities('mihomo').strategies['load-balance'])).toBe(true)
    expect(capabilityIsAvailable(getTargetCapabilities('sing-box').strategies['load-balance'])).toBe(false)
  })

  it('maps graph strategy blocks without treating unrelated blocks as strategies', () => {
    expect(strategyCapabilityForBlockType('manual-select')).toBe('manual')
    expect(strategyCapabilityForBlockType('auto-select')).toBe('auto')
    expect(strategyCapabilityForBlockType('fallback')).toBe('failover')
    expect(strategyCapabilityForBlockType('load-balance')).toBe('load-balance')
    expect(strategyCapabilityForBlockType('subscription')).toBeUndefined()
    expect(strategyCapabilityForBlockType('unknown')).toBeUndefined()
  })

  it('marks incompatible target-specific matchers and rule sources fail-closed', () => {
    const singBox = getTargetCapabilities('sing-box')
    expect(singBox.routingMatchers.asn.status).toBe('unsupported')
    expect(singBox.routingMatchers['geo-ip'].status).toBe('unsupported')
    expect(singBox.ruleSources.yaml).toEqual(expect.objectContaining({
      status: 'unsupported', reason: 'SINGBOX_RULE_SOURCE_FORMAT_UNSUPPORTED',
    }))
    expect(getTargetCapabilities('mihomo').ruleSources['sing-box-binary'].status).toBe('unsupported')
    expect(getTargetCapabilities('surge').routingMatchers['domain-suffix'].status).toBe('supported')
    expect(getTargetCapabilities('surge').routingMatchers.port.status).toBe('unsupported')
  })

  it('declares remote proxy sources as an independently extensible target capability', () => {
    const mihomo = getTargetCapabilities('mihomo').remoteProxySource
    const singBox = getTargetCapabilities('sing-box').remoteProxySource
    expect(mihomo).toEqual(expect.objectContaining({
      source: expect.objectContaining({ status: 'target-native' }),
      refresh: expect.objectContaining({ status: 'supported' }),
      multipleSourcesInGroup: expect.objectContaining({ status: 'supported' }),
      mixedWithExplicitMembers: expect.objectContaining({ status: 'supported' }),
      requestProfiles: ['auto', 'mihomo'],
    }))
    expect(mihomo.filtering.status).toBe('unsupported')
    expect(singBox.source).toEqual(expect.objectContaining({ status: 'unsupported', reason: 'REMOTE_SOURCE_TARGET_UNSUPPORTED' }))
    expect(singBox.requestProfiles).toEqual([])
    expect(getTargetCapabilities('surge').remoteProxySource).toEqual(expect.objectContaining({
      source: expect.objectContaining({ status: 'unsupported', reason: 'SURGE_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN' }),
      requestProfiles: [],
    }))
  })

  it('evaluates modeled Partial proxy variants against the selected target', () => {
    const endpoint = {
      kind: 'shadowsocks' as const,
      protocol: 'shadowsocks' as const,
      id: 'ss-obfs', name: 'SS obfs', server: 'ss.example.com', port: 8388,
      method: 'aes-128-gcm', password: 'fictional-password', plugin: { name: 'obfs' },
      metadata: { compatibility: { status: 'partial' as const, unsupportedFeatures: ['plugin:obfs'] } },
    }
    expect(proxyCompatibilityForTarget(endpoint, 'mihomo').status).toBe('target-native')
    expect(proxyCompatibilityForTarget(endpoint, 'sing-box')).toEqual({ status: 'partial', unsupportedFeatures: ['plugin:obfs'] })
    expect(proxyCompatibilityForTarget(endpoint, 'surge')).toEqual({ status: 'partial', unsupportedFeatures: [] })
  })

  it('marks VLESS unsupported for Surge before export', () => {
    const endpoint = {
      kind: 'vless' as const, protocol: 'vless' as const, id: 'vless', name: 'VLESS',
      server: 'vless.example.com', port: 443, uuid: '00000000-0000-4000-8000-000000000001',
    }
    expect(proxyCompatibilityForTarget(endpoint, 'surge')).toEqual({
      status: 'unsupported', unsupportedFeatures: ['SURGE_PROXY_PROTOCOL_UNSUPPORTED'],
    })
  })
})
