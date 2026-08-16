export type SingBoxDialFields = {
  detour?: string
  domain_resolver?: string
}

export interface SingBoxTls {
  enabled: true
  server_name?: string
  insecure?: boolean
  alpn?: string[]
}

export type SingBoxV2RayTransport =
  | { type: 'ws'; path?: string; headers?: Record<string, string> }
  | { type: 'http'; path?: string; host?: string[] }
  | { type: 'grpc'; service_name?: string }

export type SingBoxOutbound =
  | { type: 'direct'; tag: string }
  | { type: 'block'; tag: string }
  | ({ type: 'socks'; tag: string; server: string; server_port: number; version: '5'; username?: string; password?: string } & SingBoxDialFields)
  | ({ type: 'http'; tag: string; server: string; server_port: number; username?: string; password?: string; tls?: SingBoxTls } & SingBoxDialFields)
  | ({ type: 'shadowsocks'; tag: string; server: string; server_port: number; method: string; password: string; plugin?: string; plugin_opts?: string } & SingBoxDialFields)
  | ({ type: 'trojan'; tag: string; server: string; server_port: number; password: string; tls: SingBoxTls; transport?: SingBoxV2RayTransport } & SingBoxDialFields)
  | ({ type: 'vmess'; tag: string; server: string; server_port: number; uuid: string; security: string; alter_id?: number; tls?: SingBoxTls; transport?: SingBoxV2RayTransport } & SingBoxDialFields)
  | ({ type: 'vless'; tag: string; server: string; server_port: number; uuid: string; tls?: SingBoxTls; transport?: SingBoxV2RayTransport } & SingBoxDialFields)
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
