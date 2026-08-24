import { describe, expect, it } from 'vitest'
import type { ProxyFlowIR } from '../../core/ir'
import { resolveVisibleTargetCompileState, type TargetCompileState } from './useTargetCompile'

const ir = { version: 2, proxies: [], strategies: [], routes: [], dns: undefined } as unknown as ProxyFlowIR
const success: TargetCompileState = {
  status: 'success',
  result: { success: true, content: 'old-target', issues: [], generatedAt: '', mock: false },
}

describe('current target compile result safety', () => {
  it('hides a successful result immediately when the request changes target', () => {
    expect(resolveVisibleTargetCompileState(success, 1, 1, ir, 'mihomo', true)).toBe(success)
    expect(resolveVisibleTargetCompileState(success, 1, 2, ir, 'loon', true)).toEqual({ status: 'loading' })
    expect(resolveVisibleTargetCompileState(success, 1, 2, ir, 'loon', true)).not.toHaveProperty('result')
  })

  it('hides results immediately for disabled or incomplete requests', () => {
    expect(resolveVisibleTargetCompileState(success, 1, 1, ir, 'mihomo', false)).toEqual({ status: 'idle' })
    expect(resolveVisibleTargetCompileState(success, 1, 1, undefined, 'mihomo', true)).toEqual({ status: 'idle' })
    expect(resolveVisibleTargetCompileState(success, 1, 1, ir, undefined, true)).toEqual({ status: 'idle' })
  })

  it('keeps a late request result hidden when a newer request owns the token', () => {
    const requestA = resolveVisibleTargetCompileState({ ...success, result: { ...success.result!, content: 'A' } }, 3, 4, ir, 'mihomo', true)
    const requestB = resolveVisibleTargetCompileState({ ...success, result: { ...success.result!, content: 'B' } }, 4, 4, ir, 'loon', true)
    expect(requestA).toEqual({ status: 'loading' })
    expect(requestB.result?.content).toBe('B')
  })
})
