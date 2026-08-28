import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { TargetNativeFinalRouteIR, TargetNativeRouteIR, TargetNativeStrategyIR } from './strategy'
import { isTargetNativeFinalRouteIR, isTargetNativeRouteIR, isTargetNativeStrategyIR, resolvesUniqueTargetNativeStrategy } from './strategy'
import type { TargetNativeRuleSetSourceIR } from './ruleSet'
import { isTargetNativeRuleSetSourceIR } from './ruleSet'
import { isTargetNativeFinalOptionsIR, type TargetNativeFinalOptionsIR } from './final'
import { isTargetNativeRouteOptionsIR, type TargetNativeRouteOptionsIR } from './routeOptions'
import { isTargetNativeSourcePortIR, isTargetNativeSourcePortMatcher } from './sourcePort'
import { isTargetNativeSurgeGeneralConnectivityIR, type TargetNativeSurgeGeneralConnectivityIR } from './generalConnectivity'
import { isTargetNativeSurgeGeneralNetworkIR, type TargetNativeSurgeGeneralNetworkIR } from './generalNetwork'
import { isTargetNativeSurgeGeneralProxyBypassIR, type TargetNativeSurgeGeneralProxyBypassIR } from './generalProxyBypass'
import { isTargetNativeSurgeDnsBehaviorIR, type TargetNativeSurgeDnsBehaviorIR } from './dnsBehavior'

