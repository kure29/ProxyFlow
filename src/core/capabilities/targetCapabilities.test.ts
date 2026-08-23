import { describe, expect, it } from 'vitest'
import { PRIMARY_TARGETS, PRODUCT_TARGETS, capabilityIsAvailable, getTargetCapabilities, resolveActiveProductTarget, strategyCapabilityForBlockType } from './targetCapabilities'
import { proxyCompatibilityForTarget } from './proxyCompatibility'

describe('target capability registry', () => {
  it('keeps both compiler targets registered while exposing only supported product targets', () => {
    expect(PRIMARY_TARGETS).toEqual(['mihomo', 'sing-box'])
    expect(PRODUCT_TARGETS).toEqual(['mihomo'])
    expect(getTargetCapabilities('mihomo').baselineVersion).toBe('v1.19.30')
    expect(getTargetCapabilities('sing-box').baselineVersion).toBe('v1.13.18')
    expect(getTargetCapabilities('mihomo').productStatus).toBe('supported')
    expect(getTargetCapabilities('sing-box').productStatus).toBe('paused')
    expect(resolveActiveProductTarget('sing-box')).toBe('mihomo')
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
  })
})
