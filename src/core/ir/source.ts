import type { SourceId } from './references'

export interface SubscriptionSourceIR {
  kind: 'subscription'
  id: SourceId
  name: string
  url?: string
  enabled: boolean
}

export interface ManualProxyPlaceholder {
  id: string
  name: string
  /** Concrete proxy protocol models intentionally belong to a later phase. */
  protocol: 'unmodeled'
}

export interface ManualProxySourceIR {
  kind: 'manual-proxy'
  id: SourceId
  name: string
  proxies: ManualProxyPlaceholder[]
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
