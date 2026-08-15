import type { ServiceId } from './references'

export interface RuleSourceIR {
  id: string
  provider: 'ios-rule-script' | 'builtin' | 'remote' | 'custom'
  format?: 'yaml' | 'text' | 'mrs' | 'multi-client' | 'universal'
  behavior?: 'domain' | 'ipcidr' | 'classical'
  url?: string
}

export interface ServiceIR {
  id: ServiceId
  name: string
  ruleSources: RuleSourceIR[]
  defaultMatchers?: string[]
}
