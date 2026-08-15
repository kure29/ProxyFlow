import type { DnsIR } from './dns'
import type { OutputIR } from './output'
import type { FinalRouteIR, RouteIR } from './routing'
import type { ServiceIR } from './service'
import type { SourceIR } from './source'
import type { StrategyIR } from './strategy'
import type { TransformIR } from './transform'

export const PROXYFLOW_IR_VERSION = 2 as const

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
  services: ServiceIR[]
  routes: RouteIR[]
  finalRoute?: FinalRouteIR
  dns?: DnsIR
  outputs: OutputIR[]
}
