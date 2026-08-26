import type { PrimaryTarget } from '../capabilities'
import {
  isTargetNativeStrategyConfig, targetNativeStrategyConfigToIR,
  type TargetNativeStrategyIR,
} from '../targetNative'
import { semanticIssue } from '../ir'
import type { GraphCompileContext } from './context'

export function compileTargetNativeStrategies(
  context: GraphCompileContext,
  validationTarget: PrimaryTarget | null | undefined,
) {
  const strategies: TargetNativeStrategyIR[] = []
  for (const node of context.project.graph.nodes) {
    if (node.data.disabled || node.data.blockType !== 'target-native-strategy') continue
    const config = node.data.targetNativeStrategy
    if (!isTargetNativeStrategyConfig(config)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_STRATEGY_INVALID', 'error', 'compile',
        `Target-native strategy "${node.data.title}" has invalid typed configuration.`,
        { nodeId: node.id, entity: { type: 'target-native-strategy', id: node.id } },
      ))
      continue
    }
    if (validationTarget && config.target !== validationTarget) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_STRATEGY_UNSUPPORTED', 'error', 'compile',
        `Target-native strategy "${node.data.title}" is ${config.target === 'surge' ? 'Surge-specific' : `${config.target}-specific`}; ${validationTarget} has no proven equivalent. Change or remove it before export.`,
        { nodeId: node.id, entity: { type: 'target-native-strategy', id: node.id } },
      ))
      continue
    }
    strategies.push(targetNativeStrategyConfigToIR(node.id, node.data.title, config))
  }
  return strategies
}
