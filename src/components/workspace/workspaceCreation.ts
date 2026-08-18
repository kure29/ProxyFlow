import { getTargetCapabilities, type CapabilityStatus, type PrimaryTarget } from '../../core/capabilities'
import type { BlockNodeData, BlockType } from '../../types/project'

export interface WorkspaceCreationOption {
  id: string
  blockType: BlockType
  data?: Partial<BlockNodeData>
  advanced?: boolean
  status?: CapabilityStatus
  disabled?: boolean
}

export const processingCreationOptions: WorkspaceCreationOption[] = [
  { id: 'filter', blockType: 'filter' },
  { id: 'rename', blockType: 'rename' },
  { id: 'sort', blockType: 'sort' },
  { id: 'deduplicate', blockType: 'deduplicate' },
  { id: 'merge', blockType: 'merge' },
  { id: 'limit', blockType: 'limit' },
]

export const routingCreationOptions: WorkspaceCreationOption[] = [
  { id: 'service', blockType: 'service-rule', data: { routeMatcherKind: 'service', services: [], ruleSource: 'ios_rule_script' } },
  { id: 'domain', blockType: 'service-rule', data: { routeMatcherKind: 'domain-suffix', routeMatcherValue: '', services: [], ruleSource: 'custom' } },
  { id: 'cidr', blockType: 'service-rule', data: { routeMatcherKind: 'ip-cidr', routeMatcherValue: '', services: [], ruleSource: 'custom' } },
  { id: 'port', blockType: 'service-rule', data: { routeMatcherKind: 'port', routeMatcherPort: undefined, services: [], ruleSource: 'custom' } },
]

export function strategyCreationOptions(target: PrimaryTarget | null): WorkspaceCreationOption[] {
  if (!target) return []
  const declarations = getTargetCapabilities(target).strategies
  return [
    strategyOption('manual', 'manual-select', declarations.manual.status),
    strategyOption('auto', 'auto-select', declarations.auto.status),
    strategyOption('failover', 'fallback', declarations.failover.status),
    strategyOption('load-balance', 'load-balance', declarations['load-balance'].status, true),
  ]
}

function strategyOption(
  id: string,
  blockType: BlockType,
  status: CapabilityStatus,
  advanced = false,
): WorkspaceCreationOption {
  return { id, blockType, status, advanced, disabled: status === 'unsupported' }
}
