export type TargetClient =
  | 'mihomo'
  | 'sing-box'
  | 'surge'
  | 'loon'
  | 'quantumult-x'
  | 'shadowrocket'
  | 'stash'

export type MihomoRuntimePreset = 'local-proxy' | 'desktop-tun'
export type MihomoDnsMode = 'disabled' | 'redir-host' | 'fake-ip'
export type MihomoTunStack = 'mixed' | 'system' | 'gvisor'

export interface MihomoOutputProfile {
  preset: MihomoRuntimePreset
  mixedPort: number
  allowLan: boolean
  ipv6: boolean
  dnsMode: MihomoDnsMode
  tunStack: MihomoTunStack
  strictRoute: boolean
  sniffer: boolean
  storeSelected: boolean
  unifiedDelay: boolean
  tcpConcurrent: boolean
}

export interface OutputDefinition {
  id: string
  target: TargetClient
  label: string
  status: 'supported' | 'paused' | 'prototype' | 'coming-soon'
  icon?: string
  iconDark?: string
}
