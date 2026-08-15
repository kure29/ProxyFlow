export type TargetClient =
  | 'mihomo'
  | 'sing-box'
  | 'surge'
  | 'loon'
  | 'quantumult-x'
  | 'shadowrocket'
  | 'stash'

export interface OutputDefinition {
  id: string
  target: TargetClient
  label: string
  status: 'supported' | 'prototype' | 'coming-soon'
}
