export interface MihomoHealthCheck {
  enable: boolean
  url: string
  interval: number
  lazy: boolean
}

export interface MihomoProxyProvider {
  type: 'http'
  url: string
  path: string
  interval: number
  'health-check': MihomoHealthCheck
  override?: {
    'dialer-proxy'?: string
    'proxy-name'?: Array<{ pattern: string; target: string }>
  }
}

interface MihomoProxyBase {
  name: string
  server: string
  port: number
  udp?: boolean
  'dialer-proxy'?: string
  tls?: boolean
  servername?: string
  sni?: string
  alpn?: string[]
  'skip-cert-verify'?: boolean
  network?: 'tcp' | 'ws' | 'http' | 'h2' | 'grpc'
  'ws-opts'?: { path?: string; headers?: Record<string, string> }
  'http-opts'?: { path?: string[]; headers?: Record<string, string[]> }
  'grpc-opts'?: { 'grpc-service-name'?: string }
}

export type MihomoProxy = MihomoProxyBase & (
  | { type: 'socks5'; username?: string; password?: string }
  | { type: 'http'; username?: string; password?: string }
  | { type: 'ss'; cipher: string; password: string; plugin?: string; 'plugin-opts'?: Record<string, string | number | boolean> }
  | { type: 'trojan'; password: string }
  | { type: 'vmess'; uuid: string; alterId: number; cipher: string }
  | { type: 'vless'; uuid: string }
)

export interface MihomoProxyGroup {
  name: string
  type: 'select' | 'url-test' | 'fallback' | 'load-balance'
  proxies?: string[]
  use?: string[]
  url?: string
  interval?: number
  tolerance?: number
  strategy?: 'round-robin' | 'consistent-hashing'
  filter?: string
  'exclude-filter'?: string
}

export interface MihomoRuleProvider {
  type: 'http'
  behavior: 'domain' | 'ipcidr' | 'classical'
  format: 'yaml' | 'text' | 'mrs'
  url: string
  path: string
  interval: number
}

export interface MihomoDnsConfig {
  enable: boolean
  'enhanced-mode': 'redir-host'
  'default-nameserver': string[]
  nameserver: string[]
}

export interface MihomoConfig {
  'mixed-port': number
  'allow-lan': boolean
  mode: 'rule'
  'log-level': 'info'
  proxies?: MihomoProxy[]
  'proxy-providers'?: Record<string, MihomoProxyProvider>
  'proxy-groups'?: MihomoProxyGroup[]
  'rule-providers'?: Record<string, MihomoRuleProvider>
  rules: string[]
  dns?: MihomoDnsConfig
}
