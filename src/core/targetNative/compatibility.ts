import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { TargetNativeFinalRouteIR, TargetNativeRouteIR, TargetNativeStrategyIR } from './strategy'
import { isTargetNativeFinalRouteIR, isTargetNativeRouteIR, isTargetNativeStrategyIR } from './strategy'
import type { TargetNativeRuleSetSourceIR } from './ruleSet'
import { isTargetNativeRuleSetSourceIR } from './ruleSet'
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
  nativeFinalRoute?: TargetNativeFinalRouteIR,
): CompatibilityIssue[] {
  const strategyIssues = strategies.flatMap((strategy) => {
    if (!strategy || !isTargetNativeStrategyIR(strategy)) {
      const raw = strategy as unknown as { id?: unknown }
      return [{
        target,
        code: 'TARGET_NATIVE_STRATEGY_INVALID',
        severity: 'error' as const,
        feature: 'target-native-strategy',
        entityId: typeof raw?.id === 'string' ? raw.id : undefined,
        message: 'A target-native strategy contains invalid runtime data.',
      }]
    }
    return strategy.target !== target ? [{
      target,
      code: 'TARGET_NATIVE_STRATEGY_UNSUPPORTED',
      severity: 'error' as const,
      feature: 'target-native-strategy',
      entityId: strategy.id,
      message: `Target-native strategy “${strategy.name}” is Surge-specific; ${target} has no proven equivalent. Change or remove it before export.`,
    }] : []
  })
  const ruleSetIssues = ruleSetSources.flatMap((source) => {
    if (!source || !isTargetNativeRuleSetSourceIR(source)) {
      const raw = source as unknown as { sourceId?: unknown }
      return [{
        target,
        code: 'TARGET_NATIVE_RULE_SET_INVALID',
        severity: 'error' as const,
        feature: 'target-native-rule-set',
        entityId: typeof raw?.sourceId === 'string' ? raw.sourceId : undefined,
        message: 'A target-native Rule Set source contains invalid runtime data.',
      }]
    }
    return source.target !== target ? [{
      target,
      code: 'TARGET_NATIVE_RULE_SET_UNSUPPORTED',
      severity: 'error' as const,
      feature: 'target-native-rule-set',
      entityId: source.sourceId,
      message: `Target-native Rule Set “${source.name}” is Surge-specific; ${target} has no proven equivalent. Change or remove it before export.`,
    }] : []
  })
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
    if (!route || !isTargetNativeRouteIR(route)) return [{
      target,
      code: 'TARGET_NATIVE_ROUTE_INVALID',
      severity: 'error' as const,
      feature: 'target-native-route',
      entityId: typeof (route as { id?: unknown })?.id === 'string' ? (route as { id: string }).id : undefined,
      message: 'A target-native route contains invalid runtime data.',
    }]
    if (route.targetNativeSourcePort !== undefined || route.matcher.kind === 'source-port') {
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
  const finalRouteIssues = nativeFinalRoute === undefined ? [] : !isTargetNativeFinalRouteIR(nativeFinalRoute)
    || (() => {
      const id = nativeFinalRoute.target.id
      const matching = strategies.filter((strategy) => strategy && typeof strategy === 'object'
        && (strategy as unknown as Record<string, unknown>).id === id)
      return matching.length !== 1 || !isTargetNativeStrategyIR(matching[0])
    })() ? [{
    target,
    code: 'TARGET_NATIVE_FINAL_ROUTE_INVALID',
    severity: 'error' as const,
    feature: 'target-native-final-route',
    entityId: typeof (nativeFinalRoute as { id?: unknown })?.id === 'string' ? (nativeFinalRoute as { id: string }).id : undefined,
    message: 'A target-native Final route contains invalid runtime data.',
  }] : [{
    target,
    code: 'TARGET_NATIVE_FINAL_ROUTE_UNSUPPORTED',
    severity: 'error' as const,
    feature: 'target-native-final-route',
    entityId: nativeFinalRoute.id,
    message: `Target-native Final route “${nativeFinalRoute.name}” is Surge-specific; ${target} has no proven equivalent. Change or remove it before export.`,
  }]
  return [...strategyIssues, ...ruleSetIssues, ...finalOptionsIssues, ...routeOptionsIssues, ...routeIssues, ...finalRouteIssues]
}
