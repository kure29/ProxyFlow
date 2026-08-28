import type { CompatibilityIssue } from '../../types/project'
import { surgeIssue } from './errors'
import type { SurgeGeneralEntry } from './model'
import type { TargetNativeSurgeGeneralNetworkIR } from '../../core/targetNative'
import type { TargetNativeSurgeGeneralConnectivityIR } from '../../core/targetNative'
import type { TargetNativeSurgeDnsBehaviorIR } from '../../core/targetNative'
import { isTargetNativeSurgeGeneralProxyBypassIR, type TargetNativeSurgeGeneralProxyBypassIR } from '../../core/targetNative'

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
  if (Object.prototype.hasOwnProperty.call(network, 'tunExcludedRoutes')) entries.push({ key: 'tun-excluded-routes', value: { kind: 'list', items: [...network.tunExcludedRoutes!] } })
  if (Object.prototype.hasOwnProperty.call(network, 'tunIncludedRoutes')) entries.push({ key: 'tun-included-routes', value: { kind: 'list', items: [...network.tunIncludedRoutes!] } })
  return entries
}

/** Lower the typed G2 Internet/DIRECT connectivity family. */
export function compileSurgeGeneralConnectivity(
  connectivity: TargetNativeSurgeGeneralConnectivityIR | undefined,
): SurgeGeneralEntry[] {
  if (!connectivity) return []
  return [{ key: 'internet-test-url', value: connectivity.internetTestUrl }]
}

/** Lower the Output-owned G3-C system-proxy compatibility family. */
export function compileSurgeGeneralProxyBypass(
  bypass: TargetNativeSurgeGeneralProxyBypassIR | undefined,
): SurgeGeneralEntry[] {
  if (!bypass || !isTargetNativeSurgeGeneralProxyBypassIR(bypass)) return []
  const entries: SurgeGeneralEntry[] = []
  if (Object.prototype.hasOwnProperty.call(bypass, 'skipProxy')) {
    entries.push({ key: 'skip-proxy', value: { kind: 'host-list', items: [...bypass.skipProxy!] } })
  }
  if (Object.prototype.hasOwnProperty.call(bypass, 'excludeSimpleHostnames')) {
    entries.push({ key: 'exclude-simple-hostnames', value: bypass.excludeSimpleHostnames! })
  }
  return entries
}

export const compileSurgeGeneralProxyBypasses = compileSurgeGeneralProxyBypass

/** Lower DNS-node-owned Surge always-real-ip intent into one typed General entry. */
export function compileSurgeDnsBehavior(
  behavior: TargetNativeSurgeDnsBehaviorIR | undefined,
): SurgeGeneralEntry[] {
  if (!behavior) return []
  return [{ key: 'always-real-ip', value: { kind: 'list', items: [...behavior.alwaysRealIp] } }]
}
