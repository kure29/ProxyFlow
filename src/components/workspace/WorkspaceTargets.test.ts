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

const surgeBlockedResult: CompileResult = {
  success: false,
  content: '',
  issues: [{
    code: 'SURGE_PROXY_PROTOCOL_UNSUPPORTED', severity: 'error', target: 'surge', feature: 'proxy',
    message: 'Proxy “Incompatible VLESS” uses VLESS, which is not supported by the current official Surge profile format.',
    entityId: 'vless-source',
  }],
  generatedAt: '2026-08-23T00:00:00.000Z',
  mock: false,
}

describe('Workspace target status', () => {
  it('keeps a successful primary target export ready when the secondary target is blocked', () => {
    const mihomoState: TargetCompileState = { status: 'success', result: successResult }
    const singBoxState: TargetCompileState = { status: 'error', result: blockedResult }
    const surgeState: TargetCompileState = { status: 'error', result: surgeBlockedResult }
    const compiles = { mihomoState, surgeState, singBoxState } as ProjectCompiles

    expect(targetStatus(stateForTarget(compiles, 'mihomo'), [])).toEqual(expect.objectContaining({ kind: 'ready' }))
    expect(targetStatus(stateForTarget(compiles, 'sing-box'), [])).toEqual(expect.objectContaining({ kind: 'blocked', errorCount: 1 }))
    expect(targetStatus(stateForTarget(compiles, 'surge'), [])).toEqual(expect.objectContaining({ kind: 'blocked', errorCount: 1 }))
    expect(stateForTarget(compiles, 'mihomo').result?.stats?.proxyCount).toBe(3)
  })

  it('shows Mihomo and Surge target cards while explaining a preserved historical sing-box Project', () => {
    const project = createBlankProject('sing-box')
    useBuilderStore.getState().hydrate(structuredClone(project))
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'mihomo' }),
      mihomoState: { status: 'success', result: successResult },
      surgeState: { status: 'idle' },
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
    expect((html.match(/workspace-target-icon/g) ?? [])).toHaveLength(4)
    expect(html).toContain('Surge')
    expect(html).not.toContain('Loon')
  })

  it('keeps an incompatible Surge target selected, shows the compiler message, and disables export controls', () => {
    const project = createBlankProject('surge')
    project.name = 'Blocked RC'
    useBuilderStore.getState().hydrate(structuredClone(project))
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'surge' }),
      mihomoState: { status: 'idle' },
      surgeState: { status: 'error', result: surgeBlockedResult },
      singBoxState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'surge', compiles, onPreview: () => undefined, onSelectTarget: () => undefined,
    })))
    expect(useBuilderStore.getState().primaryTarget).toBe('surge')
    expect(html).toContain('Proxy “Incompatible VLESS” uses VLESS')
    expect(html).toContain('SURGE_PROXY_PROTOCOL_UNSUPPORTED')
    expect(html).toContain('我的代理配置-surge.conf')
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(3)
  })

  it('renders a compatible Surge profile with its deterministic filename and enabled export controls', () => {
    const project = createBlankProject('surge')
    project.name = 'Release / Candidate'
    useBuilderStore.getState().hydrate(structuredClone(project))
    const surgeResult = { ...successResult, content: '[General]\n\n[Proxy]\n\n[Proxy Group]\n\n[Rule]\nFINAL,DIRECT\n' }
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'surge' }),
      mihomoState: { status: 'idle' },
      surgeState: { status: 'success', result: surgeResult },
      singBoxState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'surge', compiles, onPreview: () => undefined, onSelectTarget: () => undefined,
    })))
    expect(html).toContain('Ready to export')
    expect(html).toContain('我的代理配置-surge.conf')
    expect(html).toContain('[General]')
    expect(html).toContain('iOS 5.22+ / Mac 6.9+')
    expect(html).not.toContain('disabled=""')
  })
})
