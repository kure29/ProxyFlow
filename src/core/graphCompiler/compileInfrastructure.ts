import type { DnsIR, OutputIR } from '../ir'
import { semanticIssue } from '../ir'
import { inferUniversalDnsMode, isDnsResolverConfig, isUniversalDnsMode, normalizeDnsResolvers } from '../dns/resolverProfiles'
import type { GraphNode } from '../../types/project'
import type { GraphCompileContext } from './context'

/** Resolve the one enabled DNS graph node used by every DNS semantic compiler. */
export function resolveEffectiveDnsOwner(context: GraphCompileContext): GraphNode | undefined {
  const dnsNodes = context.project.graph.nodes.filter((node) => !node.data.disabled && node.data.blockType === 'dns')
  if (dnsNodes.length <= 1) return dnsNodes[0]
  context.addIssue(semanticIssue(
    'DNS_MULTIPLE', 'error', 'compile', 'Multiple DNS settings nodes cannot be compiled without losing resolver semantics.',
    { nodeId: dnsNodes[0].id, entity: { type: 'dns', id: dnsNodes[0].id } },
  ))
  return undefined
}

export function compileDns(context: GraphCompileContext, node = resolveEffectiveDnsOwner(context)): DnsIR | undefined {
  if (!node) return undefined
  const rawResolvers = node.data.dnsResolvers as unknown
  const rawMode = node.data.universalDnsMode as unknown
  const inferredMode = rawMode === undefined
  const mode = inferredMode
    ? inferUniversalDnsMode(node.data.dnsResolvers, node.data.resolver)
    : rawMode
  if (!isUniversalDnsMode(mode)) {
    context.addIssue(semanticIssue(
      'DNS_MODE_INVALID', 'error', 'compile', `DNS node "${node.data.title}" has an invalid Universal DNS mode.`,
      { nodeId: node.id, entity: { type: 'dns', id: node.id } },
    ))
    return undefined
  }
  // `none` intentionally makes all retained resolver drafts inactive.
  if (mode === 'none') return undefined

  const invalidResolverShape = rawResolvers !== undefined && (
    !Array.isArray(rawResolvers) || rawResolvers.some((resolver) => !isDnsResolverConfig(resolver))
  )
  // Explicit automatic mode also treats resolver drafts as inactive. Missing
  // mode uses the legacy path, including its existing shape diagnostics.
  if (invalidResolverShape && (mode === 'custom' || inferredMode)) context.addIssue(semanticIssue(
    'DNS_RESOLVER_INVALID', 'error', 'compile', `DNS node "${node.data.title}" contains an invalid resolver configuration.`,
    { nodeId: node.id, entity: { type: 'dns', id: node.id } },
  ))
  const configured = normalizeDnsResolvers(node.data.dnsResolvers, node.data.resolver)
  const enabled = configured.filter((resolver) => resolver.enabled)
  if (mode === 'automatic') {
    if (enabled.length === 0) context.addIssue(semanticIssue(
      'DNS_RESOLVER_MISSING', 'warning', 'compile', `DNS node "${node.data.title}" has no explicit resolver.`,
      { nodeId: node.id, entity: { type: 'dns', id: node.id } },
    ))
    return { enabled: true, mode: 'automatic' }
  }

  if (new Set(enabled.map((resolver) => resolver.id)).size !== enabled.length) context.addIssue(semanticIssue(
    'DNS_RESOLVER_ID_DUPLICATE', 'error', 'compile', `DNS node "${node.data.title}" contains duplicate resolver identifiers.`,
    { nodeId: node.id, entity: { type: 'dns', id: node.id } },
  ))
  if (enabled.some((resolver) => resolver.kind !== 'system' && !resolver.address?.trim())) context.addIssue(semanticIssue(
    'DNS_RESOLVER_ADDRESS_MISSING', 'error', 'compile', `DNS node "${node.data.title}" contains an enabled resolver without an address.`,
    { nodeId: node.id, entity: { type: 'dns', id: node.id } },
  ))
  if (enabled.length > 0 && !enabled.some((resolver) => resolver.role === 'default')) context.addIssue(semanticIssue(
    'DNS_DEFAULT_RESOLVER_MISSING', 'error', 'compile', `DNS node "${node.data.title}" requires at least one enabled Default resolver.`,
    { nodeId: node.id, entity: { type: 'dns', id: node.id } },
  ))
  if (enabled.length === 0) {
    context.addIssue(semanticIssue(
      'DNS_RESOLVER_MISSING', 'error', 'compile', `DNS node "${node.data.title}" is in custom mode but has no enabled resolver.`,
      { nodeId: node.id, entity: { type: 'dns', id: node.id } },
    ))
    return undefined
  }
  return {
    enabled: true,
    mode: 'custom',
    resolvers: enabled.map((resolver) => ({
      id: resolver.id,
      name: resolver.name,
      kind: resolver.kind,
      role: resolver.role,
      ...(resolver.address ? { address: resolver.address } : {}),
    })),
  }
}

export function compileOutputs(context: GraphCompileContext): OutputIR[] {
  return context.project.graph.nodes.flatMap((node): OutputIR[] => {
    if (node.data.disabled || node.data.blockType !== 'output') return []
    if (!node.data.client) {
      context.addIssue(semanticIssue(
        'OUTPUT_TARGET_MISSING', 'error', 'compile', `Output "${node.data.title}" has no target client.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      return []
    }
    return [{ id: node.id, name: node.data.title, target: node.data.client, enabled: true }]
  })
}
