export type SingBoxDialFields = {
  detour?: string
  domain_resolver?: string
}

export type SingBoxOutbound =
  | { type: 'direct'; tag: string }
  | { type: 'block'; tag: string }
  | ({ type: 'socks'; tag: string; server: string; server_port: number; version: '5'; username?: string; password?: string } & SingBoxDialFields)
  | ({ type: 'http'; tag: string; server: string; server_port: number; username?: string; password?: string } & SingBoxDialFields)
  | { type: 'selector'; tag: string; outbounds: string[]; default?: string }
  | { type: 'urltest'; tag: string; outbounds: string[]; url: string; interval: string; tolerance: number }

export interface SingBoxRouteRule {
  domain?: string[]
  domain_suffix?: string[]
  domain_keyword?: string[]
  ip_cidr?: string[]
  port?: number[]
  rule_set?: string[]
  action: 'route' | 'reject'
  outbound?: string
}

export type SingBoxRuleSet =
  | { type: 'inline'; tag: string; rules: Array<Omit<SingBoxRouteRule, 'action' | 'outbound'>> }
  | { type: 'remote'; tag: string; format: 'source' | 'binary'; url: string; update_interval: string }

export type SingBoxDnsServer =
  | { type: 'https'; tag: string; server: string; server_port?: number; path?: string }
  | { type: 'tls'; tag: string; server: string; server_port?: number }
  | { type: 'udp'; tag: string; server: string; server_port?: number }
  | { type: 'local'; tag: string }

export interface SingBoxConfig {
  log: { level: 'info' }
  dns?: { servers: SingBoxDnsServer[]; final: string }
  outbounds: SingBoxOutbound[]
  route: {
    rules: SingBoxRouteRule[]
    rule_set?: SingBoxRuleSet[]
    final: string
    default_domain_resolver?: string
  }
}
