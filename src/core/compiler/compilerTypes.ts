import type { CompatibilityIssue, ProxyFlowProject, TargetClient } from '../../types/project'

export interface CompileResult {
  content: string
  issues: CompatibilityIssue[]
  generatedAt: string
  mock: boolean
}

export interface ConfigCompiler {
  target: TargetClient
  compile(project: ProxyFlowProject): Promise<CompileResult>
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

// V0.1 intentionally leaves the registry empty. Real target compilers belong to a later phase.
export const compilerRegistry = new CompilerRegistry()
