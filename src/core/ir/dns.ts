export interface DnsResolverIR {
  id: string
  kind: 'doh' | 'dot' | 'udp' | 'system'
  /**
   * V2 compatibility input. `default` is Shared DNS intent; `direct` and
   * `fallback` are projected into Mihomo-owned behavior at the runtime DNS
   * ownership boundary before a target consumes Shared resolvers.
   */
  role?: 'default' | 'direct' | 'fallback'
  name?: string
  address?: string
}

export interface DnsIR {
  /** Compiler-derived from the effective Graph DNS owner; never persisted. */
  enabled: boolean
  /** Shared resolver selection intent. Project `none` is represented by no DnsIR. */
  mode: 'automatic' | 'custom'
  /** Ordered V2 compatibility input normalized by the DNS ownership boundary. */
  resolvers?: DnsResolverIR[]
}
