import { describe, expect, it } from 'vitest'
import {
  getSurgeGeneralConnectivityUiState,
  removeSurgeGeneralConnectivityOptions,
  surgeGeneralConnectivityOptionsPatch,
} from './generalConnectivityProductModel'

describe('Surge General Connectivity Product model', () => {
  it('allows creation only for Surge while retaining/removing on other targets', () => {
    expect(getSurgeGeneralConnectivityUiState({ primaryTarget: 'surge', hasPersistedIntent: false })).toEqual({ hasPersistedIntent: false, isTargetMismatch: false, canCreate: true, canRemove: false })
    expect(getSurgeGeneralConnectivityUiState({ primaryTarget: 'mihomo', hasPersistedIntent: true })).toEqual({ hasPersistedIntent: true, isTargetMismatch: true, canCreate: false, canRemove: true })
  })

  it('persists explicit authored URL and removes blank/default intent', () => {
    expect(surgeGeneralConnectivityOptionsPatch(undefined, 'https://example.test/ping')).toEqual({ targetNativeSurgeGeneralConnectivity: { target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://example.test/ping' } })
    expect(surgeGeneralConnectivityOptionsPatch({ target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://old.example.test' }, '   ')).toEqual({ targetNativeSurgeGeneralConnectivity: undefined })
    expect(removeSurgeGeneralConnectivityOptions()).toEqual({ targetNativeSurgeGeneralConnectivity: undefined })
  })
})
