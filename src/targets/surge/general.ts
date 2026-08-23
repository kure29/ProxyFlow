import type { CompatibilityIssue } from '../../types/project'
import { surgeIssue } from './errors'
import type { SurgeGeneralEntry } from './model'

export function composeSurgeGeneral(
  groups: readonly (readonly SurgeGeneralEntry[])[],
  issues: CompatibilityIssue[],
): SurgeGeneralEntry[] {
  const entries: SurgeGeneralEntry[] = []
  const keys = new Set<string>()
  for (const group of groups) {
    for (const entry of group) {
      const normalized = entry.key.toLowerCase()
      if (keys.has(normalized)) {
        issues.push(surgeIssue(
          'SURGE_GENERAL_KEY_DUPLICATE', 'error', 'general',
          `Surge [General] key “${entry.key}” was produced more than once; compilation stopped instead of relying on ambiguous override behavior.`,
          entry.key,
        ))
        continue
      }
      keys.add(normalized)
      entries.push(entry)
    }
  }
  return entries
}
