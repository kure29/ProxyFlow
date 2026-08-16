import type { ServiceId } from './references'
import type { TrafficMatcherIR } from './routing'

export interface RuleSourceIR {
  id: string
  provider: 'ios-rule-script' | 'builtin' | 'remote' | 'custom'
  format?: 'yaml' | 'text' | 'mrs' | 'sing-box-source' | 'sing-box-binary' | 'multi-client' | 'universal'
  behavior?: 'domain' | 'ipcidr' | 'classical'
  url?: string
}

export interface ServiceIR {
  id: ServiceId
  name: string
  ruleSources: RuleSourceIR[]
  defaultMatchers?: string[]
  /** Concrete matcher values that can be lowered by any capable target. */
  inlineMatchers?: TrafficMatcherIR[]
}
