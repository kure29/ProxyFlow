import type { DnsIR } from '../../core/ir'
import {
  projectDnsOwnership,
  type MihomoDnsResolverBehavior,
  type SharedDnsIntent,
  type SharedDnsResolverIntent,
} from '../../core/dns/ownership'
import type { MihomoDnsMode } from '../../types/project'
import type { MihomoDnsConfig } from './model'
import { MIHOMO_DEFAULTS } from './defaults'

export type MihomoDnsOwnershipGate = 'shared-disabled' | 'target-disabled' | 'enabled'

export interface ResolvedMihomoDnsOwnership {
  /** Shared resolver selection intent projected from the effective Graph owner. */
  shared?: SharedDnsIntent
  /** Mihomo-only direct/fallback behavior retained by the Project V2 role field. */
  behavior: MihomoDnsResolverBehavior
  /** Legacy output profile owns the enhanced-mode compatibility value. */
  dnsMode: MihomoDnsMode
  /** Already resolved managed setting > legacy profile > default. */
  ipv6: boolean
  /** The single compiler gate; downstream code does not repeat precedence. */
  gate: MihomoDnsOwnershipGate
}

export interface MihomoDnsDerivedDefaults {
  defaultNameservers: string[]
  nameservers: string[]
  fakeIpRange?: string
}

/**
 * Resolve the two compatible DNS gates at one boundary. Shared absence wins;
 * otherwise Mihomo may explicitly disable its target-owned DNS implementation.
 */
export function resolveMihomoDnsOwnership(
  dns: DnsIR | undefined,
  behavior: { dnsMode: MihomoDnsMode; ipv6: boolean },
): ResolvedMihomoDnsOwnership {
  const ownership = projectDnsOwnership(dns)
  return {
    shared: ownership.shared,
    behavior: ownership.targetSpecific.mihomo,
    dnsMode: behavior.dnsMode,
    ipv6: behavior.ipv6,
    gate: !ownership.shared
      ? 'shared-disabled'
      : behavior.dnsMode === 'disabled'
        ? 'target-disabled'
        : 'enabled',
  }
}

/** Compiler-owned values which are emitted only when user intent needs them. */
export function deriveMihomoDnsDefaults(mode: Exclude<MihomoDnsMode, 'disabled'>): MihomoDnsDerivedDefaults {
  return {
    defaultNameservers: [MIHOMO_DEFAULTS.dnsBootstrap],
    nameservers: [...MIHOMO_DEFAULTS.dnsNameservers],
    ...(mode === 'fake-ip' ? { fakeIpRange: MIHOMO_DEFAULTS.fakeIpRange } : {}),
  }
}

export function compileMihomoDns(ownership: ResolvedMihomoDnsOwnership): MihomoDnsConfig | undefined {
  if (ownership.gate !== 'enabled' || !ownership.shared || ownership.dnsMode === 'disabled') return undefined
  const defaults = deriveMihomoDnsDefaults(ownership.dnsMode)
  const sharedResolvers = ownership.shared.mode === 'custom' ? ownership.shared.resolvers ?? [] : []
  const nameservers = resolverAddresses(sharedResolvers)
  const direct = resolverAddresses(ownership.behavior.directResolvers)
  const fallback = resolverAddresses(ownership.behavior.fallbackResolvers)
  return {
    enable: true,
    ipv6: ownership.ipv6,
    'enhanced-mode': ownership.dnsMode,
    ...(defaults.fakeIpRange ? { 'fake-ip-range': defaults.fakeIpRange } : {}),
    'default-nameserver': defaults.defaultNameservers,
    nameserver: nameservers.length > 0 ? nameservers : defaults.nameservers,
    ...(direct.length > 0 ? { 'direct-nameserver': direct } : {}),
    ...(fallback.length > 0 ? { fallback } : {}),
  }
}

function resolverAddresses(resolvers: readonly SharedDnsResolverIntent[]) {
  return resolvers.flatMap((resolver) => resolver.address ? [resolver.address] : [])
}
