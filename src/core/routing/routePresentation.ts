import { normalizeCustomMatcher } from '../ir'
import type { BlockNodeData, GraphNode, RouteMatcherKind, ServiceDefinition } from '../../types/project'
import { resolveRouteMatcherKind } from './routeProductModel'
import { isTargetNativeRuleSetSourceConfig } from '../targetNative'

export const CUSTOM_ROUTE_MATCHERS = [
  'domain', 'domain-suffix', 'domain-keyword', 'ip-cidr', 'ip-cidr6', 'port', 'rule-set',
] as const satisfies readonly RouteMatcherKind[]

export type CustomRouteMatcherKind = typeof CUSTOM_ROUTE_MATCHERS[number]
export type RoutingRuleIntent = 'service' | 'custom'
export type RoutingRuleStatus = 'ready' | 'warning' | 'error' | 'disabled'

export interface RoutingIssueLike {
  nodeId?: string
  severity: 'info' | 'warning' | 'error'
}

export interface RoutingPresentationCopy {
  matcherLabels: Record<RouteMatcherKind, string>
  emptyMatcher: string
  targetMissing: string
  ruleCount: (count: number) => string
}

export interface RoutingRulePresentation {
  id: string
  title: string
  intent: RoutingRuleIntent
  matcherKind?: RouteMatcherKind
  matcherSummary: string
  serviceNames: string[]
  serviceRuleCount?: number
  targetSummary: string
  status: RoutingRuleStatus
}

export function presentRoutingRule(
  node: GraphNode,
  services: readonly ServiceDefinition[],
  issues: readonly RoutingIssueLike[],
  copy: RoutingPresentationCopy,
): RoutingRulePresentation {
  const matcherKind = resolveRouteMatcherKind(node.data)
  const selectedServices = matcherKind === 'service'
    ? resolveSelectedServices(node.data.services ?? [], services)
    : []
  const serviceNames = selectedServices.map((service) => service.name)
  const serviceRuleCount = sumKnownRuleCounts(selectedServices)
  const matcherSummary = matcherKind === 'service'
    ? serviceMatcherSummary(serviceNames, serviceRuleCount, copy)
    : customMatcherSummary(node.data, matcherKind, copy)

  return {
    id: node.id,
    title: node.data.title,
    intent: matcherKind === 'service' ? 'service' : 'custom',
    matcherKind,
    matcherSummary,
    serviceNames,
    serviceRuleCount,
    targetSummary: routeTargetSummary(node.data, copy.targetMissing),
    status: routeStatus(node, matcherKind, issues),
  }
}

export function resolveSelectedServices(
  values: readonly string[],
  services: readonly ServiceDefinition[],
): ServiceDefinition[] {
  const lookup = new Map<string, ServiceDefinition>()
  for (const service of services) {
    lookup.set(service.id.toLowerCase(), service)
    lookup.set(service.name.toLowerCase(), service)
  }
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const service = lookup.get(value.trim().toLowerCase())
    if (!service || seen.has(service.id)) return []
    seen.add(service.id)
    return [service]
  })
}

export function sumKnownRuleCounts(services: readonly ServiceDefinition[]): number | undefined {
  const counts = services.flatMap((service) => service.ruleSources
    .map((source) => source.ruleCount)
    .filter((count): count is number => Number.isFinite(count) && count! >= 0))
  return counts.length ? counts.reduce((sum, count) => sum + count, 0) : undefined
}

function serviceMatcherSummary(
  names: readonly string[],
  ruleCount: number | undefined,
  copy: RoutingPresentationCopy,
) {
  if (!names.length) return copy.emptyMatcher
  const serviceSummary = names.join(', ')
  return ruleCount === undefined ? serviceSummary : `${serviceSummary} · ${copy.ruleCount(ruleCount)}`
}

function customMatcherSummary(
  data: BlockNodeData,
  matcherKind: RouteMatcherKind | undefined,
  copy: RoutingPresentationCopy,
) {
  if (!matcherKind) return copy.emptyMatcher
  const value = matcherKind === 'port'
    ? data.routeMatcherPort
    : matcherKind === 'rule-set'
      ? ruleSetPresentationName(data)
      : data.routeMatcherValue?.trim()
  return value === undefined || value === ''
    ? `${copy.matcherLabels[matcherKind]} · ${copy.emptyMatcher}`
    : `${copy.matcherLabels[matcherKind]} · ${value}`
}

/** Human-facing Rule Set label; never exposes the synthetic source ID for a
 * typed Surge built-in source. */
export function ruleSetPresentationName(data: Pick<BlockNodeData, 'targetNativeRuleSet' | 'customRuleSource' | 'routeMatcherValue'>) {
  if (isTargetNativeRuleSetSourceConfig(data.targetNativeRuleSet)) return data.targetNativeRuleSet.name
  return data.customRuleSource?.name ?? data.routeMatcherValue?.trim()
}

function routeTargetSummary(data: BlockNodeData, missing: string) {
  if (data.targetKind === 'direct') return 'DIRECT'
  if (data.targetKind === 'reject') return 'REJECT'
  return data.targetLabel?.trim() || data.targetId?.trim() || missing
}

function routeStatus(
  node: GraphNode,
  matcherKind: RouteMatcherKind | undefined,
  issues: readonly RoutingIssueLike[],
): RoutingRuleStatus {
  if (node.data.disabled) return 'disabled'
  const nodeIssues = issues.filter((issue) => issue.nodeId === node.id)
  if (nodeIssues.some((issue) => issue.severity === 'error')) return 'error'
  if (nodeIssues.some((issue) => issue.severity === 'warning')) return 'warning'
  if (!hasValidTarget(node.data) || !hasValidMatcher(node.data, matcherKind)) return 'error'
  return 'ready'
}

function hasValidTarget(data: BlockNodeData) {
  return data.targetKind === 'direct' || data.targetKind === 'reject' || Boolean(data.targetId?.trim())
}

function hasValidMatcher(data: BlockNodeData, matcherKind: RouteMatcherKind | undefined) {
  if (!matcherKind) return false
  if (matcherKind === 'service') return (data.services ?? []).some((service) => service.trim())
  return normalizeCustomMatcher(matcherKind, data.routeMatcherValue, data.routeMatcherPort).ok
}
