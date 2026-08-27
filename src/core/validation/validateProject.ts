import type { GraphEdge, GraphNode, ValidationIssue } from '../../types/project'
import { serviceCatalog } from '../../data/serviceCatalog'
import { findRuleSourceMatches, normalizeCustomMatcher } from '../ir'
import { isRoutingRuleType, resolveRouteMatcherKind } from '../routing/routeProductModel'
import { isPolicyReference, isTargetNativeFinalOptionsConfig, isTargetNativeRuleSetSourceConfig, isTargetNativeStrategyConfig, isValidSurgeMccmnc } from '../targetNative'

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
          if (node.data.customRuleSource) {
            if (node.data.customRuleSource.id !== normalized.matcher.id) add('ROUTE_RULE_SOURCE_REFERENCE_MISMATCH', 'This route does not reference its attached rule source.', 'error')
            else if (!node.data.customRuleSource.enabled) add('RULE_SOURCE_DISABLED', 'This rule source is disabled.', 'error')
            else if (node.data.customRuleSource.matchers.length === 0) add('RULE_SOURCE_NO_SUPPORTED_RULES', 'This rule source has no normalized rules.', 'error')
            continue
          }
          if (node.data.targetNativeRuleSet) {
            if (!isTargetNativeRuleSetSourceConfig(node.data.targetNativeRuleSet)) add('TARGET_NATIVE_RULE_SET_INVALID', 'This target-native Rule Set source has invalid typed configuration.', 'error')
            continue
          }
          const matches = findRuleSourceMatches(services, normalized.matcher.id)
          if (matches.length === 0) add('ROUTE_RULE_SET_NOT_FOUND', 'This routing rule references a missing rule set.', 'error')
          else if (matches.length > 1) add('ROUTE_RULE_SET_AMBIGUOUS', 'This routing rule references an ambiguous rule set.', 'error')
        }
      }
    }
    if (node.data.blockType === 'final' && !hasInlineFinalTarget(node) && !outgoing(node.id)) add('UI_FINAL_TARGET_MISSING', 'Final must connect to an outbound target.', 'error')
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
    if (node.data.blockType === 'target-native-strategy') {
      const native = node.data.targetNativeStrategy
      if (!isTargetNativeStrategyConfig(native)) add('TARGET_NATIVE_STRATEGY_INVALID', 'This target-native strategy has invalid typed configuration.', 'error')
      else if (native.kind === 'smart') {
        if (native.members.some((member) => !isPolicyReference(member) || member.kind !== 'proxy')) add('SURGE_SMART_MEMBER_UNSUPPORTED', 'Surge Smart accepts proxy endpoints only.', 'error')
        if (native.evaluateBeforeUse !== undefined && typeof native.evaluateBeforeUse !== 'boolean') add('SURGE_SMART_EVALUATE_BEFORE_USE_INVALID', 'Smart evaluate-before-use must be a boolean.', 'error')
        if (native.policyPriority !== undefined) {
          if (!Array.isArray(native.policyPriority) || native.policyPriority.length === 0) add('SURGE_SMART_POLICY_PRIORITY_INVALID', 'Smart policy-priority must contain at least one rule.', 'error')
          else native.policyPriority.forEach((rule) => {
            let validPattern = Boolean(rule && typeof rule.pattern === 'string' && rule.pattern.trim())
            if (validPattern) {
              try { new RegExp(rule.pattern) } catch { validPattern = false }
            }
            if (!validPattern || typeof rule?.factor !== 'number' || !Number.isFinite(rule.factor) || rule.factor <= 0) add('SURGE_SMART_POLICY_PRIORITY_INVALID', 'Smart policy-priority rules require valid regex patterns and positive factors.', 'error')
          })
        }
      }
      else if (native.kind === 'subnet') {
        if (!isPolicyReference(native.defaultPolicy)) add('SURGE_SUBNET_DEFAULT_REQUIRED', 'Surge Subnet requires an explicit default policy.', 'error')
        if (native.conditions.some((condition) => {
          if (!condition?.matcher || typeof condition.matcher.value !== 'string' || !condition.matcher.value.trim()) return true
          return condition.matcher.kind === 'mccmnc' && !isValidSurgeMccmnc(condition.matcher.value)
        })) add('SURGE_SUBNET_MATCHER_INVALID', 'Every Subnet condition requires a valid matcher value.', 'error')
      }
    }
    if (node.data.targetNativeFinalOptions !== undefined) {
      if (node.data.blockType !== 'final') add('TARGET_NATIVE_FINAL_OPTIONS_INVALID', 'Target-native Final options may only be attached to a Final node.', 'error')
      else if (!isTargetNativeFinalOptionsConfig(node.data.targetNativeFinalOptions)) add('TARGET_NATIVE_FINAL_OPTIONS_INVALID', 'This target-native Final options config is invalid.', 'error')
    }
  }
  return issues
}

function hasInlineFinalTarget(node: GraphNode) {
  if (node.data.targetKind === 'direct' || node.data.targetKind === 'reject') return true
  const legacyTarget = `${node.data.targetId ?? ''} ${node.data.targetLabel ?? ''}`.trim().toLowerCase()
  return /\b(?:direct|reject)\b/.test(legacyTarget)
}
