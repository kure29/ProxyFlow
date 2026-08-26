/** Typed Shadowrocket profile model.  Values are kept target-local so the
 * Universal IR never grows Shadowrocket-specific fields. */
export type ShadowrocketScalar = string | number | boolean

export interface ShadowrocketParameter {
  key: string
  value: ShadowrocketScalar
}

export interface ShadowrocketGeneralEntry {
  key: string
  value: ShadowrocketScalar | { kind: 'list'; items: ShadowrocketScalar[] }
}

export interface ShadowrocketPolicyEntry {
  name: string
  type: string
  arguments: Array<string | number>
  parameters?: ShadowrocketParameter[]
}

export interface ShadowrocketRule {
  type: string
  payload?: string
  policy: string
}

export interface ShadowrocketProfile {
  general: ShadowrocketGeneralEntry[]
  proxies: ShadowrocketPolicyEntry[]
  proxyGroups: ShadowrocketPolicyEntry[]
  rules: ShadowrocketRule[]
}
