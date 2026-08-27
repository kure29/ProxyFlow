import type { PrimaryTarget } from '../capabilities'
import { semanticIssue } from '../ir'
import {
  isTargetNativeFinalOptionsConfig,
  targetNativeFinalOptionsConfigToIR,
  type TargetNativeFinalOptionsIR,
} from '../targetNative'
import type { GraphCompileContext } from './context'

/**
 * Lift the selected Final node's target-native options into the explicit
 * compiler extension. Disabled Final nodes are intentionally ignored so their
 * persisted intent can be recovered later without blocking compilation.
 */
export function compileTargetNativeFinalOptions(
  context: GraphCompileContext,
  effectiveFinalNodeId: string | undefined,
  validationTarget: PrimaryTarget | null | undefined,
): TargetNativeFinalOptionsIR | undefined {
  for (const node of context.project.graph.nodes) {
    if (node.data.disabled || node.data.targetNativeFinalOptions === undefined || node.data.blockType === 'final') continue
    context.addIssue(semanticIssue(
      'TARGET_NATIVE_FINAL_OPTIONS_INVALID', 'error', 'compile',
      `Target-native Final options may only be attached to a Final node (found on "${node.data.title}").`,
      { nodeId: node.id, entity: { type: 'final', id: node.id } },
    ))
  }
  const enabledFinals = context.project.graph.nodes.filter((node) => !node.data.disabled && node.data.blockType === 'final')

  for (const node of enabledFinals) {
    const config = node.data.targetNativeFinalOptions
    if (config === undefined) continue
    if (!isTargetNativeFinalOptionsConfig(config)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_FINAL_OPTIONS_INVALID', 'error', 'compile',
        `Target-native Final options on "${node.data.title}" have invalid typed configuration.`,
        { nodeId: node.id, entity: { type: 'final', id: node.id } },
      ))
      continue
    }
    if (node.id !== effectiveFinalNodeId) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_FINAL_OPTIONS_NON_EFFECTIVE', 'error', 'compile',
        `Target-native Final options on "${node.data.title}" belong to a non-effective Final node.`,
        { nodeId: node.id, entity: { type: 'final', id: node.id } },
      ))
      continue
    }
  }

  if (!effectiveFinalNodeId) return undefined
  const finalNode = enabledFinals.find((node) => node.id === effectiveFinalNodeId)
  const config = finalNode?.data.targetNativeFinalOptions
  if (!config || !isTargetNativeFinalOptionsConfig(config)) return undefined
  if (validationTarget && config.target !== validationTarget) {
    context.addIssue(semanticIssue(
      'TARGET_NATIVE_FINAL_OPTIONS_UNSUPPORTED', 'error', 'compile',
      `Target-native Final options on "${finalNode.data.title}" are Surge-specific; ${validationTarget} has no proven equivalent. Change or remove them before export.`,
      { nodeId: finalNode.id, entity: { type: 'final', id: finalNode.id } },
    ))
    return undefined
  }
  return targetNativeFinalOptionsConfigToIR(finalNode.id, config)
}
