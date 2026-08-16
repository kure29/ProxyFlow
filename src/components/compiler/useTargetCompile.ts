import { useEffect, useState } from 'react'
import { compilerRegistry, type CompileResult } from '../../core/compiler'
import type { ProxyFlowIR } from '../../core/ir'
import type { TargetClient } from '../../types/project'

interface TargetCompileState {
  status: 'idle' | 'loading' | 'success' | 'error' | 'unavailable'
  result?: CompileResult
  error?: string
}

const initialState: TargetCompileState = { status: 'idle' }

export function useTargetCompile(
  ir: ProxyFlowIR | undefined,
  target: TargetClient | undefined,
  enabled = true,
): TargetCompileState {
  const [state, setState] = useState<TargetCompileState>(initialState)

  useEffect(() => {
    let cancelled = false
    if (!enabled || !ir || !target) {
      setState(initialState)
      return () => { cancelled = true }
    }

    setState({ status: 'loading' })
    void compilerRegistry.load(target).then(async (compiler) => {
      if (!compiler) {
        if (!cancelled) setState({ status: 'unavailable', error: `尚未实现 ${target} Compiler。` })
        return
      }
      const result = await compiler.compile(ir)
      if (!cancelled) setState({ status: result.success ? 'success' : 'error', result })
    }).catch((error: unknown) => {
      if (!cancelled) setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Compiler 加载失败。',
      })
    })

    return () => { cancelled = true }
  }, [enabled, ir, target])

  return state
}
