export type ServiceCategory = 'ai' | 'streaming' | 'social' | 'development' | 'gaming' | 'regional'

export interface RuleSource {
  id: string
  provider: 'ios-rule-script' | 'builtin' | 'remote' | 'custom'
  format?: 'yaml' | 'text' | 'mrs' | 'sing-box-source' | 'sing-box-binary' | 'multi-client' | 'universal'
  behavior?: 'domain' | 'ipcidr' | 'classical'
  url?: string
  updatedAt?: string
  ruleCount?: number
}

export type ServiceMatcherDefinition =
  | { kind: 'domain'; value: string }
  | { kind: 'domain-suffix'; value: string }
  | { kind: 'domain-keyword'; value: string }
  | { kind: 'ip-cidr'; value: string }
  | { kind: 'ip-cidr6'; value: string }
  | { kind: 'port'; port: number }

export type CustomRuleSourceFormat = 'mihomo-yaml' | 'surge-list'

export interface CustomRuleSource {
  id: string
  name: string
  inputKind: 'file' | 'url'
  format: CustomRuleSourceFormat
  fileName?: string
  url?: string
  icon?: string
  enabled: boolean
  matchers: ServiceMatcherDefinition[]
}

export interface ServiceDefinition {
  id: string
  name: string
  category: ServiceCategory
  icon?: string
  iconDark?: string
  description?: string
  ruleSources: RuleSource[]
  defaultMatchers?: string[]
  inlineMatchers?: ServiceMatcherDefinition[]
}
