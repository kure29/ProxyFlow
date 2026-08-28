import { describe, expect, it } from 'vitest'
import {
  commitSurgeGeneralProxyBypassDraft,
  excludeSimpleHostnamesChoice,
  getSurgeGeneralProxyBypassUiState,
  surgeGeneralProxyBypassBooleanPatch,
} from './generalProxyBypassProductModel'

const base = { target: 'surge' as const, kind: 'general-proxy-bypass' as const }

describe('G3-C product model', () => {
  it('models Surge-only creation and retained cross-target intent', () => {
    expect(getSurgeGeneralProxyBypassUiState({ primaryTarget: 'surge', hasPersistedIntent: false })).toEqual({ hasPersistedIntent: false, isTargetMismatch: false, canCreate: true, canRemove: false })
    expect(getSurgeGeneralProxyBypassUiState({ primaryTarget: 'mihomo', hasPersistedIntent: true })).toEqual({ hasPersistedIntent: true, isTargetMismatch: true, canCreate: false, canRemove: true })
  })

  it('commits canonical ordered drafts and clears only skipProxy', () => {
    const config = { ...base, skipProxy: ['apple.com'], excludeSimpleHostnames: false }
    expect(commitSurgeGeneralProxyBypassDraft(config, ' 192.168.2.123/24\n\napple.com\n192.168.2.0/24')).toEqual({ targetNativeSurgeGeneralProxyBypass: { ...base, skipProxy: ['192.168.2.0/24', 'apple.com'], excludeSimpleHostnames: false } })
    expect(commitSurgeGeneralProxyBypassDraft(config, ' ')).toEqual({ targetNativeSurgeGeneralProxyBypass: { ...base, excludeSimpleHostnames: false } })
    expect(commitSurgeGeneralProxyBypassDraft(config, '*apple')).toEqual({ targetNativeSurgeGeneralProxyBypass: { ...base, skipProxy: ['*apple'], excludeSimpleHostnames: false } })
    expect(commitSurgeGeneralProxyBypassDraft({ ...base, skipProxy: ['apple.com'] }, 'printer')).toEqual({ targetNativeSurgeGeneralProxyBypass: { ...base, skipProxy: ['printer'] } })
    expect(commitSurgeGeneralProxyBypassDraft(config, 'bad value')).toBeUndefined()
  })

  it('keeps Boolean omission distinct from explicit false', () => {
    expect(excludeSimpleHostnamesChoice({ ...base, skipProxy: ['localhost'] })).toBe('default')
    expect(excludeSimpleHostnamesChoice({ ...base, excludeSimpleHostnames: false })).toBe('disabled')
    expect(surgeGeneralProxyBypassBooleanPatch({ ...base, skipProxy: ['localhost'] }, 'disabled')).toEqual({ targetNativeSurgeGeneralProxyBypass: { ...base, skipProxy: ['localhost'], excludeSimpleHostnames: false } })
    expect(surgeGeneralProxyBypassBooleanPatch({ ...base, excludeSimpleHostnames: false }, 'default')).toEqual({ targetNativeSurgeGeneralProxyBypass: undefined })
  })
})
