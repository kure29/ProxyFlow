import { semanticIssue } from '../ir'
import type { PrimaryTarget } from '../capabilities'
import {
  isTargetNativeSurgeGeneralNetworkConfig,
  validateSurgeVifRouteConfig,
  targetNativeSurgeGeneralNetworkConfigToIR,
  type TargetNativeSurgeGeneralNetworkIR,
} from '../targetNative'
import type { GraphCompileContext } from './context'

/**
 * Lift Output-owned Surge General Network intent into a keyed extension.
 *
 * This intentionally does not consult `validationTarget`: a valid Surge
 * record attached to Output A must not make an unrelated Output B (for
 * example, Mihomo) fail at graph compilation.  The selected target adapter
 * performs the final compatibility decision after selecting its own owner.
 */
export function compileTargetNativeSurgeGeneralNetworks(
  context: GraphCompileContext,
): TargetNativeSurgeGeneralNetworkIR[] {
  const records: TargetNativeSurgeGeneralNetworkIR[] = []
  const seenOutputIds = new Set<string>()

  for (const node of context.project.graph.nodes) {
    // Only an own persisted field is eligible.  Reading a value inherited
    // from a polluted prototype would bypass the Config boundary entirely.
    if (!Object.prototype.hasOwnProperty.call(node.data, 'targetNativeSurgeGeneralNetwork')) continue
    const config = node.data.targetNativeSurgeGeneralNetwork
    if (config === undefined) continue

    // Retained intent on a disabled Output is deliberately inert until the
    // user re-enables or removes it.  It remains in the persisted node data.
    if (node.data.blockType === 'output' && node.data.disabled) continue

    if (node.data.blockType !== 'output') {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_GENERAL_INVALID', 'error', 'compile',
        `Target-native Surge General Network settings may only be attached to an Output node (found on "${node.data.title}").`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }

    if (!isTargetNativeSurgeGeneralNetworkConfig(config)) {
      const routeValidation = validateSurgeVifRouteConfig(config)
      context.addIssue(semanticIssue(
        routeValidation.ok ? 'TARGET_NATIVE_GENERAL_INVALID' : routeValidation.code, 'error', 'compile',
        `Target-native Surge General Network settings on "${node.data.title}" have invalid typed configuration.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }

    // Snapshot the validated Project value before binding it to the compiler
    // owner.  This keeps a hostile accessor/proxy from changing the values
    // between the Config boundary and conversion into runtime IR.
    let snapshot: typeof config
    try {
      snapshot = structuredClone(config)
    } catch {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_GENERAL_INVALID', 'error', 'compile',
        `Target-native Surge General Network settings on "${node.data.title}" are not safely serializable.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    if (!isTargetNativeSurgeGeneralNetworkConfig(snapshot)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_GENERAL_INVALID', 'error', 'compile',
        `Target-native Surge General Network settings on "${node.data.title}" changed during validation.`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }

    if (seenOutputIds.has(node.id)) {
      context.addIssue(semanticIssue(
        'TARGET_NATIVE_GENERAL_INVALID', 'error', 'compile',
        `Target-native Surge General Network settings resolve to more than one Output owner for "${node.id}".`,
        { nodeId: node.id, entity: { type: 'output', id: node.id } },
      ))
      continue
    }
    seenOutputIds.add(node.id)
    records.push(targetNativeSurgeGeneralNetworkConfigToIR(node.id, snapshot))
  }

  return records
}

// Short alias used by callers that already refer to target-native extensions
// without repeating the Surge namespace.
export const compileTargetNativeGeneralNetworks = compileTargetNativeSurgeGeneralNetworks

/**
 * A target compiler produces one profile for its effective Output.  When a
 * Project has more than one enabled Output for that target and at least one
 * of them carries G1 intent, there is no safe implicit choice.  Report the
 * ambiguity at the target-specific graph boundary so the intent cannot be
 * silently omitted by a selector that returns `undefined`.
 */
export function validateTargetNativeSurgeGeneralNetworkOutputSelection(
  context: GraphCompileContext,
  records: readonly TargetNativeSurgeGeneralNetworkIR[],
  validationTarget: PrimaryTarget | null | undefined,
) {
  if (!validationTarget || records.length === 0) return
  const outputs = context.project.graph.nodes.filter((node) => (
    !node.data.disabled
    && node.data.blockType === 'output'
    && node.data.client === validationTarget
  ))
  if (outputs.length <= 1) return
  const outputIds = new Set(outputs.map((node) => node.id))
  const owned = records.filter((record) => outputIds.has(record.outputNodeId))
  if (owned.length === 0) return
  const ownerIds = outputs.map((node) => node.id).join(', ')
  context.addIssue(semanticIssue(
    'TARGET_NATIVE_GENERAL_AMBIGUOUS', 'error', 'compile',
    `Target-native Surge General Network settings cannot be assigned safely because multiple enabled ${validationTarget} Outputs are active (${ownerIds}). Select one effective Output or remove the retained G1 intent.`,
    { nodeId: owned[0].outputNodeId, entity: { type: 'output', id: owned[0].outputNodeId } },
  ))
}
