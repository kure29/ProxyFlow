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

  it('reports supported product targets while replacing historical sing-box noise with one paused state', () => {
    const graphResult = compileGraph(createBlankProject('mihomo'))
    expect(graphResult.success).toBe(true)
    const result = (target: 'mihomo' | 'sing-box', success: boolean): CompileResult => ({
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
    }

    expect(summarizePrimaryTargetHealth(compiles, 'mihomo')).toEqual({ status: 'ready', diagnostics: [] })
    expect(summarizePrimaryTargetHealth(compiles, 'surge')).toEqual({ status: 'ready', diagnostics: [] })
    expect(summarizePrimaryTargetHealth(compiles, 'sing-box')).toEqual(expect.objectContaining({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'TARGET_PRODUCT_SUPPORT_PAUSED', severity: 'error' })],
    }))
  })

  it('does not schedule hidden sing-box compilation for ordinary or historical Projects', () => {
    expect(resolveProjectCompileSelection('mihomo')).toEqual({ activeProductTarget: 'mihomo', mihomo: true, surge: false, singBox: false })
    expect(resolveProjectCompileSelection('surge')).toEqual({ activeProductTarget: 'surge', mihomo: false, surge: true, singBox: false })
    expect(resolveProjectCompileSelection('sing-box')).toEqual({ activeProductTarget: 'mihomo', mihomo: true, surge: false, singBox: false })
    expect(resolveProjectCompileSelection('sing-box', { singBox: true })).toEqual({ activeProductTarget: 'mihomo', mihomo: true, surge: false, singBox: true })
  })
})
