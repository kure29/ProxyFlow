export interface SurgeParameter {
  key: string
  value: string | number | boolean
}

export interface SurgeGeneralList<Item extends string | number | boolean = string> {
  kind: 'list'
  items: Item[]
}

export interface SurgeGeneralValueMap {
  'proxy-test-url': string
  'dns-server': SurgeGeneralList<string>
  'encrypted-dns-server': SurgeGeneralList<string>
}

export type SurgeGeneralEntry = {
  [Key in keyof SurgeGeneralValueMap]: { key: Key; value: SurgeGeneralValueMap[Key] }
}[keyof SurgeGeneralValueMap]

export interface SurgePolicyEntry {
  name: string
  type: string
  arguments: Array<string | number>
  parameters?: SurgeParameter[]
}

export interface SurgeProfile {
  general: SurgeGeneralEntry[]
  proxies: SurgePolicyEntry[]
  proxyGroups: SurgePolicyEntry[]
  rules: string[]
}
