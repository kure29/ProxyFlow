import type { ProxySetRef, StrategyCandidateRef, StrategyId, StrategyTargetRef } from './references'

export interface HealthCheckIR {
  url?: string
  intervalSeconds?: number
  toleranceMs?: number
}

interface StrategyBase {
  id: StrategyId
  name: string
}

export interface FixedStrategyIR extends StrategyBase {
  kind: 'fixed'
  proxyId?: string
}

export interface SelectStrategyIR extends StrategyBase {
  kind: 'select'
  candidates: StrategyCandidateRef[]
}

export interface AutoSelectStrategyIR extends StrategyBase {
  kind: 'auto-select'
  source: ProxySetRef
  healthCheck?: HealthCheckIR
}

export interface FallbackStrategyIR extends StrategyBase {
  kind: 'fallback'
  candidates: StrategyCandidateRef[]
  healthCheck?: HealthCheckIR
}

export interface LoadBalanceStrategyIR extends StrategyBase {
  kind: 'load-balance'
  source: ProxySetRef
  mode?: 'round-robin' | 'consistent-hash'
}

export interface ChainStrategyIR extends StrategyBase {
  kind: 'chain'
  /** Array order is the actual client → first hop → last hop → internet order. */
  hops: StrategyTargetRef[]
}

export type StrategyIR =
  | FixedStrategyIR
  | SelectStrategyIR
  | AutoSelectStrategyIR
  | FallbackStrategyIR
  | LoadBalanceStrategyIR
  | ChainStrategyIR
