import { useEffect, useRef, useState } from 'react'
import { compilerRegistry, type CompileResult, type TargetCompileOptions } from '../../core/compiler'
import type { ProxyFlowIR } from '../../core/ir'
import type { TargetClient } from '../../types/project'
import { translateCurrent } from '../../i18n'

export interface TargetCompileState {
  status: 'idle' | 'loading' | 'success' | 'error' | 'unavailable'
  result?: CompileResult
  error?: string
}

const initialState: TargetCompileState = { status: 'idle' }

interface StoredCompileState {
  requestToken: number
  state: TargetCompileState
}

interface CompileRequestIdentity {
  ir: ProxyFlowIR | undefined
  target: TargetClient | undefined
  enabled: boolean
  options: TargetCompileOptions | undefined
  token: number
}

/** Hide stored compiler output until it belongs to the exact current request. */
export function resolveVisibleTargetCompileState(
  state: TargetCompileState,
  storedRequestToken: number,
  currentRequestToken: number,
  ir: ProxyFlowIR | undefined,
  target: TargetClient | undefined,
  enabled: boolean,
): TargetCompileState {
  if (!enabled || !ir || !target) return initialState
  if (storedRequestToken !== currentRequestToken) return { status: 'loading' }
  return state
}

export function useTargetCompile(
  ir: ProxyFlowIR | undefined,
  target: TargetClient | undefined,
  enabled = true,
  options?: TargetCompileOptions,
): TargetCompileState {
  const [stored, setStored] = useState<StoredCompileState>({ requestToken: 0, state: initialState })
  const requestRef = useRef<CompileRequestIdentity>({ ir, target, enabled, options, token: 0 })
  const previousRequest = requestRef.current
  if (previousRequest.ir !== ir || previousRequest.target !== target
    || previousRequest.enabled !== enabled || previousRequest.options !== options) {
    requestRef.current = {
      ir, target, enabled, options, token: previousRequest.token + 1,
    }
  }
  const request = requestRef.current

  useEffect(() => {
    let cancelled = false
    if (!enabled || !ir || !target) {
      setStored({ requestToken: request.token, state: initialState })
      return () => { cancelled = true }
    }

    setStored({ requestToken: request.token, state: { status: 'loading' } })
    void compilerRegistry.load(target).then(async (compiler) => {
      if (!compiler) {
        if (!cancelled && requestRef.current.token === request.token) setStored({
          requestToken: request.token,
          state: { status: 'unavailable', error: translateCurrent('compiler.notImplemented', { target }) },
        })
        return
      }
      const result = await compiler.compile(ir, options)
      if (!cancelled && requestRef.current.token === request.token) setStored({ requestToken: request.token, state: { status: result.success ? 'success' : 'error', result } })
    }).catch((error: unknown) => {
      if (!cancelled && requestRef.current.token === request.token) setStored({
        requestToken: request.token,
        state: {
          status: 'error',
          error: error instanceof Error ? error.message : translateCurrent('compiler.loadFailed'),
        },
      })
    })

    return () => { cancelled = true }
  }, [enabled, ir, options, request.token, target])

  return resolveVisibleTargetCompileState(stored.state, stored.requestToken, request.token, ir, target, enabled)
}
