import type { PrimaryTarget } from '../../core/capabilities'
import type { DnsResolverConfig } from '../../types/project'

export interface DnsWorkspacePresentation {
  generalResolvers: DnsResolverConfig[]
  mihomoDirectResolvers: DnsResolverConfig[]
  mihomoFallbackResolvers: DnsResolverConfig[]
  retainedTargets: Array<'mihomo' | 'surge'>
  showClientSpecific: boolean
}

/**
 * Derive display groups from the existing V2 resolver array. This is a view
 * projection only: callers still update the original array and its order.
 */
export function deriveDnsWorkspacePresentation({
  target,
  resolvers,
  hasSurgeNativeBehavior,
}: {
  target: PrimaryTarget | null
  resolvers: DnsResolverConfig[]
  hasSurgeNativeBehavior: boolean
}): DnsWorkspacePresentation {
  const generalResolvers = resolvers.filter((resolver) => !resolver.role || resolver.role === 'default')
  const mihomoDirectResolvers = resolvers.filter((resolver) => resolver.role === 'direct')
  const mihomoFallbackResolvers = resolvers.filter((resolver) => resolver.role === 'fallback')
  const retainedTargets: Array<'mihomo' | 'surge'> = []
  if (target !== 'mihomo' && (mihomoDirectResolvers.length > 0 || mihomoFallbackResolvers.length > 0)) retainedTargets.push('mihomo')
  if (target !== 'surge' && hasSurgeNativeBehavior) retainedTargets.push('surge')
  const hasEditableTargetSection = target === 'mihomo' || target === 'surge'
  return {
    generalResolvers,
    mihomoDirectResolvers,
    mihomoFallbackResolvers,
    retainedTargets,
    showClientSpecific: hasEditableTargetSection || retainedTargets.length > 0,
  }
}
