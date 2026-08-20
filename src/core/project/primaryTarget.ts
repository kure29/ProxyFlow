import type { ProxyFlowProject } from '../../types/project'
import { isPrimaryTarget, type PrimaryTarget } from '../capabilities'

export type PrimaryTargetResolutionReason = 'explicit' | 'single-output' | 'missing-output' | 'multiple-outputs' | 'invalid-metadata' | 'unsupported-output'

export interface PrimaryTargetResolution {
  target: PrimaryTarget | null
  reason: PrimaryTargetResolutionReason
  requiresSelection: boolean
}

export function resolveProjectPrimaryTarget(project: ProxyFlowProject): PrimaryTargetResolution {
  const declared = (project as ProxyFlowProject & { primaryTarget?: unknown }).primaryTarget
  if (declared !== undefined) {
    if (isPrimaryTarget(declared)) return { target: declared, reason: 'explicit', requiresSelection: false }
    return { target: null, reason: 'invalid-metadata', requiresSelection: true }
  }

  const outputs = project.graph.nodes.filter((node) => node.data.blockType === 'output')
  if (outputs.length === 0) return { target: null, reason: 'missing-output', requiresSelection: true }
  if (outputs.length > 1) return { target: null, reason: 'multiple-outputs', requiresSelection: true }
  const target = outputs[0].data.client
  if (!isPrimaryTarget(target)) return { target: null, reason: 'unsupported-output', requiresSelection: true }
  return { target, reason: 'single-output', requiresSelection: false }
}
