import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { TargetNativeRouteIR, TargetNativeStrategyIR } from './strategy'

/** Every non-Surge adapter rejects a Surge-native extension rather than silently flattening it. */
export function targetNativeUnsupportedIssues(
  target: TargetClient,
  strategies: readonly TargetNativeStrategyIR[] = [],
  routes: readonly TargetNativeRouteIR[] = [],
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
  return [...strategyIssues, ...routes.map((route) => ({
    target,
    code: 'TARGET_NATIVE_STRATEGY_UNSUPPORTED',
    severity: 'error' as const,
    feature: 'target-native-strategy',
    entityId: route.id,
    message: `Route “${route.name}” targets a Surge-specific strategy; ${target} has no proven equivalent. Change or remove it before export.`,
  }))]
}
