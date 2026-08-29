import type { DnsIR, DnsResolverIR } from '../ir'

/** Resolver fields whose user meaning is shared across target adapters. */
export interface SharedDnsResolverIntent {
  id: string
  kind: DnsResolverIR['kind']
  name?: string
  address?: string
}

/** Runtime-only Shared DNS projection. Project `none` is represented by absence. */
export interface SharedDnsIntent {
  enabled: true
  mode: DnsIR['mode']
  resolvers?: SharedDnsResolverIntent[]
}

/** Mihomo-only resolver scopes retained in the V2 resolver role field. */
export interface MihomoDnsResolverBehavior {
  directResolvers: SharedDnsResolverIntent[]
  fallbackResolvers: SharedDnsResolverIntent[]
}

export interface DnsOwnershipProjection {
  shared?: SharedDnsIntent
  targetSpecific: {
    mihomo: MihomoDnsResolverBehavior
  }
}

/**
 * Project V2 persists one ordered resolver array for backwards compatibility.
 * Split that input at runtime so ordinary target planners consume only Shared
 * default resolvers while Mihomo receives its direct/fallback behavior through
 * an explicit target-owned branch. This projection is never written back.
 */
export function projectDnsOwnership(dns: DnsIR | undefined): DnsOwnershipProjection {
  const directResolvers: SharedDnsResolverIntent[] = []
  const fallbackResolvers: SharedDnsResolverIntent[] = []
  if (!dns?.enabled) return {
    shared: undefined,
    targetSpecific: { mihomo: { directResolvers, fallbackResolvers } },
  }

  if (dns.mode === 'automatic') return {
    shared: { enabled: true, mode: 'automatic' },
    targetSpecific: { mihomo: { directResolvers, fallbackResolvers } },
  }

  const sharedResolvers: SharedDnsResolverIntent[] = []
  for (const resolver of dns.resolvers ?? []) {
    const intent = sharedResolverIntent(resolver)
    const role = (resolver as { role?: unknown }).role
    if (role === 'direct') directResolvers.push(intent)
    else if (role === 'fallback') fallbackResolvers.push(intent)
    else if (role === undefined || role === 'default') sharedResolvers.push(intent)
  }

  return {
    shared: { enabled: true, mode: 'custom', resolvers: sharedResolvers },
    targetSpecific: { mihomo: { directResolvers, fallbackResolvers } },
  }
}

function sharedResolverIntent(resolver: DnsResolverIR): SharedDnsResolverIntent {
  return {
    id: resolver.id,
    kind: resolver.kind,
    ...(resolver.name !== undefined ? { name: resolver.name } : {}),
    ...(resolver.address !== undefined ? { address: resolver.address } : {}),
  }
}
