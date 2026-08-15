export type SourceId = string
export type TransformId = string
export type StrategyId = string
export type RouteId = string
export type ServiceId = string
export type OutputId = string

export type ProxySetRef =
  | { kind: 'source'; id: SourceId }
  | { kind: 'transform'; id: TransformId }

export type StrategyCandidateRef =
  | ProxySetRef
  | { kind: 'strategy'; id: StrategyId }

export type StrategyTargetRef = { kind: 'strategy'; id: StrategyId }

export type RouteTargetIR =
  | { kind: 'strategy'; id: StrategyId }
  | { kind: 'direct' }
  | { kind: 'reject' }
