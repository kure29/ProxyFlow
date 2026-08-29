import type { TargetCompileOptions } from '../compiler/compilerTypes'
import { isTargetNativeFinalOptionsIR } from './final'
import { isTargetNativeFinalRouteIR, isTargetNativeRouteIR, isTargetNativeStrategyIR } from './strategy'
import { isTargetNativeRouteOptionsIR } from './routeOptions'
import { isTargetNativeRuleSetSourceIR } from './ruleSet'
import { isTargetNativeSurgeGeneralConnectivityIR } from './generalConnectivity'
import { isTargetNativeSurgeGeneralNetworkIR } from './generalNetwork'
import { isTargetNativeSurgeGeneralProxyBypassIR } from './generalProxyBypass'
import { isTargetNativeSurgeDnsBehaviorIR } from './dnsBehavior'

export interface TargetNativeCapabilityEvidence {
  feature: string
  support: 'native-only' | 'unsupported'
  code: string
  message: string
  entityId?: string
}

export type TargetNativeCapabilityEvidenceProvider = (options?: TargetCompileOptions) => TargetNativeCapabilityEvidence[]

/**
 * Converts validated Surge-native runtime records into capability evidence.
 * The provider is registered by the Surge adapter so Universal capability
 * assessment does not need to know which target owns native extensions.
 */
export function collectSurgeNativeCapabilityEvidence(options?: TargetCompileOptions): TargetNativeCapabilityEvidence[] {
  if (!options) return []
  const evidence: TargetNativeCapabilityEvidence[] = []
  const nativeOnly = (feature: string, entityId: string | undefined, message: string, valid = true) => evidence.push({
    feature,
    support: valid ? 'native-only' : 'unsupported',
    code: valid ? 'CAPABILITY_NATIVE_ONLY' : 'CAPABILITY_NATIVE_INVALID',
    message: valid ? message : `${message} The target-native runtime record is invalid.`,
    entityId,
  })

  const nativeStrategies = options.targetNativeStrategies ?? options.nativeStrategies ?? []
  const nativeRuleSets = options.targetNativeRuleSetSources ?? options.nativeRuleSetSources ?? []
  const routeOptions = options.targetNativeRouteOptions ?? options.nativeRouteOptions ?? []
  for (const strategy of nativeStrategies) {
    const record = recordFields(strategy)
    nativeOnly(
      `target-native-strategy:${typeof record.kind === 'string' ? record.kind : 'unknown'}`,
      stringField(record.id),
      typeof record.name === 'string'
        ? `Strategy “${record.name}” is intentionally owned by the Surge native extension boundary.`
        : 'A strategy is intentionally owned by the Surge native extension boundary.',
      isTargetNativeStrategyIR(strategy),
    )
  }
  for (const route of options.nativeRoutes ?? []) {
    const record = recordFields(route)
    nativeOnly('target-native-route', stringField(record.id), typeof record.name === 'string' ? `Route “${record.name}” is intentionally Surge-native.` : 'A route is intentionally Surge-native.', isTargetNativeRouteIR(route))
  }
  if (options.nativeFinalRoute) {
    const record = recordFields(options.nativeFinalRoute)
    nativeOnly('target-native-final-route', stringField(record.id), typeof record.name === 'string' ? `Final route “${record.name}” is intentionally Surge-native.` : 'A Final route is intentionally Surge-native.', isTargetNativeFinalRouteIR(options.nativeFinalRoute))
  }
  for (const source of nativeRuleSets) {
    const record = recordFields(source)
    nativeOnly('target-native-rule-set', stringField(record.sourceId), typeof record.name === 'string' ? `Rule source “${record.name}” is intentionally Surge-native.` : 'A rule source is intentionally Surge-native.', isTargetNativeRuleSetSourceIR(source))
  }
  if (options.targetNativeFinalOptions) nativeOnly('target-native-final-options', stringField(recordFields(options.targetNativeFinalOptions).finalNodeId), 'Final options are intentionally Surge-native.', isTargetNativeFinalOptionsIR(options.targetNativeFinalOptions))
  for (const route of routeOptions) nativeOnly('target-native-route-options', stringField(recordFields(route).routeId), 'Route options are intentionally Surge-native.', isTargetNativeRouteOptionsIR(route))
  if (options.targetNativeSurgeGeneralNetwork) nativeOnly('target-native-general-network', stringField(recordFields(options.targetNativeSurgeGeneralNetwork).outputNodeId), 'General Network settings are intentionally Surge-native.', isTargetNativeSurgeGeneralNetworkIR(options.targetNativeSurgeGeneralNetwork))
  if (options.targetNativeSurgeGeneralConnectivity) nativeOnly('target-native-general-connectivity', stringField(recordFields(options.targetNativeSurgeGeneralConnectivity).outputNodeId), 'General Connectivity settings are intentionally Surge-native.', isTargetNativeSurgeGeneralConnectivityIR(options.targetNativeSurgeGeneralConnectivity))
  if (options.targetNativeSurgeGeneralProxyBypass) nativeOnly('target-native-proxy-bypass', stringField(recordFields(options.targetNativeSurgeGeneralProxyBypass).outputNodeId), 'Proxy Bypass settings are intentionally Surge-native.', isTargetNativeSurgeGeneralProxyBypassIR(options.targetNativeSurgeGeneralProxyBypass))
  if (options.targetNativeSurgeDnsBehavior) nativeOnly('target-native-dns-behavior', stringField(recordFields(options.targetNativeSurgeDnsBehavior).dnsNodeId), 'DNS behavior is intentionally Surge-native.', isTargetNativeSurgeDnsBehaviorIR(options.targetNativeSurgeDnsBehavior))
  return evidence
}

function recordFields(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
