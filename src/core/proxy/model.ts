export type SupportedProxyProtocol = 'http' | 'socks5' | 'shadowsocks' | 'trojan' | 'vmess' | 'vless'

export type RegionCode = 'HK' | 'US' | 'JP' | 'SG' | 'TW' | 'KR' | 'UK' | 'DE' | 'FR' | 'CA' | 'AU' | 'UNKNOWN'

export interface RegionHint {
  code: RegionCode
  confidence: number
  source: 'emoji' | 'name' | 'manual' | 'unknown'
}

export interface ProxyCompatibilityHint {
  status: 'ready' | 'partial'
  unsupportedFeatures?: string[]
  unrecognizedParams?: string[]
}

export interface ProxyEndpointMetadata {
  sourceId?: string
  sourceName?: string
  region?: RegionHint
  tags?: string[]
  compatibility?: ProxyCompatibilityHint
}

interface ProxyEndpointBase {
  id: string
  name: string
  server: string
  port: number
  metadata?: ProxyEndpointMetadata
}

export interface ProxyTlsIR {
  enabled: boolean
  serverName?: string
  allowInsecure?: boolean
  alpn?: string[]
}

export type ProxyTransportIR =
  | { kind: 'tcp' }
  | { kind: 'ws'; path?: string; host?: string }
  | { kind: 'http'; path?: string; host?: string }
  | { kind: 'grpc'; serviceName?: string }

export interface HttpProxyIR extends ProxyEndpointBase {
  kind: 'http'
  protocol: 'http'
  username?: string
  password?: string
  tls?: ProxyTlsIR
}

export interface SocksProxyIR extends ProxyEndpointBase {
  kind: 'socks'
  protocol: 'socks5'
  version: '5'
  username?: string
  password?: string
}

export interface ShadowsocksProxyIR extends ProxyEndpointBase {
  kind: 'shadowsocks'
  protocol: 'shadowsocks'
  method: string
  password: string
  plugin?: {
    name: string
    options?: string | Record<string, string | number | boolean>
  }
}

export interface TrojanProxyIR extends ProxyEndpointBase {
  kind: 'trojan'
  protocol: 'trojan'
  password: string
  tls: ProxyTlsIR
  transport?: ProxyTransportIR
}

export interface VMessProxyIR extends ProxyEndpointBase {
  kind: 'vmess'
  protocol: 'vmess'
  uuid: string
  security: string
  alterId?: number
  tls?: ProxyTlsIR
  transport?: ProxyTransportIR
}

export interface VLESSProxyIR extends ProxyEndpointBase {
  kind: 'vless'
  protocol: 'vless'
  uuid: string
  tls?: ProxyTlsIR
  transport?: ProxyTransportIR
}

export type ResolvedProxyEndpointIR =
  | HttpProxyIR
  | SocksProxyIR
  | ShadowsocksProxyIR
  | TrojanProxyIR
  | VMessProxyIR
  | VLESSProxyIR

export function proxyProtocolLabel(protocol: SupportedProxyProtocol) {
  return ({
    http: 'HTTP',
    socks5: 'SOCKS5',
    shadowsocks: 'Shadowsocks',
    trojan: 'Trojan',
    vmess: 'VMess',
    vless: 'VLESS',
  } as const)[protocol]
}
