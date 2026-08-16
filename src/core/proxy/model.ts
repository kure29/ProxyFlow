export type SupportedProxyProtocol = 'http' | 'socks5' | 'shadowsocks' | 'trojan' | 'vmess' | 'vless' | 'hysteria2' | 'tuic'

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
  disableSni?: boolean
  allowInsecure?: boolean
  alpn?: string[]
  fingerprint?: string
  reality?: {
    publicKey: string
    shortId?: string
  }
}

export type ProxyTransportIR =
  | { kind: 'tcp' }
  | { kind: 'ws'; path?: string; host?: string; maxEarlyData?: number; earlyDataHeaderName?: string }
  | { kind: 'http'; variant: 'http' | 'h2'; path?: string; host?: string }
  | { kind: 'grpc'; serviceName?: string }
  | { kind: 'httpupgrade'; path?: string; host?: string }
  | { kind: 'xhttp'; path?: string; host?: string; mode?: 'auto' | 'stream-one' | 'stream-up' | 'packet-up' }

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
  security?: 'none' | 'tls' | 'reality'
  encryption?: 'none'
  flow?: 'xtls-rprx-vision'
  tls?: ProxyTlsIR
  transport?: ProxyTransportIR
}

export interface Hysteria2ProxyIR extends ProxyEndpointBase {
  kind: 'hysteria2'
  protocol: 'hysteria2'
  password: string
  tls: ProxyTlsIR
  obfs?: { type: 'salamander'; password: string }
  upMbps?: number
  downMbps?: number
  serverPorts?: Hysteria2PortIR[]
  hopInterval?: Hysteria2HopIntervalIR
}

export type Hysteria2PortIR =
  | { kind: 'single'; port: number }
  | { kind: 'range'; start: number; end: number }

export type Hysteria2HopIntervalIR =
  | { kind: 'fixed'; seconds: number }
  | { kind: 'range'; minSeconds: number; maxSeconds: number }

export interface TuicProxyIR extends ProxyEndpointBase {
  kind: 'tuic'
  protocol: 'tuic'
  uuid: string
  password: string
  congestionControl?: 'cubic' | 'new_reno' | 'bbr'
  udpRelayMode?: 'native' | 'quic'
  tls: ProxyTlsIR
}

export type ResolvedProxyEndpointIR =
  | HttpProxyIR
  | SocksProxyIR
  | ShadowsocksProxyIR
  | TrojanProxyIR
  | VMessProxyIR
  | VLESSProxyIR
  | Hysteria2ProxyIR
  | TuicProxyIR

export function proxyProtocolLabel(protocol: SupportedProxyProtocol) {
  return ({
    http: 'HTTP',
    socks5: 'SOCKS5',
    shadowsocks: 'Shadowsocks',
    trojan: 'Trojan',
    vmess: 'VMess',
    vless: 'VLESS',
    hysteria2: 'Hysteria2',
    tuic: 'TUIC',
  } as const)[protocol]
}
