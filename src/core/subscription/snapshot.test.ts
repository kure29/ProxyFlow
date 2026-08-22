import { describe, expect, it } from 'vitest'
import { parseSubscription } from './parseSubscription'
import { classifySnapshotQuality, snapshotFreshness, SUBSCRIPTION_STALE_AFTER_MS } from './snapshot'

describe('subscription snapshot quality and freshness', () => {
  it('distinguishes usable, valid empty and invalid candidates', () => {
    const options = { sourceId: 'source' }
    expect(classifySnapshotQuality('socks5://node.example.invalid:1080#Node', parseSubscription('socks5://node.example.invalid:1080#Node', options))).toBe('usable')
    expect(classifySnapshotQuality('ss://YWVzLTEyOC1nY206Zml4dHVyZS1wYXNzd29yZA==@partial.example.invalid:8388/?plugin=obfs#Partial', parseSubscription('ss://YWVzLTEyOC1nY206Zml4dHVyZS1wYXNzd29yZA==@partial.example.invalid:8388/?plugin=obfs#Partial', options))).toBe('usable')
    expect(classifySnapshotQuality('proxies: []', parseSubscription('proxies: []', options))).toBe('empty')
    expect(classifySnapshotQuality(' \n', parseSubscription(' \n', options))).toBe('invalid')
    expect(classifySnapshotQuality('not a subscription', parseSubscription('not a subscription', options))).toBe('invalid')
  })

  it('marks snapshots stale only after the fixed 24 hour threshold', () => {
    const committed = Date.parse('2026-08-15T00:00:00.000Z')
    expect(snapshotFreshness(new Date(committed).toISOString(), committed + SUBSCRIPTION_STALE_AFTER_MS)).toBe('fresh')
    expect(snapshotFreshness(new Date(committed).toISOString(), committed + SUBSCRIPTION_STALE_AFTER_MS + 1)).toBe('stale')
  })
})
