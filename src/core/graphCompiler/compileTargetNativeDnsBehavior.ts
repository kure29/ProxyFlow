import { semanticIssue } from '../ir'
import {
  isTargetNativeSurgeDnsBehaviorConfig,
  targetNativeSurgeDnsBehaviorConfigToIR,
  type TargetNativeSurgeDnsBehaviorIR,
} from '../targetNative'
import type { GraphNode } from '../../types/project'
import type { GraphCompileContext } from './context'

/** Lift DNS-node-owned Surge always-real-ip intent and bind compiler provenance. */
export function compileTargetNativeSurgeDnsBehavior(
  context: GraphCompileContext,
  effectiveDnsNode?: GraphNode,
): TargetNativeSurgeDnsBehaviorIR | undefined {
  let selected: TargetNativeSurgeDnsBehaviorIR | undefined
  for (const node of context.project.graph.nodes) {
    if (!Object.prototype.hasOwnProperty.call(node.data, 'targetNativeSurgeDnsBehavior')) continue
    const config = node.data.targetNativeSurgeDnsBehavior
    if (config === undefined) continue
    if (node.data.blockType !== 'dns') {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_DNS_INVALID', 'error', 'compile',
        `Target-native Surge DNS behavior may only be attached to the effective DNS node (found on "${node.data.title}").`,
        { nodeId: node.id, entity: { type: 'dns', id: node.id } },
      ))
      continue
    }
    if (node.data.disabled) continue
    if (!isTargetNativeSurgeDnsBehaviorConfig(config)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_DNS_INVALID', 'error', 'compile',
        `Target-native Surge DNS behavior on "${node.data.title}" has invalid typed configuration.`,
        { nodeId: node.id, entity: { type: 'dns', id: node.id } },
      ))
      continue
    }
    let snapshot: typeof config
    try {
      snapshot = structuredClone(config)
    } catch {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_DNS_INVALID', 'error', 'compile',
        `Target-native Surge DNS behavior on "${node.data.title}" is not safely serializable.`,
        { nodeId: node.id, entity: { type: 'dns', id: node.id } },
      ))
      continue
    }
    if (!isTargetNativeSurgeDnsBehaviorConfig(snapshot)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_DNS_INVALID', 'error', 'compile',
        `Target-native Surge DNS behavior on "${node.data.title}" changed during validation.`,
        { nodeId: node.id, entity: { type: 'dns', id: node.id } },
      ))
      continue
    }
    if (effectiveDnsNode && effectiveDnsNode.id === node.id) {
      selected = targetNativeSurgeDnsBehaviorConfigToIR(node.id, snapshot)
    }
  }
  return selected
}

export const compileTargetNativeDnsBehavior = compileTargetNativeSurgeDnsBehavior
