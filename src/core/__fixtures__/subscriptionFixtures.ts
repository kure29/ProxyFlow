import type { SubscriptionInputKind, SubscriptionParseResult, SubscriptionSnapshot } from '../subscription'

export function subscriptionSnapshotFixture(
  sourceId: string,
  result: SubscriptionParseResult,
  committedAt = '2026-08-16T00:00:00.000Z',
  inputKind: SubscriptionInputKind = 'paste',
): SubscriptionSnapshot {
  return {
    snapshotId: `fixture-${sourceId}`,
    sourceId,
    snapshotSchemaVersion: 1,
    identityAlgorithmVersion: 1,
    inputKind,
    createdAt: committedAt,
    fetchedAt: committedAt,
    parsedAt: committedAt,
    committedAt,
    contentHash: `fixture-content-${sourceId}`,
    sourceConfigFingerprint: `fixture-config-${sourceId}`,
    format: result.format,
    result,
    readyCount: result.readyCount,
    partialCount: result.partialCount,
    unsupportedCount: result.unsupportedCount,
    issues: result.issues,
    quality: result.readyCount > 0 ? 'usable' : 'empty',
  }
}
