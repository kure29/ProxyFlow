import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { ProxyFlowIR } from '../ir'

export interface CompileResult {
  content: string
  issues: CompatibilityIssue[]
  generatedAt: string
  mock: boolean
}

export interface ConfigCompiler {
  target: TargetClient
  compile(ir: ProxyFlowIR): Promise<CompileResult>
}

export class CompilerRegistry {
  private compilers = new Map<TargetClient, ConfigCompiler>()

  register(compiler: ConfigCompiler) {
    this.compilers.set(compiler.target, compiler)
  }

  get(target: TargetClient) {
    return this.compilers.get(target)
  }
}

// V0.2 intentionally leaves the target registry empty. Real target compilers belong to a later phase.
export const compilerRegistry = new CompilerRegistry()
