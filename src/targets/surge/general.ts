import type { CompatibilityIssue } from '../../types/project'
import { surgeIssue } from './errors'
import type { SurgeGeneralEntry } from './model'
import type { TargetNativeSurgeGeneralNetworkIR } from '../../core/targetNative'

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

/** Lower the typed G1 Network/VIF family into canonical Surge [General]
 * entries.  Property presence, rather than client defaults, controls output.
 */
export function compileSurgeGeneralNetwork(
  network: TargetNativeSurgeGeneralNetworkIR | undefined,
): SurgeGeneralEntry[] {
  if (!network) return []
  const entries: SurgeGeneralEntry[] = []
  if (Object.prototype.hasOwnProperty.call(network, 'ipv6')) entries.push({ key: 'ipv6', value: network.ipv6! })
  if (Object.prototype.hasOwnProperty.call(network, 'ipv6Vif')) entries.push({ key: 'ipv6-vif', value: network.ipv6Vif! })
  if (Object.prototype.hasOwnProperty.call(network, 'icmpForwarding')) entries.push({ key: 'icmp-forwarding', value: network.icmpForwarding! })
  return entries
}
