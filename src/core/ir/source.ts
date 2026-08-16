import type { SourceId } from './references'
import type { ResolvedProxyEndpointIR } from '../proxy'

export type {
  HttpProxyIR, ProxyEndpointMetadata, ProxyTlsIR, ProxyTransportIR, ResolvedProxyEndpointIR,
  ShadowsocksProxyIR, SocksProxyIR, TrojanProxyIR, VLESSProxyIR, VMessProxyIR,
} from '../proxy'

export interface SubscriptionSourceIR {
  kind: 'subscription'
  id: SourceId
  name: string
  url?: string
  enabled: boolean
  proxies?: ResolvedProxyEndpointIR[]
  materialization?: {
    status: 'ready' | 'stale' | 'error' | 'unavailable'
    issueCode?: string
  }
}

export interface ManualProxyPlaceholder {
  /** Retained for backward compatibility with the original IR V2 placeholder. */
  protocol: 'unmodeled'
  kind?: 'unmodeled'
  id: string
  name: string
}

/** A resolved, client-neutral proxy endpoint. Target runtime fields do not belong here. */
export type ProxyEndpointIR = ManualProxyPlaceholder | ResolvedProxyEndpointIR

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
