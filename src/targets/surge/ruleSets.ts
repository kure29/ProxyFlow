import { findRuleSourceMatches, type ProxyFlowIR } from '../../core/ir'
import {
  isTargetNativeRuleSetSourceConfig,
  type TargetNativeRuleSetSourceIR,
} from '../../core/targetNative'

export function resolveSurgeBuiltinRuleSetName(
  ir: ProxyFlowIR,
  sourceId: string,
  nativeSources: readonly TargetNativeRuleSetSourceIR[],
) {
  const sourceMatches = findRuleSourceMatches(ir.services, sourceId)
  if (sourceMatches.length !== 1) return undefined
  const source = sourceMatches[0].source
  if (source.provider !== 'builtin') return undefined
  if (source.url || source.inlineMatchers?.length) return undefined
  const nativeMatches = nativeSources.filter((candidate) => (
    Boolean(candidate)
      && typeof candidate === 'object'
      && (candidate as { sourceId?: unknown }).sourceId === sourceId
  ))
  if (nativeMatches.length !== 1) return undefined
  const native = nativeMatches[0]
  if (native.target !== 'surge' || native.kind !== 'builtin-rule-set' || !isTargetNativeRuleSetSourceConfig(native)) return undefined
  return native.name
}
