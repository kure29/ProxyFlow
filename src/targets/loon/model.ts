/** A value whose field-specific Loon syntax is an explicit quoted literal. */
export interface LoonQuotedLiteral {
  kind: 'quoted'
  value: string
}

export type LoonScalar = string | number | boolean | LoonQuotedLiteral

export interface LoonParameter {
  key: string
  value: LoonScalar
}

export interface LoonGeneralList<Item extends LoonScalar = string> {
  kind: 'list'
  items: Item[]
}

export interface LoonGeneralValueMap {
  'dns-server': LoonGeneralList<string>
  'doh-server': LoonGeneralList<string>
}

export type LoonGeneralEntry = {
  [Key in keyof LoonGeneralValueMap]: { key: Key; value: LoonGeneralValueMap[Key] }
}[keyof LoonGeneralValueMap]

export type LoonProxyType =
  | 'http'
  | 'https'
  | 'Shadowsocks'
  | 'shadowsocks'
  | 'trojan'
  | 'vmess'
  | 'VLESS'
  | 'vless'
  | 'Hysteria2'
  | 'hysteria2'

export type LoonProxyGroupType = 'select' | 'url-test' | 'fallback' | 'load-balance'

export interface LoonPolicyEntry<Type extends string = string> {
  name: string
  type: Type
  arguments: LoonScalar[]
  parameters?: LoonParameter[]
}

export type LoonProxy = LoonPolicyEntry<LoonProxyType>
export type LoonProxyGroup = LoonPolicyEntry<LoonProxyGroupType>

export type LoonMatcherRuleType =
  | 'DOMAIN'
  | 'DOMAIN-SUFFIX'
  | 'DOMAIN-KEYWORD'
  | 'IP-CIDR'
  | 'IP-CIDR6'
  | 'GEOIP'

export interface LoonMatcherRule {
  type: LoonMatcherRuleType
  payload: string
  policy: string
  noResolve?: true
}

export interface LoonFinalRule {
  type: 'FINAL'
  policy: string
  payload?: never
  noResolve?: never
}

export type LoonRule = LoonMatcherRule | LoonFinalRule

export interface LoonProfile {
  general: LoonGeneralEntry[]
  proxies: LoonProxy[]
  proxyGroups: LoonProxyGroup[]
  rules: LoonRule[]
}

export type LoonModel = LoonProfile
export type LoonConfig = LoonProfile
