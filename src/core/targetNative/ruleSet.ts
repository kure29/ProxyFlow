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

/**
 * Stable project-local identifiers for the two Surge built-in Rule Sets.
 * These IDs are provenance handles only; they are never interpreted as
 * Universal matcher syntax or used to infer a built-in source.
 */
export function surgeBuiltinRuleSetSourceId(name: SurgeBuiltinRuleSetName) {
  return `surge-builtin-ruleset-${name.toLowerCase()}`
}

export function surgeBuiltinRuleSetSourceConfig(name: SurgeBuiltinRuleSetName): TargetNativeRuleSetSourceConfig {
  return { target: 'surge', kind: 'builtin-rule-set', name }
}

export function isTargetNativeRuleSetSourceConfig(value: unknown): value is TargetNativeRuleSetSourceConfig {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, ['target', 'kind', 'name'])) return false
  const candidate = value as Record<string, unknown>
  return candidate.target === 'surge'
    && candidate.kind === 'builtin-rule-set'
    && (candidate.name === 'LAN' || candidate.name === 'SYSTEM')
}

export function isTargetNativeRuleSetSourceIR(value: unknown): value is TargetNativeRuleSetSourceIR {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, ['sourceId', 'target', 'kind', 'name'])) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.sourceId === 'string'
    && Boolean(candidate.sourceId.trim())
    && isTargetNativeRuleSetSourceConfig({
      target: candidate.target,
      kind: candidate.kind,
      name: candidate.name,
    })
}

export function targetNativeRuleSetSourceConfigToIR(
  sourceId: string,
  config: TargetNativeRuleSetSourceConfig,
): TargetNativeRuleSetSourceIR {
  return { ...structuredClone(config), sourceId }
}

function hasExactKeys(value: object, allowed: readonly string[]) {
  const keys = Reflect.ownKeys(value)
  return keys.length === allowed.length
    && keys.every((key) => typeof key === 'string' && allowed.includes(key))
}
