import type { PrimaryTarget } from '../capabilities'
import { semanticIssue } from '../ir'
import {
  isTargetNativeRouteOptionsConfig,
  targetNativeRouteOptionsConfigToIR,
  type TargetNativeRouteOptionsIR,
} from '../targetNative'
import { isRoutingRuleType, resolveRouteMatcherKind } from '../routing/routeProductModel'
import { SURGE_NO_RESOLVE_MATCHERS } from '../routing/routeOptionsProductModel'
import type { GraphCompileContext } from './context'

/**
 * Lift typed Surge route options out of the graph without adding them to
 * Universal RouteIR. Disabled nodes retain their persisted intent for later
 * removal, matching the target-native Final option lifecycle.
 */
export function compileTargetNativeRouteOptions(
  context: GraphCompileContext,
  validationTarget: PrimaryTarget | null | undefined,
): TargetNativeRouteOptionsIR[] {
  const options: TargetNativeRouteOptionsIR[] = []
  for (const node of context.project.graph.nodes) {
    const config = node.data.targetNativeRouteOptions
    if (node.data.disabled || config === undefined) continue
    if (!isRoutingRuleType(node.data.blockType)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_ROUTE_OPTIONS_INVALID', 'error', 'compile',
        `Target-native route options may only be attached to a routing rule (found on "${node.data.title}").`,
        { nodeId: node.id, entity: { type: 'route', id: node.id } },
      ))
      continue
    }
    if (!isTargetNativeRouteOptionsConfig(config)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_ROUTE_OPTIONS_INVALID', 'error', 'compile',
        `Target-native route options on "${node.data.title}" have invalid typed configuration.`,
        { nodeId: node.id, entity: { type: 'route', id: node.id } },
      ))
      continue
    }
    if (validationTarget && config.target !== validationTarget) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_ROUTE_OPTIONS_UNSUPPORTED', 'error', 'compile',
        `Target-native route options on "${node.data.title}" are Surge-specific; ${validationTarget} has no proven equivalent. Change or remove them before export.`,
        { nodeId: node.id, entity: { type: 'route', id: node.id } },
      ))
      continue
    }
    const matcherKind = resolveRouteMatcherKind(node.data)
    if (!matcherKind || !(SURGE_NO_RESOLVE_MATCHERS as readonly string[]).includes(matcherKind)) {
      context.addIssue(semanticIssue(
        'SURGE_NO_RESOLVE_MATCHER_UNSUPPORTED', 'error', 'compile',
        `Surge no-resolve is only supported for IP-CIDR, IP-CIDR6, GEOIP, IP-ASN, and RULE-SET routes; "${node.data.title}" uses ${matcherKind ?? 'no matcher'}.`,
        { nodeId: node.id, entity: { type: 'route', id: node.id } },
      ))
      continue
    }
    options.push(targetNativeRouteOptionsConfigToIR(node.id, config))
  }
  return options
}
