import type { SourceId } from './references'

export interface SubscriptionSourceIR {
  kind: 'subscription'
  id: SourceId
  name: string
  url?: string
  enabled: boolean
}

export interface ManualProxyPlaceholder {
  /** Retained for backward compatibility with the original IR V2 placeholder. */
  protocol: 'unmodeled'
  kind?: 'unmodeled'
  id: string
  name: string
}

interface ProxyEndpointBase {
  id: string
  name: string
  server: string
  port: number
  username?: string
  password?: string
}

export interface SocksProxyIR extends ProxyEndpointBase {
  kind: 'socks'
  version: '5'
}

export interface HttpProxyIR extends ProxyEndpointBase {
  kind: 'http'
}

/** A resolved, client-neutral proxy endpoint. Target runtime fields do not belong here. */
export type ProxyEndpointIR = ManualProxyPlaceholder | SocksProxyIR | HttpProxyIR

export function isUnmodeledProxy(proxy: ProxyEndpointIR): proxy is ManualProxyPlaceholder {
  return proxy.kind === 'unmodeled' || ('protocol' in proxy && proxy.protocol === 'unmodeled')
}

export interface ManualProxySourceIR {
  kind: 'manual-proxy'
  id: SourceId
  name: string
  proxies: ProxyEndpointIR[]
}

export interface ProviderSourceIR {
  kind: 'provider'
  id: SourceId
  name: string
  reference?: string
  enabled: boolean
}

export interface ImportedConfigSourceIR {
  kind: 'imported-config'
  id: SourceId
  name: string
  originalFormat?: string
}

export type SourceIR =
  | SubscriptionSourceIR
  | ManualProxySourceIR
  | ProviderSourceIR
  | ImportedConfigSourceIR
