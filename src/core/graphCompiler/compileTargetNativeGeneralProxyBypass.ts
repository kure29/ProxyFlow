import { semanticIssue } from '../ir'
import type { PrimaryTarget } from '../capabilities'
import {
  classifySurgeProxyBypassIssue,
  isTargetNativeSurgeGeneralProxyBypassConfig,
  targetNativeSurgeGeneralProxyBypassConfigToIR,
  type TargetNativeSurgeGeneralProxyBypassIR,
} from '../targetNative'
import type { GraphCompileContext } from './context'

/** Lift Output-owned Surge system-proxy compatibility intent. */
export function compileTargetNativeSurgeGeneralProxyBypasses(
  context: GraphCompileContext,
): TargetNativeSurgeGeneralProxyBypassIR[] {
  const records: TargetNativeSurgeGeneralProxyBypassIR[] = []
  const seenOutputIds = new Set<string>()
  for (const node of context.project.graph.nodes) {
    if (!Object.prototype.hasOwnProperty.call(node.data, 'targetNativeSurgeGeneralProxyBypass')) continue
    const config = node.data.targetNativeSurgeGeneralProxyBypass
    if (config === undefined) continue
    if (node.data.blockType === 'output' && node.data.disabled) continue
    if (node.data.blockType !== 'output') {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_PROXY_BYPASS_INVALID', 'error', 'compile',
        `Target-native Surge Proxy Bypass settings may only be attached to an Output node (found on "${node.data.title}").`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    if (!isTargetNativeSurgeGeneralProxyBypassConfig(config)) {
      const focused = classifySurgeProxyBypassIssue(config)
      context.addIssue(semanticIssue(
        focused ?? 'TARGET_NATIVE_PROXY_BYPASS_INVALID', 'error', 'compile',
        `Target-native Surge Proxy Bypass settings on "${node.data.title}" have invalid typed configuration.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    let snapshot: typeof config
    try { snapshot = structuredClone(config) } catch {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_PROXY_BYPASS_INVALID', 'error', 'compile',
        `Target-native Surge Proxy Bypass settings on "${node.data.title}" are not safely serializable.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    if (!isTargetNativeSurgeGeneralProxyBypassConfig(snapshot)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_PROXY_BYPASS_INVALID', 'error', 'compile',
        `Target-native Surge Proxy Bypass settings on "${node.data.title}" changed during validation.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    if (seenOutputIds.has(node.id)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_PROXY_BYPASS_INVALID', 'error', 'compile',
        `Target-native Surge Proxy Bypass settings resolve to more than one Output owner for "${node.id}".`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    seenOutputIds.add(node.id)
    records.push(targetNativeSurgeGeneralProxyBypassConfigToIR(node.id, snapshot))
  }
  return records
}

export const compileTargetNativeGeneralProxyBypasses = compileTargetNativeSurgeGeneralProxyBypasses
export const compileTargetNativeSurgeGeneralProxyBypass = compileTargetNativeSurgeGeneralProxyBypasses

/** Reject ambiguous enabled Surge Output ownership independent of graph order. */
export function validateTargetNativeSurgeGeneralProxyBypassOutputSelection(
  context: GraphCompileContext,
  records: readonly TargetNativeSurgeGeneralProxyBypassIR[],
  validationTarget: PrimaryTarget | null | undefined,
) {
  if (!validationTarget || records.length === 0) return
  const outputs = context.project.graph.nodes.filter((node) => (
    !node.data.disabled && node.data.blockType === 'output' && node.data.client === validationTarget
  ))
  if (outputs.length <= 1) return
  const outputIds = new Set(outputs.map((output) => output.id))
  const owned = records.filter((record) => outputIds.has(record.outputNodeId))
  if (owned.length === 0) return
  context.addIssue(semanticIssue(
    'TARGET_NATIVE_PROXY_BYPASS_AMBIGUOUS', 'error', 'compile',
    `Target-native Surge Proxy Bypass settings cannot be assigned safely because multiple enabled ${validationTarget} Outputs are active (${outputs.map((output) => output.id).join(', ')}).`,
    { nodeId: owned[0].outputNodeId, entity: { type: 'output', id: owned[0].outputNodeId } },
  ))
}
