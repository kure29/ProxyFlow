import { describe, expect, it } from 'vitest'
import { PRIMARY_TARGETS, capabilityIsAvailable, getTargetCapabilities, strategyCapabilityForBlockType } from './targetCapabilities'

describe('target capability registry', () => {
  it('declares the two production targets and their validated baselines', () => {
    expect(PRIMARY_TARGETS).toEqual(['mihomo', 'sing-box'])
    expect(getTargetCapabilities('mihomo').baselineVersion).toBe('v1.19.30')
    expect(getTargetCapabilities('sing-box').baselineVersion).toBe('v1.13.18')
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
})
