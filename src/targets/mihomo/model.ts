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

export type MihomoProxy = {
  name: string
  type: 'socks5' | 'http'
  server: string
  port: number
  username?: string
  password?: string
  udp?: boolean
  'dialer-proxy'?: string
}

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
