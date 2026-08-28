import type { ProxyFlowIR } from '../../core/ir'
import { isPolicyReference, isTargetNativeStrategyIR, type TargetNativeStrategyIR } from '../../core/targetNative'
import type { SurgeGeneralEntry } from './model'

/**
 * Target-native Smart and Subnet policies can expose proxy testing semantics
 * outside the Universal Auto Select/Fallback URL contract. Smart has no
 * authored test URL and always tests proxy members; Subnet only conflicts when
 * it directly exposes proxy policies. A Subnet strategy reference alone is not
 * a conflict because the referenced strategy is checked independently.
 *
 * The helper accepts unknown runtime data so the lowerer can fail closed even
 * when called directly with malformed native records. Compatibility validation
 * remains the authoritative diagnostic boundary.
 */
export function hasSurgeNativeProxyTestingScopeConflict(
  nativeStrategies: readonly unknown[] | undefined,
): boolean {
  if (nativeStrategies === undefined) return false
  if (!Array.isArray(nativeStrategies)) return true
  return nativeStrategies.some((strategy) => isUnsafeNativeProxyTestingStrategy(strategy))
}

/** Return valid native strategies that need a compatibility diagnostic. */
export function unsafeSurgeNativeProxyTestingStrategies(
  nativeStrategies: readonly unknown[] | undefined,
): TargetNativeStrategyIR[] {
  if (!Array.isArray(nativeStrategies)) return []
  return nativeStrategies.filter((strategy): strategy is TargetNativeStrategyIR => {
    return isTargetNativeStrategyIR(strategy) && isUnsafeNativeProxyTestingStrategy(strategy)
  }).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
}

function isUnsafeNativeProxyTestingStrategy(strategy: unknown): boolean {
  if (!isTargetNativeStrategyIR(strategy)) return true
  if (strategy.kind === 'smart') return true
  return [strategy.defaultPolicy, ...strategy.conditions.map((condition) => condition.policy)]
    .some((policy) => !isPolicyReference(policy) || policy.kind === 'proxy')
}

export function compileSurgeGeneral(
  ir: ProxyFlowIR,
  nativeStrategies: readonly unknown[] = [],
): SurgeGeneralEntry[] {
  const testingStrategies = ir.strategies.filter((strategy) => strategy.kind === 'auto-select' || strategy.kind === 'fallback')
  if (testingStrategies.length === 0 || testingStrategies.some((strategy) => !strategy.healthCheck?.url)) return []
  const urls = new Set(testingStrategies.map((strategy) => strategy.healthCheck!.url!))
  if (urls.size !== 1 || ir.strategies.some((strategy) => strategy.kind === 'select' || strategy.kind === 'fixed')) return []
  if (hasSurgeNativeProxyTestingScopeConflict(nativeStrategies)) return []
  return [{ key: 'proxy-test-url', value: [...urls][0] }]
}
