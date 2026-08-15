export interface DnsResolverIR {
  id: string
  kind: 'doh' | 'dot' | 'udp' | 'system'
  address?: string
}

export interface DnsIR {
  enabled: boolean
  mode: 'automatic' | 'custom'
  resolvers?: DnsResolverIR[]
}
