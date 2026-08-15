import type { DnsIR } from './dns'
import type { OutputIR } from './output'
import type { FinalRouteIR, RouteIR } from './routing'
import type { SourceIR } from './source'
import type { StrategyIR } from './strategy'
import type { TransformIR } from './transform'

export const PROXYFLOW_IR_VERSION = 1 as const

export interface ProxyFlowIR {
  version: typeof PROXYFLOW_IR_VERSION
  metadata: {
    projectId: string
    projectName: string
    projectSchemaVersion: number
  }
  sources: SourceIR[]
  transforms: TransformIR[]
  strategies: StrategyIR[]
  routes: RouteIR[]
  finalRoute?: FinalRouteIR
  dns?: DnsIR
  outputs: OutputIR[]
}