/** Every non-Surge adapter rejects a Surge-native extension rather than silently flattening it. */
export function targetNativeUnsupportedIssues(
  target: TargetClient,
  strategies: readonly TargetNativeStrategyIR[] = [],
  routes: readonly TargetNativeRouteIR[] = [],
  ruleSetSources: readonly TargetNativeRuleSetSourceIR[] = [],
  finalOptions?: TargetNativeFinalOptionsIR,
  routeOptions: readonly TargetNativeRouteOptionsIR[] = [],
  nativeFinalRoute?: TargetNativeFinalRouteIR,
  targetNativeSurgeGeneralNetwork?: TargetNativeSurgeGeneralNetworkIR,
  outputNodeId?: string,
  /** Optional runtime Universal output list used to independently verify the
   * compiler-selected owner.  Omitted for backwards-compatible direct
   * callers; target adapters pass it at their runtime boundary. */
  outputs?: unknown,
  targetNativeSurgeGeneralConnectivity?: TargetNativeSurgeGeneralConnectivityIR,
  targetNativeSurgeDnsBehavior?: TargetNativeSurgeDnsBehaviorIR,
  effectiveDnsNodeId?: string,
  targetNativeSurgeGeneralProxyBypass?: TargetNativeSurgeGeneralProxyBypassIR,
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
    if (route.target.kind !== 'strategy'
      || !resolvesUniqueTargetNativeStrategy(route.target.id, strategies)) return [{
      target,
      code: 'TARGET_NATIVE_ROUTE_INVALID',
      severity: 'error' as const,
      feature: 'target-native-route',
      entityId: route.id,
      message: 'A non-SRC-PORT target-native route must resolve to exactly one valid target-native strategy.',
    }]
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
    || !resolvesUniqueTargetNativeStrategy(nativeFinalRoute.target.id, strategies) ? [{
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
  const generalRuntime = validateGeneralRuntime(targetNativeSurgeGeneralNetwork)
  const generalIssues = targetNativeSurgeGeneralNetwork === undefined
    ? []
    : !generalRuntime
      ? [{
        target,
        code: 'TARGET_NATIVE_GENERAL_INVALID',
        severity: 'error' as const,
        feature: 'target-native-general-network',
        entityId: readRuntimeOutputNodeId(targetNativeSurgeGeneralNetwork),
        message: 'A target-native Surge General Network record contains invalid runtime data.',
      }]
      : typeof outputNodeId !== 'string' || !outputNodeId.trim() || generalRuntime.outputNodeId !== outputNodeId || outputs !== undefined && !hasUniqueEnabledTargetOutput(outputs, target, outputNodeId)
        ? [{
          target,
          code: 'TARGET_NATIVE_GENERAL_OWNER_MISMATCH',
          severity: 'error' as const,
          feature: 'target-native-general-network',
          entityId: generalRuntime.outputNodeId,
          message: 'Target-native Surge General Network settings do not belong to the compiler-selected Output.',
        }]
        : target === 'surge' ? [] : [{
          target,
          code: 'TARGET_NATIVE_GENERAL_UNSUPPORTED',
          severity: 'error' as const,
          feature: 'target-native-general-network',
          entityId: generalRuntime.outputNodeId,
          message: `Surge General Network settings have no proven equivalent for ${target}; change or remove them before export.`,
        }]
  const connectivityRuntime = validateConnectivityRuntime(targetNativeSurgeGeneralConnectivity)
  const connectivityIssues = targetNativeSurgeGeneralConnectivity === undefined
    ? []
    : !connectivityRuntime
      ? [{ target, code: 'TARGET_NATIVE_GENERAL_INVALID', severity: 'error' as const, feature: 'target-native-general-connectivity', entityId: readRuntimeOutputNodeId(targetNativeSurgeGeneralConnectivity), message: 'A target-native Surge General Connectivity record contains invalid runtime data.' }]
      : typeof outputNodeId !== 'string' || !outputNodeId.trim() || connectivityRuntime.outputNodeId !== outputNodeId || outputs !== undefined && !hasUniqueEnabledTargetOutput(outputs, target, outputNodeId)
        ? [{ target, code: 'TARGET_NATIVE_GENERAL_OWNER_MISMATCH', severity: 'error' as const, feature: 'target-native-general-connectivity', entityId: connectivityRuntime.outputNodeId, message: 'Target-native Surge General Connectivity settings do not belong to the compiler-selected Output.' }]
        : target === 'surge' ? []
        : [{ target, code: 'TARGET_NATIVE_GENERAL_UNSUPPORTED', severity: 'error' as const, feature: 'target-native-general-connectivity', entityId: connectivityRuntime.outputNodeId, message: `Surge General Connectivity settings have no proven equivalent for ${target}; change or remove them before export.` }]
  const dnsBehaviorRuntime = targetNativeSurgeDnsBehavior === undefined
    ? undefined
    : validateDnsBehaviorRuntime(targetNativeSurgeDnsBehavior)
  const dnsBehaviorIssues = targetNativeSurgeDnsBehavior === undefined
    ? []
    : !dnsBehaviorRuntime
      ? [{ target, code: 'TARGET_NATIVE_DNS_INVALID', severity: 'error' as const, feature: 'target-native-dns-behavior', entityId: readRuntimeDnsNodeId(targetNativeSurgeDnsBehavior), message: 'A target-native Surge DNS behavior record contains invalid runtime data.' }]
      : typeof effectiveDnsNodeId !== 'string' || !effectiveDnsNodeId.trim() || dnsBehaviorRuntime.dnsNodeId !== effectiveDnsNodeId
        ? [{ target, code: 'TARGET_NATIVE_DNS_OWNER_MISMATCH', severity: 'error' as const, feature: 'target-native-dns-behavior', entityId: dnsBehaviorRuntime.dnsNodeId, message: 'Target-native Surge DNS behavior does not belong to the compiler-selected DNS owner.' }]
        : target === 'surge' ? []
          : [{ target, code: 'TARGET_NATIVE_DNS_UNSUPPORTED', severity: 'error' as const, feature: 'target-native-dns-behavior', entityId: dnsBehaviorRuntime.dnsNodeId, message: `Surge-native DNS behavior has no proven equivalent for ${target}; change or remove it before export.` }]
  const proxyBypassRuntime = targetNativeSurgeGeneralProxyBypass === undefined
    ? undefined
    : validateProxyBypassRuntime(targetNativeSurgeGeneralProxyBypass)
  const proxyBypassIssues = targetNativeSurgeGeneralProxyBypass === undefined
    ? []
    : !proxyBypassRuntime
      ? [{ target, code: 'TARGET_NATIVE_PROXY_BYPASS_INVALID', severity: 'error' as const, feature: 'target-native-proxy-bypass', entityId: readRuntimeOutputNodeId(targetNativeSurgeGeneralProxyBypass), message: 'A target-native Surge Proxy Bypass record contains invalid runtime data.' }]
      : typeof outputNodeId !== 'string' || !outputNodeId.trim() || proxyBypassRuntime.outputNodeId !== outputNodeId || outputs !== undefined && !hasUniqueEnabledTargetOutput(outputs, target, outputNodeId)
        ? [{ target, code: 'SURGE_TARGET_NATIVE_PROXY_BYPASS_OWNER_MISMATCH', severity: 'error' as const, feature: 'target-native-proxy-bypass', entityId: proxyBypassRuntime.outputNodeId, message: 'Target-native Surge Proxy Bypass settings do not belong to the compiler-selected Output.' }]
        : target === 'surge' ? []
          : [{ target, code: 'TARGET_NATIVE_PROXY_BYPASS_UNSUPPORTED', severity: 'error' as const, feature: 'target-native-proxy-bypass', entityId: proxyBypassRuntime.outputNodeId, message: `Surge system proxy compatibility settings have no proven equivalent for ${target}; change or remove them before export.` }]
  return [...strategyIssues, ...ruleSetIssues, ...finalOptionsIssues, ...routeOptionsIssues, ...routeIssues, ...finalRouteIssues, ...generalIssues, ...connectivityIssues, ...dnsBehaviorIssues, ...proxyBypassIssues]
}

function readRuntimeOutputNodeId(value: unknown): string | undefined {
  try {
    if (!value || typeof value !== 'object') return undefined
    const outputNodeId = (value as { outputNodeId?: unknown }).outputNodeId
    return typeof outputNodeId === 'string' ? outputNodeId : undefined
  } catch {
    return undefined
  }
}

function readRuntimeDnsNodeId(value: unknown): string | undefined {
  try {
    if (!value || typeof value !== 'object') return undefined
    const dnsNodeId = (value as { dnsNodeId?: unknown }).dnsNodeId
    return typeof dnsNodeId === 'string' ? dnsNodeId : undefined
  } catch {
    return undefined
  }
}

function validateGeneralRuntime(value: unknown): TargetNativeSurgeGeneralNetworkIR | undefined {
  if (!isTargetNativeSurgeGeneralNetworkIR(value)) return undefined
  try {
    const clone = structuredClone(value)
    return isTargetNativeSurgeGeneralNetworkIR(clone) ? clone : undefined
  } catch {
    return undefined
  }
}

function validateConnectivityRuntime(value: unknown): TargetNativeSurgeGeneralConnectivityIR | undefined {
  if (!isTargetNativeSurgeGeneralConnectivityIR(value)) return undefined
  try {
    const clone = structuredClone(value)
    return isTargetNativeSurgeGeneralConnectivityIR(clone) ? clone : undefined
  } catch {
    return undefined
  }
}

function validateDnsBehaviorRuntime(value: unknown): TargetNativeSurgeDnsBehaviorIR | undefined {
  if (!isTargetNativeSurgeDnsBehaviorIR(value)) return undefined
  try {
    const clone = structuredClone(value)
    return isTargetNativeSurgeDnsBehaviorIR(clone) ? clone : undefined
  } catch {
    return undefined
  }
}

function validateProxyBypassRuntime(value: unknown): TargetNativeSurgeGeneralProxyBypassIR | undefined {
  if (!isTargetNativeSurgeGeneralProxyBypassIR(value)) return undefined
  try {
    const clone = structuredClone(value)
    return isTargetNativeSurgeGeneralProxyBypassIR(clone) ? clone : undefined
  } catch {
    return undefined
  }
}

function hasUniqueEnabledTargetOutput(value: unknown, target: TargetClient, outputNodeId: string): boolean {
  try {
    if (!Array.isArray(value)) return false
    const owners = value.filter((output) => isEnabledTargetOutput(output, target, outputNodeId))
    const targetOutputs = value.filter((output) => isTargetOutputCandidate(output, target))
    const sameId = value.filter((output) => {
      if (!output || typeof output !== 'object') return false
      return (output as { id?: unknown }).id === outputNodeId
    })
    return owners.length === 1 && sameId.length === 1 && targetOutputs.length === 1
  } catch {
    return false
  }
}

function isEnabledTargetOutput(value: unknown, target: TargetClient, outputNodeId: string): boolean {
  if (!value || typeof value !== 'object') return false
  const output = value as { id?: unknown; target?: unknown; enabled?: unknown }
  return output.id === outputNodeId
    && output.target === target
    && output.enabled === true
}

function isTargetOutputCandidate(value: unknown, target: TargetClient): boolean {
  if (!value || typeof value !== 'object') return false
  const output = value as { target?: unknown; enabled?: unknown }
  return output.target === target && output.enabled !== false
}
