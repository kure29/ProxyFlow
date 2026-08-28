import { semanticIssue } from '../ir'
import type { PrimaryTarget } from '../capabilities'
import {
  isTargetNativeSurgeGeneralConnectivityConfig,
  targetNativeSurgeGeneralConnectivityConfigToIR,
  type TargetNativeSurgeGeneralConnectivityIR,
} from '../targetNative'
import type { GraphCompileContext } from './context'

/** Lift only concrete Output-owned Surge G2 connectivity intent. */
export function compileTargetNativeSurgeGeneralConnectivity(
  context: GraphCompileContext,
): TargetNativeSurgeGeneralConnectivityIR[] {
  const records: TargetNativeSurgeGeneralConnectivityIR[] = []
  const seenOutputIds = new Set<string>()

  for (const node of context.project.graph.nodes) {
    if (!Object.prototype.hasOwnProperty.call(node.data, 'targetNativeSurgeGeneralConnectivity')) continue
    const config = node.data.targetNativeSurgeGeneralConnectivity
    if (node.data.blockType !== 'output') {
      if (config !== undefined) context.addIssue(semanticIssue(
        'TARGET_NATIVE_GENERAL_INVALID', 'error', 'compile',
        `Target-native Surge General Connectivity settings may only be attached to an Output node (found on "${node.data.title}").`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    if (config === undefined || node.data.disabled) continue
    if (!isTargetNativeSurgeGeneralConnectivityConfig(config)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_GENERAL_INVALID', 'error', 'compile',
        `Target-native Surge General Connectivity settings on "${node.data.title}" have invalid typed configuration.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    let snapshot: typeof config
    try { snapshot = structuredClone(config) } catch {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_GENERAL_INVALID', 'error', 'compile',
        `Target-native Surge General Connectivity settings on "${node.data.title}" are not safely serializable.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    if (!isTargetNativeSurgeGeneralConnectivityConfig(snapshot)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_GENERAL_INVALID', 'error', 'compile',
        `Target-native Surge General Connectivity settings on "${node.data.title}" changed during validation.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    if (seenOutputIds.has(node.id)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_GENERAL_INVALID', 'error',
        'compile', `Target-native Surge General Connectivity settings resolve to more than one Output owner for "${node.id}".`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    seenOutputIds.add(node.id)
    records.push(targetNativeSurgeGeneralConnectivityConfigToIR(node.id, snapshot))
  }
  return records
}

export const compileTargetNativeGeneralConnectivity = compileTargetNativeSurgeGeneralConnectivity
export const compileTargetNativeSurgeGeneralConnectivities = compileTargetNativeSurgeGeneralConnectivity

export function validateTargetNativeSurgeGeneralConnectivityOutputSelection(
  context: GraphCompileContext,
  records: readonly TargetNativeSurgeGeneralConnectivityIR[],
  validationTarget: PrimaryTarget | null | undefined,
) {
  if (!validationTarget || records.length === 0) return
  const outputs = context.project.graph.nodes.filter((node) => (
    !node.data.disabled && node.data.blockType === 'output' && node.data.client === validationTarget
  ))
  if (outputs.length <= 1) return
  const outputIds = new Set(outputs.map((node) => node.id))
  const owned = records.filter((record) => outputIds.has(record.outputNodeId))
  if (owned.length === 0) return
  context.addIssue(semanticIssue(
    'TARGET_NATIVE_GENERAL_AMBIGUOUS', 'error', 'compile',
    `Target-native Surge General Connectivity settings cannot be assigned safely because multiple enabled ${validationTarget} Outputs are active (${outputs.map((output) => output.id).join(', ')}).`,
    { nodeId: owned[0].outputNodeId, entity: { type: 'output', id: owned[0].outputNodeId } },
  ))
}
