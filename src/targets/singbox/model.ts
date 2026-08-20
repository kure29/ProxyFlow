export type SingBoxDialFields = {
  detour?: string
  domain_resolver?: string
}

export interface SingBoxTls {
  enabled: true
  server_name?: string
  disable_sni?: boolean
  insecure?: boolean
  alpn?: string[]
  utls?: { enabled: true; fingerprint: string }
  reality?: { enabled: true; public_key: string; short_id?: string }
}

export type SingBoxV2RayTransport =
  | { type: 'ws'; path?: string; headers?: Record<string, string>; max_early_data?: number; early_data_header_name?: string }
  | { type: 'http'; path?: string; host?: string[] }
  | { type: 'grpc'; service_name?: string }
  | { type: 'httpupgrade'; path?: string; host?: string }

export type SingBoxOutbound =
  | { type: 'direct'; tag: string }
  | { type: 'block'; tag: string }
  | ({ type: 'socks'; tag: string; server: string; server_port: number; version: '5'; username?: string; password?: string } & SingBoxDialFields)
  | ({ type: 'http'; tag: string; server: string; server_port: number; username?: string; password?: string; tls?: SingBoxTls } & SingBoxDialFields)
  | ({ type: 'shadowsocks'; tag: string; server: string; server_port: number; method: string; password: string; plugin?: string; plugin_opts?: string } & SingBoxDialFields)
  | ({ type: 'trojan'; tag: string; server: string; server_port: number; password: string; tls: SingBoxTls; transport?: SingBoxV2RayTransport } & SingBoxDialFields)
  | ({ type: 'vmess'; tag: string; server: string; server_port: number; uuid: string; security: string; alter_id?: number; tls?: SingBoxTls; transport?: SingBoxV2RayTransport } & SingBoxDialFields)
  | ({ type: 'vless'; tag: string; server: string; server_port: number; uuid: string; flow?: 'xtls-rprx-vision'; tls?: SingBoxTls; transport?: SingBoxV2RayTransport } & SingBoxDialFields)
  | ({ type: 'hysteria2'; tag: string; server: string; server_port: number; server_ports?: string[]; hop_interval?: string; up_mbps?: number; down_mbps?: number; obfs?: { type: 'salamander'; password: string }; password: string; tls: SingBoxTls } & SingBoxDialFields)
  | ({ type: 'tuic'; tag: string; server: string; server_port: number; uuid: string; password: string; congestion_control?: 'cubic' | 'new_reno' | 'bbr'; udp_relay_mode?: 'native' | 'quic'; tls: SingBoxTls } & SingBoxDialFields)
  | ({ type: 'anytls'; tag: string; server: string; server_port: number; password: string; idle_session_check_interval?: string; idle_session_timeout?: string; min_idle_session?: number; tls: SingBoxTls } & SingBoxDialFields)
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
  | ({ type: 'https'; tag: string; server: string; server_port?: number; path?: string } & SingBoxDialFields)
  | ({ type: 'tls'; tag: string; server: string; server_port?: number } & SingBoxDialFields)
  | ({ type: 'udp'; tag: string; server: string; server_port?: number } & SingBoxDialFields)
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
