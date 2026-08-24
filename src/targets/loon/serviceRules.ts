import type { ProxyFlowIR } from '../../core/ir'
import { isLegacyChinaReference } from '../../data/legacyServices'
import { resolveFirstPartyServiceRuleSource } from '../../data/serviceRuleAssets'
import type { CompatibilityIssue } from '../../types/project'
import { loonIssue } from './errors'

export function resolveLoonServiceRuleSource(
  ir: Pick<ProxyFlowIR, 'services'>,
  serviceId: string,
  routeId: string,
  issues: CompatibilityIssue[],
) {
  const service = ir.services.find((item) => item.id === serviceId)
  if (!service) {
    issues.push(loonIssue(
      'LOON_SERVICE_RULE_NOT_FOUND', 'error', 'service-rule',
      `Service "${serviceId}" does not exist in the IR catalog.`, routeId,
    ))
    return undefined
  }
  if (isLegacyChinaReference(service.id) || isLegacyChinaReference(service.name)) {
    issues.push(loonIssue(
      'LOON_LEGACY_SERVICE_RULE_UNSUPPORTED', 'error', 'service-rule',
      'Historical China service routing has no first-party Loon Remote Rule asset and cannot be lowered safely.', routeId,
    ))
    return undefined
  }
  const source = resolveFirstPartyServiceRuleSource(service.id, 'loon')
  if (!source) {
    issues.push(loonIssue(
      'LOON_SERVICE_RULE_SOURCE_MISSING', 'error', 'service-rule',
      `Service "${service.name}" has no first-party Loon Remote Rule source.`, routeId,
    ))
    return undefined
  }
  return source
}
