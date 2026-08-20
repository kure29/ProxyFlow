export interface DnsResolverIR {
  id: string
  kind: 'doh' | 'dot' | 'udp' | 'system'
  role?: 'default' | 'direct' | 'fallback'
  name?: string
  address?: string
}

export interface DnsIR {
  enabled: boolean
  mode: 'automatic' | 'custom'
  resolvers?: DnsResolverIR[]
}
