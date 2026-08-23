import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CompileResult } from '../../core/compiler'
import { compileGraph } from '../../core/graphCompiler'
import { createBlankProject } from '../../data/newProject'
import { I18nProvider } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { TargetCompileState } from '../compiler/useTargetCompile'
import { stateForTarget, targetStatus, WorkspaceExportPanel, type ProjectCompiles } from './WorkspaceTargets'

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

  it('shows only Mihomo target cards while explaining a preserved historical sing-box Project', () => {
    const project = createBlankProject('sing-box')
    useBuilderStore.getState().hydrate(structuredClone(project))
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'mihomo' }),
      mihomoState: { status: 'success', result: successResult },
      singBoxState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'sing-box',
      compiles,
      onPreview: () => undefined,
      onSelectTarget: () => undefined,
    })))
    expect(html).toContain('sing-box official export is paused')
    expect(html).not.toContain('/third-party/sing-box/icon.svg')
    expect((html.match(/workspace-target-icon/g) ?? [])).toHaveLength(2)
    expect(html).not.toContain('Surge')
    expect(html).not.toContain('Loon')
  })
})
