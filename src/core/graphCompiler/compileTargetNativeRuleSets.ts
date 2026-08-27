import type { PrimaryTarget } from '../capabilities'
import { semanticIssue } from '../ir'
import {
  isTargetNativeRuleSetSourceConfig,
  targetNativeRuleSetSourceConfigToIR,
  type TargetNativeRuleSetSourceIR,
} from '../targetNative'
import type { GraphCompileContext } from './context'

/**
 * Lift typed project provenance into the target-native graph extension. The
 * Universal RuleSet matcher continues to reference only a source id.
 */
export function compileTargetNativeRuleSetSources(
  context: GraphCompileContext,
  validationTarget: PrimaryTarget | null | undefined,
) {
  const sources: TargetNativeRuleSetSourceIR[] = []
  const bySourceId = new Map<string, TargetNativeRuleSetSourceIR>()

  const add = (sourceId: string, value: unknown, entityId: string) => {
    if (!isTargetNativeRuleSetSourceConfig(value)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_RULE_SET_INVALID', 'error', 'compile',
        `Target-native Rule Set source "${sourceId}" has invalid typed configuration.`,
        { nodeId: entityId, entity: { type: 'rule-set', id: sourceId } },
      ))
      return
    }
    if (validationTarget && value.target !== validationTarget) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_RULE_SET_UNSUPPORTED', 'error', 'compile',
        `Target-native Rule Set source "${sourceId}" is Surge-specific; ${validationTarget} has no proven equivalent. Change or remove it before export.`,
        { nodeId: entityId, entity: { type: 'rule-set', id: sourceId } },
      ))
      return
    }
    const native = targetNativeRuleSetSourceConfigToIR(sourceId, value)
    const existing = bySourceId.get(sourceId)
    if (existing && (existing.target !== native.target || existing.kind !== native.kind || existing.name !== native.name)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_RULE_SET_AMBIGUOUS', 'error', 'compile',
        `Target-native Rule Set source "${sourceId}" has conflicting typed provenance.`,
        { nodeId: entityId, entity: { type: 'rule-set', id: sourceId } },
      ))
      return
    }
    if (!existing) {
      bySourceId.set(sourceId, native)
      sources.push(native)
    }
  }

  for (const node of context.project.graph.nodes) {
    if (node.data.disabled || node.data.routeMatcherKind !== 'rule-set') continue
    const config = node.data.targetNativeRuleSet
    if (!config) continue
    const sourceId = (node.data.routeMatcherValue ?? '').trim()
    if (!sourceId) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_RULE_SET_SOURCE_INVALID', 'error', 'compile',
        `Target-native Rule Set route "${node.data.title}" has no source id.`,
        { nodeId: node.id, entity: { type: 'route', id: node.id } },
      ))
      continue
    }
    add(sourceId, config, node.id)
  }

  return sources
}
