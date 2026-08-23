import type { ProxyFlowIR } from '../../core/ir'
import { isLegacyChinaReference } from '../../data/legacyServices'
import { resolveFirstPartyServiceRuleSource } from '../../data/serviceRuleAssets'
import type { CompatibilityIssue } from '../../types/project'
import { surgeIssue } from './errors'

export function resolveSurgeServiceRuleSource(
  ir: ProxyFlowIR,
  serviceId: string,
  routeId: string,
  issues: CompatibilityIssue[],
) {
  const service = ir.services.find((item) => item.id === serviceId)
  if (!service) {
    issues.push(surgeIssue(
      'SURGE_SERVICE_RULE_NOT_FOUND', 'error', 'service-rule',
      `Service “${serviceId}” does not exist in the IR catalog.`, routeId,
    ))
    return undefined
  }
  if (isLegacyChinaReference(service.id) || isLegacyChinaReference(service.name)) {
    issues.push(surgeIssue(
      'SURGE_LEGACY_SERVICE_RULE_UNSUPPORTED', 'error', 'service-rule',
      'Historical China service routing has no Surge RULE-SET asset and cannot be lowered safely.', routeId,
    ))
    return undefined
  }
  const source = resolveFirstPartyServiceRuleSource(service.id, 'surge')
  if (!source) {
    issues.push(surgeIssue(
      'SURGE_SERVICE_RULE_SOURCE_MISSING', 'error', 'service-rule',
      `Service “${service.name}” has no first-party Surge RULE-SET source.`, routeId,
    ))
    return undefined
  }
  return source
}
