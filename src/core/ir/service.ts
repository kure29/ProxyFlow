import type { ServiceId } from './references'
import type { TrafficMatcherIR } from './routing'

export interface RuleSourceIR {
  id: string
  provider: 'ios-rule-script' | 'builtin' | 'remote' | 'custom'
  format?: 'yaml' | 'text' | 'mrs' | 'sing-box-source' | 'sing-box-binary' | 'multi-client' | 'universal'
  behavior?: 'domain' | 'ipcidr' | 'classical'
  url?: string
  /** Parsed and validated matcher values. Target compilers must lower these instead of the raw source. */
  inlineMatchers?: TrafficMatcherIR[]
}

export interface ServiceIR {
  id: ServiceId
  name: string
  ruleSources: RuleSourceIR[]
  defaultMatchers?: string[]
  /** Concrete matcher values that can be lowered by any capable target. */
  inlineMatchers?: TrafficMatcherIR[]
}

export function findRuleSource<T extends { id: string; name: string; ruleSources: readonly RuleSourceIR[] }>(
  services: readonly T[],
  sourceId: string,
) {
  for (const service of services) {
    const source = service.ruleSources.find((item) => item.id === sourceId)
    if (source) return { service, source }
  }
  return undefined
}

export function findRuleSourceMatches<T extends { id: string; name: string; ruleSources: readonly RuleSourceIR[] }>(
  services: readonly T[],
  sourceId: string,
) {
  return services.flatMap((service) => service.ruleSources
    .filter((source) => source.id === sourceId)
    .map((source) => ({ service, source })))
}
