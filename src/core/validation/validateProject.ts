import type { GraphEdge, GraphNode, ValidationIssue } from '../../types/project'
import { serviceCatalog } from '../../data/serviceCatalog'
import { findRuleSourceMatches, normalizeCustomMatcher } from '../ir'
import { isRoutingRuleType, resolveRouteMatcherKind } from '../routing/routeProductModel'

export function validateGraph(nodes: GraphNode[], edges: GraphEdge[], services = serviceCatalog): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const incoming = (id: string) => edges.some((edge) => edge.target === id)
  const outgoing = (id: string) => edges.some((edge) => edge.source === id)

  for (const node of nodes) {
    if (node.data.disabled) continue
    const add = (code: string, message: string, severity: 'warning' | 'error' = 'warning') => {
      issues.push({ id: `${node.id}-${issues.length}`, code, nodeId: node.id, severity, message })
    }
    if (['subscription', 'manual-proxy', 'provider'].includes(node.data.blockType) && !outgoing(node.id)) add('UI_SOURCE_DISCONNECTED', 'This source is not connected to the processing flow.')
    if (['auto-select', 'manual-select', 'fallback', 'load-balance'].includes(node.data.blockType) && !incoming(node.id)) add('UI_STRATEGY_SOURCE_MISSING', 'This strategy has no proxy source.')
    if (node.data.blockType === 'proxy-chain' && (node.data.hopIds?.length ?? 0) === 0) add('UI_CHAIN_EMPTY', 'A proxy chain needs at least one hop.', 'error')
    if (isRoutingRuleType(node.data.blockType) && !node.data.targetId && !node.data.targetKind) add('UI_ROUTE_TARGET_MISSING', 'This routing rule has no target strategy.')
    if (isRoutingRuleType(node.data.blockType)) {
      const kind = resolveRouteMatcherKind(node.data)
      if (!kind) add('UI_ROUTE_MATCHER_MISSING', 'This routing rule has no matcher value.', 'error')
      else if (kind === 'service') {
        if ((node.data.services ?? []).length === 0) add('UI_ROUTE_MATCHER_MISSING', 'This routing rule has no service matcher.', 'error')
      }
      else {
        const normalized = normalizeCustomMatcher(kind, node.data.routeMatcherValue, node.data.routeMatcherPort)
        if (!normalized.ok) add(normalized.code, `This routing rule has an invalid ${kind} matcher.`, 'error')
        else if (normalized.matcher.kind === 'rule-set') {
          const matches = findRuleSourceMatches(services, normalized.matcher.id)
          if (matches.length === 0) add('ROUTE_RULE_SET_NOT_FOUND', 'This routing rule references a missing rule set.', 'error')
          else if (matches.length > 1) add('ROUTE_RULE_SET_AMBIGUOUS', 'This routing rule references an ambiguous rule set.', 'error')
        }
      }
    }
    if (node.data.blockType === 'final' && !outgoing(node.id)) add('UI_FINAL_TARGET_MISSING', 'Final must connect to an outbound target.', 'error')
    if (node.data.blockType === 'output' && !node.data.client) add('UI_OUTPUT_CLIENT_MISSING', 'Select a target client.', 'error')
    if (node.data.blockType === 'filter' && node.data.filterMode === 'regex' && node.data.filterRegexPattern?.trim()) {
      try {
        new RegExp(node.data.filterRegexPattern)
      } catch {
        add('FILTER_INVALID_REGEX', 'The filter regular expression is invalid. Processing was blocked.', 'error')
      }
    }
    if (node.data.blockType === 'rename' && (node.data.renameMode ?? 'regex') === 'regex' && node.data.renamePattern?.trim()) {
      try {
        new RegExp(node.data.renamePattern, `${node.data.renameGlobal ?? true ? 'g' : ''}${node.data.renameIgnoreCase ? 'i' : ''}`)
      } catch {
        add('INVALID_RENAME_REGEX', 'The rename regular expression is invalid. Processing was blocked.', 'error')
      }
    }
    if (node.data.blockType === 'limit' && (!Number.isInteger(node.data.limit) || node.data.limit! < 1)) {
      add('LIMIT_INVALID', 'Limit must be a positive integer.', 'error')
    }
  }
  return issues
}
