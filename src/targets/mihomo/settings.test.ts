import { describe, expect, it } from 'vitest'
import { isMihomoTargetSettingManaged, mergeMihomoTargetSettings, resolveMihomoTargetSettingsDisplay, validateMihomoTargetSettings } from './settings'

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

  it('resolves managed values before legacy/default display fallbacks', () => {
    const fallback = { mixedPort: 7890, allowLan: true, ipv6: true }
    expect(resolveMihomoTargetSettingsDisplay(undefined, fallback)).toEqual(fallback)
    expect(resolveMihomoTargetSettingsDisplay({ mixedPort: 7999, allowLan: false }, fallback)).toEqual({
      mixedPort: 7999, allowLan: false, ipv6: true,
    })
  })

  it('merges target-scoped patches and removes fields when explicitly cleared', () => {
    const current = { mixedPort: 7999, allowLan: true, ipv6: false }
    expect(mergeMihomoTargetSettings(current, { allowLan: false })).toEqual({ mixedPort: 7999, allowLan: false, ipv6: false })
    expect(mergeMihomoTargetSettings(current, { mixedPort: undefined })).toEqual({ allowLan: true, ipv6: false })
    expect(mergeMihomoTargetSettings({ mixedPort: 7999 }, { mixedPort: undefined })).toBeUndefined()
  })

  it('does not treat malformed or explicit false values as inherited state', () => {
    expect(isMihomoTargetSettingManaged({ allowLan: false }, 'allowLan')).toBe(true)
    expect(isMihomoTargetSettingManaged({ allowLan: 'false' }, 'allowLan')).toBe(true)
    expect(resolveMihomoTargetSettingsDisplay({ allowLan: false, ipv6: false }, { mixedPort: 7890, allowLan: true, ipv6: true })).toEqual({
      mixedPort: 7890, allowLan: false, ipv6: false,
    })
  })
})
