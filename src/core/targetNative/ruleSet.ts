/**
 * Target-native Rule Set sources are an extension to the Universal Rule Set
 * intent. They prove that a source reference is a client-owned built-in set,
 * without adding target syntax or matcher kinds to Universal IR.
 */

export type SurgeBuiltinRuleSetName = 'LAN' | 'SYSTEM'

export interface TargetNativeRuleSetSourceConfig {
  target: 'surge'
  kind: 'builtin-rule-set'
  name: SurgeBuiltinRuleSetName
}

export interface TargetNativeRuleSetSourceIR extends TargetNativeRuleSetSourceConfig {
  sourceId: string
}

export function isTargetNativeRuleSetSourceConfig(value: unknown): value is TargetNativeRuleSetSourceConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.target === 'surge'
    && candidate.kind === 'builtin-rule-set'
    && (candidate.name === 'LAN' || candidate.name === 'SYSTEM')
}

export function targetNativeRuleSetSourceConfigToIR(
  sourceId: string,
  config: TargetNativeRuleSetSourceConfig,
): TargetNativeRuleSetSourceIR {
  return { sourceId, ...structuredClone(config) }
}
