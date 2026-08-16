import type {
  SubscriptionInputKind, SubscriptionParseResult, SubscriptionSnapshotCandidate, SubscriptionSnapshotQuality,
} from './types'
import { sha256 } from './hash'

export const SUBSCRIPTION_SNAPSHOT_SCHEMA_VERSION = 1 as const
export const SUBSCRIPTION_IDENTITY_ALGORITHM_VERSION = 1 as const
export const SUBSCRIPTION_STALE_AFTER_MS = 24 * 60 * 60 * 1_000

interface CandidateInput {
  sourceId: string
  inputKind: SubscriptionInputKind
  sourceConfigFingerprint: string
  content: string
  result: SubscriptionParseResult
  fetchedAt: string
  parsedAt: string
  http?: SubscriptionSnapshotCandidate['http']
}

export async function createSnapshotCandidate(input: CandidateInput): Promise<SubscriptionSnapshotCandidate> {
  const contentHash = await sha256(input.content)
  const quality = classifySnapshotQuality(input.content, input.result)
  return {
    snapshotId: `snapshot-${contentHash.slice(0, 20)}-${Date.parse(input.parsedAt).toString(36)}`,
    sourceId: input.sourceId,
    snapshotSchemaVersion: SUBSCRIPTION_SNAPSHOT_SCHEMA_VERSION,
    identityAlgorithmVersion: SUBSCRIPTION_IDENTITY_ALGORITHM_VERSION,
    inputKind: input.inputKind,
    createdAt: input.parsedAt,
    fetchedAt: input.fetchedAt,
    parsedAt: input.parsedAt,
    contentHash,
    sourceConfigFingerprint: input.sourceConfigFingerprint,
    format: input.result.format,
    result: input.result,
    readyCount: input.result.readyCount,
    partialCount: input.result.partialCount,
    unsupportedCount: input.result.unsupportedCount,
    issues: input.result.issues,
    quality,
    ...(input.http ? { http: input.http } : {}),
  }
}

export function classifySnapshotQuality(content: string, result: SubscriptionParseResult): SubscriptionSnapshotQuality {
  if (!content.trim()) return 'invalid'
  if (result.format === 'unsupported') return 'invalid'
  if (result.readyCount > 0) return 'usable'
  if (result.detectedCount === 0 && !result.issues.some((issue) => issue.severity === 'error')) return 'empty'
  return 'invalid'
}

export function snapshotFreshness(committedAt: string, now = Date.now()) {
  return now - Date.parse(committedAt) > SUBSCRIPTION_STALE_AFTER_MS ? 'stale' as const : 'fresh' as const
}
