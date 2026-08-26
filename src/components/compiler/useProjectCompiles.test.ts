import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../data/newProject'
import { compileGraph } from '../../core/graphCompiler'
import { resolveMihomoProfileOutput, resolveProjectCompileSelection, summarizePrimaryTargetHealth, type ProjectCompiles } from './useProjectCompiles'
import type { CompileResult } from '../../core/compiler'

describe('Project target compile selection', () => {
  it('keeps using a preserved Mihomo profile after Primary Target changes', () => {
    const project = createBlankProject('mihomo')
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    output.data.client = 'sing-box'

    expect(resolveMihomoProfileOutput(project.graph.nodes, null)?.data.mihomoProfile).toBeDefined()
  })

  it('selects the graph-ordered Mihomo profile independently of Inspector selection', () => {
    const project = createBlankProject('mihomo')
    const first = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    first.id = 'first-output'
    project.graph.nodes.push({
      ...structuredClone(first), id: 'second-output',
      data: { ...structuredClone(first.data), mihomoProfile: { ...first.data.mihomoProfile!, mixedPort: 7999 } },
    })
    expect(resolveMihomoProfileOutput(project.graph.nodes, 'second-output')?.id).toBe('first-output')
  })

  it('reports supported product targets while keeping sing-box paused and hidden', () => {
    const graphResult = compileGraph(createBlankProject('mihomo'))
    expect(graphResult.success).toBe(true)
    const result = (target: 'mihomo' | 'sing-box' | 'loon', success: boolean): CompileResult => ({
      success,
      content: success ? 'ready' : '',
      issues: success ? [] : [{ target, code: `${target.toUpperCase()}_BLOCKED`, severity: 'error', feature: 'dns', message: 'Blocked.' }],
      generatedAt: '2026-08-19T00:00:00.000Z',
      mock: false,
    })
    const compiles: ProjectCompiles = {
      graphResult,
      mihomoState: { status: 'success', result: result('mihomo', true) },
      surgeState: { status: 'success', result: { ...result('mihomo', true), issues: [], content: '[General]\n' } },
      singBoxState: { status: 'error', result: result('sing-box', false) },
      loonState: { status: 'success', result: result('loon', true) },
      shadowrocketState: { status: 'idle' },
    }

    expect(summarizePrimaryTargetHealth(compiles, 'mihomo')).toEqual({ status: 'ready', diagnostics: [] })
    expect(summarizePrimaryTargetHealth(compiles, 'surge')).toEqual({ status: 'ready', diagnostics: [] })
    expect(summarizePrimaryTargetHealth(compiles, 'sing-box')).toEqual(expect.objectContaining({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'TARGET_PRODUCT_SUPPORT_PAUSED', severity: 'error' })],
    }))
    expect(summarizePrimaryTargetHealth(compiles, 'loon')).toEqual({ status: 'ready', diagnostics: [] })
  })

  it('does not schedule hidden sing-box compilation for ordinary or historical Projects', () => {
    expect(resolveProjectCompileSelection('mihomo')).toEqual({ activeProductTarget: 'mihomo', mihomo: true, surge: false, singBox: false, loon: false, shadowrocket: false })
    expect(resolveProjectCompileSelection('surge')).toEqual({ activeProductTarget: 'surge', mihomo: false, surge: true, singBox: false, loon: false, shadowrocket: false })
    expect(resolveProjectCompileSelection('sing-box')).toEqual({ activeProductTarget: 'mihomo', mihomo: true, surge: false, singBox: false, loon: false, shadowrocket: false })
    expect(resolveProjectCompileSelection('sing-box', { singBox: true })).toEqual({ activeProductTarget: 'mihomo', mihomo: true, surge: false, singBox: true, loon: false, shadowrocket: false })
    expect(resolveProjectCompileSelection('loon')).toEqual({ activeProductTarget: 'loon', mihomo: false, surge: false, singBox: false, loon: true, shadowrocket: false })
    expect(resolveProjectCompileSelection('shadowrocket')).toEqual({ activeProductTarget: 'shadowrocket', mihomo: false, surge: false, singBox: false, loon: false, shadowrocket: true })
  })

  it('synthesizes a blocker when the active compiler is unavailable without a result', () => {
    const graphResult = compileGraph(createBlankProject('mihomo'))
    const compiles: ProjectCompiles = {
      graphResult,
      mihomoState: { status: 'unavailable', error: 'Compiler module missing.' },
      surgeState: { status: 'idle' },
      singBoxState: { status: 'idle' },
      loonState: { status: 'idle' },
      shadowrocketState: { status: 'idle' },
    }
    expect(summarizePrimaryTargetHealth(compiles, 'mihomo')).toEqual({
      status: 'blocked',
      diagnostics: [{
        code: 'TARGET_COMPILER_UNAVAILABLE', severity: 'error', message: 'Compiler module missing.',
      }],
    })
  })

  it('uses the Loon compiler state for a supported product target', () => {
    const project = createBlankProject('loon')
    const graphResult = compileGraph(project, { validationTarget: 'loon' })
    const loonIssue = { target: 'loon' as const, code: 'LOON_PROXY_PROTOCOL_UNSUPPORTED', severity: 'error' as const, feature: 'proxy', message: 'Loon blocked this protocol.' }
    const compiles: ProjectCompiles = {
      graphResult,
      mihomoState: { status: 'success', result: { success: true, content: 'mihomo', issues: [], generatedAt: '', mock: false } },
      surgeState: { status: 'success', result: { success: true, content: 'surge', issues: [], generatedAt: '', mock: false } },
      singBoxState: { status: 'success', result: { success: true, content: 'sing-box', issues: [], generatedAt: '', mock: false } },
      loonState: { status: 'error', result: { success: false, content: '', issues: [loonIssue], generatedAt: '', mock: false } },
      shadowrocketState: { status: 'idle' },
    }
    expect(summarizePrimaryTargetHealth(compiles, 'loon')).toEqual({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'LOON_PROXY_PROTOCOL_UNSUPPORTED' })],
    })
    expect(summarizePrimaryTargetHealth(compiles, 'loon').diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'mihomo' }),
      expect.objectContaining({ target: 'sing-box' }),
    ]))
  })

  it('keeps Shadowrocket compatibility diagnostics visible for the exposed target', () => {
    const graphResult = compileGraph(createBlankProject('shadowrocket'), { validationTarget: 'shadowrocket' })
    const compiles: ProjectCompiles = {
      graphResult,
      mihomoState: { status: 'idle' },
      surgeState: { status: 'idle' },
      singBoxState: { status: 'idle' },
      loonState: { status: 'idle' },
      shadowrocketState: { status: 'error', result: { success: false, content: '', issues: [{ target: 'shadowrocket', code: 'SHADOWROCKET_PROXY_CHAIN_UNPROVEN', severity: 'error', feature: 'chain', message: 'Chain blocked.' }], generatedAt: '', mock: false } },
    }
    expect(summarizePrimaryTargetHealth(compiles, 'shadowrocket')).toEqual(expect.objectContaining({ status: 'blocked', diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'SHADOWROCKET_PROXY_CHAIN_UNPROVEN' }),
    ]) }))
  })
})
