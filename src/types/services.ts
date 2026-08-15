export type ServiceCategory = 'ai' | 'streaming' | 'social' | 'development' | 'gaming' | 'regional'

export interface RuleSource {
  id: string
  provider: 'ios-rule-script' | 'builtin' | 'remote' | 'custom'
  format?: string
  url?: string
  updatedAt?: string
  ruleCount?: number
}

export interface ServiceDefinition {
  id: string
  name: string
  category: ServiceCategory
  icon?: string
  description?: string
  ruleSources: RuleSource[]
  defaultMatchers?: string[]
}
