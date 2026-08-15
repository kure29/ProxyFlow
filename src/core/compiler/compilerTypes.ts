import type { CompatibilityIssue, TargetClient } from '../../types/project'
import type { ProxyFlowIR } from '../ir'

export interface CompileResult {
  success: boolean
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

export const compilerRegistry = new CompilerRegistry()
