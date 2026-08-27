import { describe, expect, it } from 'vitest'
import { SURGE_CAPABILITY_MATRIX } from './capabilities'
import { getTargetCapabilities } from '../../core/capabilities'

describe('Surge capability matrix', () => {
  it('records every Phase 3 decision with an official reference and stable fail-closed diagnostic', () => {
    expect(SURGE_CAPABILITY_MATRIX.map((item) => item.feature)).toEqual([
      'Service Rules',
      'SRC-PORT',
      'Remote Proxy Source',
      'Select',
      'Target-native Smart',
      'Smart policy-priority',
      'Smart evaluate-before-use',
      'Target-native Subnet',
      'Subnet MCCMNC matcher',
      'URL Test',
      'Fallback',
      'Fixed Strategy',
      'Load Balance round-robin',
      'Load Balance consistent-hash',
      'Proxy Chain',
      'DNS',
      'Shadowsocks',
      'VMess',
      'VLESS',
    ])
    for (const item of SURGE_CAPABILITY_MATRIX) {
      expect(item.reason.length).toBeGreaterThan(0)
      expect(item.officialReference).toMatch(/^https:\/\/manual\.nssurge\.com\//)
      if (item.status === 'unsupported') expect(item.diagnostic).toMatch(/^SURGE_/)
    }
    expect(SURGE_CAPABILITY_MATRIX.find((item) => item.feature === 'DNS')).toEqual(expect.objectContaining({
      status: 'conditional', diagnostic: 'SURGE_DNS_MIXED_TRANSPORT_SEMANTICS_UNSUPPORTED',
    }))
    expect(SURGE_CAPABILITY_MATRIX.find((item) => item.feature === 'SRC-PORT')).not.toHaveProperty('diagnostic')
  })

  it('records native Smart and Subnet support without widening Universal strategies', () => {
    expect(SURGE_CAPABILITY_MATRIX.some((entry) => entry.feature === 'Target-native Smart')).toBe(true)
    expect(getTargetCapabilities('surge').native['strategy-smart'].status).toBe('target-native')
    expect(getTargetCapabilities('surge').native['strategy-subnet'].status).toBe('target-native')
  })
})
