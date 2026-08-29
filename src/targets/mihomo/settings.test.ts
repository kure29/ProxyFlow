import { describe, expect, it } from 'vitest'
import { validateMihomoTargetSettings } from './settings'

describe('Mihomo target settings', () => {
  it('keeps omitted fields absent and preserves explicit false', () => {
    expect(validateMihomoTargetSettings(undefined)).toEqual({ settings: {}, issues: [] })
    expect(validateMihomoTargetSettings({ allowLan: false, ipv6: false })).toEqual({
      settings: { allowLan: false, ipv6: false }, issues: [],
    })
  })

  it.each([0, 65_536, 7890.5, '7890', Number.NaN])('rejects invalid mixed port %s', (mixedPort) => {
    const result = validateMihomoTargetSettings({ mixedPort })
    expect(result.settings).toEqual({})
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MIHOMO_TARGET_SETTINGS_MIXED_PORT_INVALID', severity: 'error' }))
  })

  it('fails closed for malformed values and unknown fields', () => {
    const result = validateMihomoTargetSettings({ allowLan: 'false', future: true })
    expect(result.issues).toHaveLength(2)
    expect(result.issues.every((issue) => issue.severity === 'error')).toBe(true)
  })
})
