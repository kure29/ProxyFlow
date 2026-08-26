import { getTargetCapabilities, type CapabilityStatus, type PrimaryTarget } from '../../core/capabilities'
import type { BlockNodeData, BlockType } from '../../types/project'
import type { MessageKey } from '../../i18n'

export interface WorkspaceCreationOption {
  id: string
  blockType: BlockType
  data?: Partial<BlockNodeData>
  advanced?: boolean
  status?: CapabilityStatus
  disabled?: boolean
  titleKey?: MessageKey
  descriptionKey?: MessageKey
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
  { id: 'domain', blockType: 'custom-rule', data: { routeMatcherKind: 'domain-suffix', routeMatcherValue: '', services: [], ruleSource: 'custom' } },
  { id: 'cidr', blockType: 'custom-rule', data: { routeMatcherKind: 'ip-cidr', routeMatcherValue: '', services: [], ruleSource: 'custom' } },
  { id: 'port', blockType: 'custom-rule', data: { routeMatcherKind: 'port', routeMatcherPort: undefined, services: [], ruleSource: 'custom' } },
]

export function strategyCreationOptions(target: PrimaryTarget | null): WorkspaceCreationOption[] {
  if (!target) return []
  const declarations = getTargetCapabilities(target).strategies
  const universal = [
    strategyOption('manual', 'manual-select', declarations.manual.status),
    strategyOption('auto', 'auto-select', declarations.auto.status),
    strategyOption('failover', 'fallback', declarations.failover.status),
    strategyOption('load-balance', 'load-balance', declarations['load-balance'].status, true),
    strategyOption('chain', 'proxy-chain', declarations.chain.status, true),
  ]
  if (target !== 'surge') return universal
  return [
    ...universal,
    { id: 'surge-smart', blockType: 'target-native-strategy', titleKey: 'inspector.targetNativeSmart', descriptionKey: 'inspector.smartMembersHint', data: { targetNativeStrategy: { target: 'surge', kind: 'smart', members: [] } }, status: 'target-native' as const },
    { id: 'surge-subnet', blockType: 'target-native-strategy', titleKey: 'inspector.targetNativeSubnet', descriptionKey: 'inspector.subnetConditions', data: { targetNativeStrategy: { target: 'surge', kind: 'subnet', conditions: [], defaultPolicy: { kind: 'builtin', id: 'DIRECT' } } }, status: 'target-native' as const },
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
