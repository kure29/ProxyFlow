import type { SubscriptionExportMode } from './types'

export const SUBSCRIPTION_EXPORT_MODES = ['auto', 'remote', 'materialized'] as const

const exportModeSet = new Set<string>(SUBSCRIPTION_EXPORT_MODES)

export function isSubscriptionExportMode(value: unknown): value is SubscriptionExportMode {
  return typeof value === 'string' && exportModeSet.has(value)
}

/** Missing persisted values intentionally preserve the pre-remote-source behavior. */
export function normalizePersistedSubscriptionExportMode(value: unknown): SubscriptionExportMode {
  return isSubscriptionExportMode(value) ? value : 'materialized'
}
