import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { TargetNativeRouteIR, TargetNativeStrategyIR } from './strategy'
import type { TargetNativeRuleSetSourceIR } from './ruleSet'

/** Every non-Surge adapter rejects a Surge-native extension rather than silently flattening it. */
export function targetNativeUnsupportedIssues(
  target: TargetClient,
  strategies: readonly TargetNativeStrategyIR[] = [],
  routes: readonly TargetNativeRouteIR[] = [],
  ruleSetSources: readonly TargetNativeRuleSetSourceIR[] = [],
): CompatibilityIssue[] {
  const strategyIssues = strategies
    .filter((strategy) => strategy && strategy.target !== target)
    .map((strategy) => ({
      target,
      code: 'TARGET_NATIVE_STRATEGY_UNSUPPORTED',
      severity: 'error' as const,
      feature: 'target-native-strategy',
      entityId: strategy.id,
      message: `Target-native strategy “${typeof strategy.name === 'string' ? strategy.name : 'Unnamed'}” is Surge-specific; ${target} has no proven equivalent. Change or remove it before export.`,
    }))
  const ruleSetIssues = ruleSetSources
    .filter((source) => source && source.target !== target)
    .map((source) => ({
      target,
      code: 'TARGET_NATIVE_RULE_SET_UNSUPPORTED',
      severity: 'error' as const,
      feature: 'target-native-rule-set',
      entityId: source.sourceId,
      message: `Target-native Rule Set “${typeof source.name === 'string' ? source.name : 'Unnamed'}” is Surge-specific; ${target} has no proven equivalent. Change or remove it before export.`,
    }))
  return [...strategyIssues, ...ruleSetIssues, ...routes.map((route) => ({
    target,
    code: 'TARGET_NATIVE_STRATEGY_UNSUPPORTED',
    severity: 'error' as const,
    feature: 'target-native-strategy',
    entityId: route.id,
    message: `Route “${route.name}” targets a Surge-specific strategy; ${target} has no proven equivalent. Change or remove it before export.`,
  }))]
}
