import type { GraphNode, ServiceDefinition } from '../types/project'

export const LEGACY_CHINA_SERVICE_ID = 'china'
export const LEGACY_CHINA_SERVICE_NAME = 'China Mainland'

/**
 * Deprecated compatibility data for projects authored before China routing was
 * removed from the Service catalog. It must never be offered by current UI.
 */
export const legacyChinaServiceDefinition: ServiceDefinition = {
  id: LEGACY_CHINA_SERVICE_ID,
  name: LEGACY_CHINA_SERVICE_NAME,
  category: 'regional',
  ruleSources: [{ id: 'builtin-china', provider: 'builtin', format: 'universal', ruleCount: 168 }],
  defaultMatchers: ['GEOSITE', 'GEOIP'],
}

export function isLegacyChinaReference(value: string) {
  const normalized = value.trim().toLocaleLowerCase()
  return normalized === LEGACY_CHINA_SERVICE_ID || normalized === LEGACY_CHINA_SERVICE_NAME.toLocaleLowerCase()
}

export function isCurrentAuthoringService(service: ServiceDefinition) {
  return !isLegacyChinaReference(service.id) && !isLegacyChinaReference(service.name)
}

export function currentAuthoringServices(services: readonly ServiceDefinition[]) {
  return services.filter(isCurrentAuthoringService)
}

export function projectUsesLegacyChina(nodes: readonly GraphNode[]) {
  return nodes.some((node) => (node.data.services ?? []).some(isLegacyChinaReference))
}

export function withLegacyChinaCompatibility(
  services: readonly ServiceDefinition[],
  nodes: readonly GraphNode[],
): readonly ServiceDefinition[] {
  const current = currentAuthoringServices(services)
  if (!projectUsesLegacyChina(nodes)) return current.length === services.length ? services : current

  const existing = services.filter((service) => !isCurrentAuthoringService(service))
  const canonicalAlreadyPresent = existing.length === 1
    && services.at(-1) === existing[0]
    && JSON.stringify(existing[0]) === JSON.stringify(legacyChinaServiceDefinition)
  return canonicalAlreadyPresent ? services : [...current, structuredClone(legacyChinaServiceDefinition)]
}

export function resolveLegacyServiceDefinition(value: string) {
  return isLegacyChinaReference(value) ? legacyChinaServiceDefinition : undefined
}
