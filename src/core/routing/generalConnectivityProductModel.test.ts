import { describe, expect, it } from 'vitest'
import {
  getSurgeGeneralConnectivityUiState,
  commitSurgeGeneralConnectivityDraft,
  removeSurgeGeneralConnectivityOptions,
  surgeGeneralConnectivityOptionsPatch,
} from './generalConnectivityProductModel'
import type { TargetNativeSurgeGeneralConnectivityConfig } from '../targetNative'

describe('Surge General Connectivity Product model', () => {
  it('allows creation only for Surge while retaining/removing on other targets', () => {
    expect(getSurgeGeneralConnectivityUiState({ primaryTarget: 'surge', hasPersistedIntent: false })).toEqual({ hasPersistedIntent: false, isTargetMismatch: false, canCreate: true, canRemove: false })
    expect(getSurgeGeneralConnectivityUiState({ primaryTarget: 'mihomo', hasPersistedIntent: true })).toEqual({ hasPersistedIntent: true, isTargetMismatch: true, canCreate: false, canRemove: true })
  })

  it('persists explicit authored URL and removes blank/default intent', () => {
    expect(surgeGeneralConnectivityOptionsPatch(undefined, 'https://example.test/ping')).toEqual({ targetNativeSurgeGeneralConnectivity: { target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://example.test/ping' } })
    expect(surgeGeneralConnectivityOptionsPatch(undefined, 'h')).toEqual({ targetNativeSurgeGeneralConnectivity: undefined })
    expect(surgeGeneralConnectivityOptionsPatch({ target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://old.example.test' }, '   ')).toEqual({ targetNativeSurgeGeneralConnectivity: undefined })
    expect(removeSurgeGeneralConnectivityOptions()).toEqual({ targetNativeSurgeGeneralConnectivity: undefined })
  })

  it('keeps incomplete/invalid drafts local while committing complete URLs', () => {
    expect(commitSurgeGeneralConnectivityDraft('h')).toBeUndefined()
    expect(commitSurgeGeneralConnectivityDraft('https://user:pass@example.test')).toBeUndefined()
    expect(commitSurgeGeneralConnectivityDraft('http://example.test/ping')).toEqual({ targetNativeSurgeGeneralConnectivity: { target: 'surge', kind: 'general-connectivity', internetTestUrl: 'http://example.test/ping' } })
    expect(commitSurgeGeneralConnectivityDraft('https://example.test/ping')).toEqual({ targetNativeSurgeGeneralConnectivity: { target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://example.test/ping' } })
    expect(commitSurgeGeneralConnectivityDraft('')).toEqual({ targetNativeSurgeGeneralConnectivity: undefined })
  })

  it('supports sequential typing without replacing prior semantic intent', () => {
    const previous = { target: 'surge' as const, kind: 'general-connectivity' as const, internetTestUrl: 'https://old.example.test/ping' }
    let persisted: TargetNativeSurgeGeneralConnectivityConfig | undefined = previous
    for (const draft of ['h', 'ht', 'htt', 'http', 'https', 'https:', 'https:/', 'https://']) {
      const patch = commitSurgeGeneralConnectivityDraft(draft)
      expect(patch).toBeUndefined()
      expect(persisted).toEqual(previous)
    }
    const committed = commitSurgeGeneralConnectivityDraft('https://new.example.test/ping')
    expect(committed).toBeDefined()
    persisted = committed?.targetNativeSurgeGeneralConnectivity
    expect(persisted?.internetTestUrl).toBe('https://new.example.test/ping')
  })
})
