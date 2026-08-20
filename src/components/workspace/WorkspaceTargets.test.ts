import { describe, expect, it } from 'vitest'
import type { CompileResult } from '../../core/compiler'
import type { TargetCompileState } from '../compiler/useTargetCompile'
import { stateForTarget, targetStatus, type ProjectCompiles } from './WorkspaceTargets'

const successResult: CompileResult = {
  success: true,
  content: '{}',
  issues: [],
  generatedAt: '2026-08-19T00:00:00.000Z',
  mock: false,
  stats: { proxyCount: 3 },
}

const blockedResult: CompileResult = {
  success: false,
  content: '',
  issues: [{ code: 'SECONDARY_BLOCKER', severity: 'error', target: 'sing-box', feature: 'routing', message: 'Blocked.' }],
  generatedAt: '2026-08-19T00:00:00.000Z',
  mock: false,
}

describe('Workspace target status', () => {
  it('keeps a successful primary target export ready when the secondary target is blocked', () => {
    const mihomoState: TargetCompileState = { status: 'success', result: successResult }
    const singBoxState: TargetCompileState = { status: 'error', result: blockedResult }
    const compiles = { mihomoState, singBoxState } as ProjectCompiles

    expect(targetStatus(stateForTarget(compiles, 'mihomo'), [])).toEqual(expect.objectContaining({ kind: 'ready' }))
    expect(targetStatus(stateForTarget(compiles, 'sing-box'), [])).toEqual(expect.objectContaining({ kind: 'blocked', errorCount: 1 }))
    expect(stateForTarget(compiles, 'mihomo').result?.stats?.proxyCount).toBe(3)
  })
})
