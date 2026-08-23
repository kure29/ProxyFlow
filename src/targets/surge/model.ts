export interface SurgeParameter {
  key: string
  value: string | number | boolean
}

export interface SurgePolicyEntry {
  name: string
  type: string
  arguments: Array<string | number>
  parameters?: SurgeParameter[]
}

export interface SurgeProfile {
  general: string[]
  proxies: SurgePolicyEntry[]
  proxyGroups: SurgePolicyEntry[]
  rules: string[]
}
