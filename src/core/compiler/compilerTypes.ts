import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { ProxyFlowIR } from '../ir'
import type { TargetNativeFinalOptionsIR, TargetNativeRouteIR, TargetNativeRuleSetSourceIR, TargetNativeStrategyIR } from '../targetNative'

export type TargetProjectionStatus = 'ready' | 'partial' | 'blocked'

export interface TargetProjectionReason {
  code: string
  label: string
  /** Number of distinct projected endpoints affected by this reason. */
  endpointCount: number
}

export interface TargetStrategyProjectionSummary {
  target: TargetClient
  strategyId: string
  candidateCount: number
  compatibleCount: number
  skippedCount: number
  blockingCount: number
  status: TargetProjectionStatus
  reasons: TargetProjectionReason[]
}

/** Target-specific compatibility for one materialized endpoint. */
export interface TargetEndpointProjectionSummary {
  target: TargetClient
  endpointId: string
  sourceId?: string
  candidateCount: number
  compatibleCount: number
  skippedCount: number
  status: TargetProjectionStatus
  reasons: TargetProjectionReason[]
}

export interface TargetProjectionSummary {
  target: TargetClient
  candidateCount: number
  compatibleCount: number
  skippedCount: number
  blockingCount: number
  status: TargetProjectionStatus
  reasons: TargetProjectionReason[]
  strategies: TargetStrategyProjectionSummary[]
  /** Optional endpoint-level details for node workspace presentation. */
  endpoints?: TargetEndpointProjectionSummary[]
}

export interface CompileResult {
  success: boolean
  content: string
  issues: CompatibilityIssue[]
  /** Optional target-specific projection data for workspace diagnostics. */
  targetProjection?: TargetProjectionSummary
  generatedAt: string
  mock: boolean
  stats?: {
    proxyCount: number
    endpointCount?: number
    candidateCount?: number
    compatibleEndpointCount?: number
    skippedEndpointCount?: number
    blockingIssueCount?: number
  }
}

export interface TargetCompileOptions {
  outputNodeId?: string
  targetProfile?: unknown
  /** Explicit target-native extension extracted from the Project graph. */
  targetNativeStrategies?: TargetNativeStrategyIR[]
  /** Short alias accepted by headless integrations. */
  nativeStrategies?: TargetNativeStrategyIR[]
  nativeRoutes?: TargetNativeRouteIR[]
  nativeFinalRoute?: TargetNativeRouteIR
  /** Explicit target-native Final rule options extracted from the Project graph. */
  targetNativeFinalOptions?: TargetNativeFinalOptionsIR
  /** Explicit target-native Rule Set provenance extracted from the graph. */
  targetNativeRuleSetSources?: TargetNativeRuleSetSourceIR[]
  /** Short alias accepted by headless integrations. */
  nativeRuleSetSources?: TargetNativeRuleSetSourceIR[]
}

export interface ConfigCompiler {
  target: TargetClient
  compile(ir: ProxyFlowIR, options?: TargetCompileOptions): Promise<CompileResult>
}

export type CompilerLoader = () => Promise<ConfigCompiler>

export class CompilerRegistry {
  private loaders = new Map<TargetClient, CompilerLoader>()
  private compilers = new Map<TargetClient, ConfigCompiler>()
  private pending = new Map<TargetClient, Promise<ConfigCompiler>>()

  register(target: TargetClient, loader: CompilerLoader) {
    this.loaders.set(target, loader)
  }

  has(target: TargetClient) {
    return this.loaders.has(target)
  }

  getLoaded(target: TargetClient) {
    return this.compilers.get(target)
  }

  async load(target: TargetClient) {
    const loaded = this.compilers.get(target)
    if (loaded) return loaded
    const existing = this.pending.get(target)
    if (existing) return existing
    const loader = this.loaders.get(target)
    if (!loader) return undefined
    const pending = loader().then((compiler) => {
      if (compiler.target !== target) throw new Error(`Compiler loader for ${target} returned ${compiler.target}.`)
      this.compilers.set(target, compiler)
      this.pending.delete(target)
      return compiler
    }).catch((error) => {
      this.pending.delete(target)
      throw error
    })
    this.pending.set(target, pending)
    return pending
  }
}

export const compilerRegistry = new CompilerRegistry()
