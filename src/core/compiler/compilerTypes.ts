import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { ProxyFlowIR } from '../ir'

export interface CompileResult {
  success: boolean
  content: string
  issues: CompatibilityIssue[]
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
