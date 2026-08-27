import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { TargetNativeRouteIR, TargetNativeStrategyIR } from './strategy'
import type { TargetNativeRuleSetSourceIR } from './ruleSet'
import { isTargetNativeFinalOptionsIR, type TargetNativeFinalOptionsIR } from './final'
import { isTargetNativeRouteOptionsIR, type TargetNativeRouteOptionsIR } from './routeOptions'
import { isTargetNativeSourcePortIR, isTargetNativeSourcePortMatcher } from './sourcePort'

/** Every non-Surge adapter rejects a Surge-native extension rather than silently flattening it. */
export function targetNativeUnsupportedIssues(
  target: TargetClient,
  strategies: readonly TargetNativeStrategyIR[] = [],
  routes: readonly TargetNativeRouteIR[] = [],
  ruleSetSources: readonly TargetNativeRuleSetSourceIR[] = [],
  finalOptions?: TargetNativeFinalOptionsIR,
  routeOptions: readonly TargetNativeRouteOptionsIR[] = [],
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
  const finalOptionsIssues = finalOptions !== undefined
    && (!isTargetNativeFinalOptionsIR(finalOptions) || finalOptions.target !== target) ? [{
    target,
    code: 'TARGET_NATIVE_FINAL_OPTIONS_UNSUPPORTED',
    severity: 'error' as const,
    feature: 'target-native-final-options',
    entityId: isTargetNativeFinalOptionsIR(finalOptions) ? finalOptions.finalNodeId : undefined,
    message: `Surge-specific Final dns-failed intent has no proven equivalent for ${target}; change or remove it before export.`,
  }] : []
  const routeOptionsIssues = routeOptions.flatMap((options) => !isTargetNativeRouteOptionsIR(options) || options.target !== target ? [{
    target,
    code: 'TARGET_NATIVE_ROUTE_OPTIONS_UNSUPPORTED',
    severity: 'error' as const,
    feature: 'target-native-route-options',
    entityId: isTargetNativeRouteOptionsIR(options) ? options.routeId : undefined,
    message: `Surge-specific route options have no proven equivalent for ${target}; change or remove them before export.`,
  }] : [])
  const routeIssues = routes.flatMap((route) => {
    if (route.targetNativeSourcePort !== undefined || route.matcher?.kind === 'source-port') {
      if (!isTargetNativeSourcePortMatcher(route.matcher) || !isTargetNativeSourcePortIR(route.targetNativeSourcePort) || route.targetNativeSourcePort.routeId !== route.id || route.targetNativeSourcePort.port !== route.matcher.port) return [{
        target,
        code: 'TARGET_NATIVE_SOURCE_PORT_INVALID',
        severity: 'error' as const,
        feature: 'target-native-source-port',
        entityId: route.id,
        message: `Surge source-port route “${route.name}” has invalid runtime provenance.`,
      }]
      return [{
        target,
        code: 'TARGET_NATIVE_SOURCE_PORT_UNSUPPORTED',
        severity: 'error' as const,
        feature: 'target-native-source-port',
        entityId: route.id,
        message: `Route “${route.name}” uses the Surge-specific SRC-PORT matcher; ${target} has no proven equivalent. Change or remove it before export.`,
      }]
    }
    return [{
      target,
      code: 'TARGET_NATIVE_STRATEGY_UNSUPPORTED',
      severity: 'error' as const,
      feature: 'target-native-strategy',
      entityId: route.id,
      message: `Route “${route.name}” targets a Surge-specific strategy; ${target} has no proven equivalent. Change or remove it before export.`,
    }]
  })
  return [...strategyIssues, ...ruleSetIssues, ...finalOptionsIssues, ...routeOptionsIssues, ...routeIssues]
}
