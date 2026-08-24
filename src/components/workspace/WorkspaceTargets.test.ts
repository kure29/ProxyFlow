import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CompileResult } from '../../core/compiler'
import { compileGraph } from '../../core/graphCompiler'
import { createBlankProject } from '../../data/newProject'
import { I18nProvider } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { TargetCompileState } from '../compiler/useTargetCompile'
import { stateForTarget, targetStatus, TargetSwitchDialog, WorkspaceExportPanel, type ProjectCompiles } from './WorkspaceTargets'

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
  stats: {
    proxyCount: 0, endpointCount: 0, candidateCount: 11, compatibleEndpointCount: 7,
    skippedEndpointCount: 4, blockingIssueCount: 1,
  },
}

describe('Workspace target status', () => {
  it('keeps a successful primary target export ready when the secondary target is blocked', () => {
    const mihomoState: TargetCompileState = { status: 'success', result: successResult }
    const singBoxState: TargetCompileState = { status: 'error', result: blockedResult }
    const surgeState: TargetCompileState = { status: 'error', result: surgeBlockedResult }
    const loonState: TargetCompileState = { status: 'success', result: successResult }
    const compiles = { mihomoState, surgeState, singBoxState, loonState } as ProjectCompiles

    expect(targetStatus(stateForTarget(compiles, 'mihomo'), [], true)).toEqual(expect.objectContaining({ kind: 'ready' }))
    expect(targetStatus(stateForTarget(compiles, 'sing-box'), [], false)).toEqual(expect.objectContaining({ kind: 'available', errorCount: 0 }))
    expect(targetStatus(stateForTarget(compiles, 'surge'), [], false)).toEqual(expect.objectContaining({ kind: 'available', errorCount: 0 }))
    expect(targetStatus(stateForTarget(compiles, 'surge'), [], true)).toEqual(expect.objectContaining({ kind: 'blocked', errorCount: 1 }))
    expect(stateForTarget(compiles, 'mihomo').result?.stats?.proxyCount).toBe(3)
    expect(stateForTarget(compiles, 'loon')).toBe(loonState)
  })

  it('distinguishes active checking from every inactive compiler state', () => {
    const states: TargetCompileState[] = [
      { status: 'idle' },
      { status: 'loading' },
      { status: 'success', result: successResult },
      { status: 'error', result: blockedResult },
      { status: 'unavailable', error: 'Unavailable.' },
    ]
    expect(targetStatus(states[0], [], true).kind).toBe('loading')
    expect(targetStatus(states[1], [], true).kind).toBe('loading')
    for (const state of states) expect(targetStatus(state, [], false)).toEqual({
      kind: 'available', errorCount: 0, warningCount: 0, issues: [],
    })
  })

  it('keeps active graph warnings aligned with target warnings without double counting', () => {
    const graphWarning = { target: 'mihomo' as const, feature: 'graph', code: 'GRAPH_LIMIT', severity: 'warning' as const, message: 'Graph warning.' }
    const targetWarning = { target: 'mihomo' as const, feature: 'proxy', code: 'MIHOMO_PROXY_VARIANT_UNSUPPORTED', severity: 'warning' as const, message: 'Variant warning.' }
    const state: TargetCompileState = {
      status: 'success',
      result: { ...successResult, issues: [graphWarning, targetWarning] },
    }
    const status = targetStatus(state, [graphWarning], true)
    expect(status).toEqual(expect.objectContaining({ kind: 'ready', warningCount: 2 }))
    expect(status.issues).toEqual([graphWarning, targetWarning])
  })

  it('keeps inactive targets available through Mihomo to Surge to Mihomo state transitions', () => {
    const mihomoSuccess: TargetCompileState = { status: 'success', result: successResult }
    const surgeSuccess: TargetCompileState = { status: 'success', result: successResult }
    expect([targetStatus(mihomoSuccess, [], true).kind, targetStatus({ status: 'idle' }, [], false).kind]).toEqual(['ready', 'available'])
    expect([targetStatus(mihomoSuccess, [], false).kind, targetStatus({ status: 'loading' }, [], true).kind]).toEqual(['available', 'loading'])
    expect([targetStatus({ status: 'loading' }, [], true).kind, targetStatus(surgeSuccess, [], false).kind]).toEqual(['loading', 'available'])
  })

  it.each(['mihomo', 'surge'] as const)('shows only the current %s target as checked in the switch dialog', (current) => {
    const project = createBlankProject(current)
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: current }),
      mihomoState: current === 'mihomo' ? { status: 'success', result: successResult } : { status: 'idle' },
      surgeState: current === 'surge' ? { status: 'success', result: successResult } : { status: 'idle' },
      singBoxState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(TargetSwitchDialog, {
      open: true, current, compiles, onClose: () => undefined, onSelect: () => undefined,
    })))
    expect(html).toContain('Ready')
    expect(html).toContain('Available')
    expect(html).toContain('Compatibility is checked after switching')
    expect(html).not.toContain('Checking')
    expect((html.match(/class="spin"/g) ?? [])).toHaveLength(0)
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

  it('keeps an internal Loon Project on the Loon compiler and .conf artifact path', () => {
    const project = createBlankProject('loon')
    project.name = 'My Project'
    useBuilderStore.getState().hydrate(structuredClone(project))
    const loonResult: CompileResult = {
      ...successResult,
      content: '[General]\n[Proxy]\n',
      issues: [],
    }
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'loon' }),
      mihomoState: { status: 'idle' },
      surgeState: { status: 'idle' },
      singBoxState: { status: 'idle' },
      loonState: { status: 'success', result: loonResult },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'loon', compiles, onPreview: () => undefined, onSelectTarget: () => undefined,
    })))
    expect(html).toContain('Loon official export is paused')
    expect(html).toContain('我的代理配置-loon.conf')
    expect(html).toContain('[General]')
    expect(html).toContain('Loon profile compiler')
    expect(html).not.toContain('我的代理配置-mihomo.yaml')
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
    expect(html).toContain('7 compatible nodes')
    expect(html).not.toContain('0 compatible nodes')
    expect(html).toContain('我的代理配置-surge.conf')
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(3)
  })

  it('renders a compatible Surge profile with its deterministic filename and enabled export controls', () => {
    const project = createBlankProject('surge')
    project.name = 'Release / Candidate'
    useBuilderStore.getState().hydrate(structuredClone(project))
    const surgeResult = {
      ...successResult,
      content: '[General]\n\n[Proxy]\n\n[Proxy Group]\n\n[Rule]\nFINAL,DIRECT\n',
      stats: {
        proxyCount: 18, endpointCount: 18, candidateCount: 30, compatibleEndpointCount: 18,
        skippedEndpointCount: 12, blockingIssueCount: 0,
      },
      issues: [{
        target: 'surge' as const, code: 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED', severity: 'warning' as const,
        feature: 'proxy', message: 'Surge can use 18 of 30 candidates. 12 endpoints were skipped.',
      }],
    }
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
    expect(html).toContain('<dt>Compatible</dt><dd>18 <span>/ 30</span></dd>')
    expect(html).toContain('<dt>Skipped</dt><dd>12</dd>')
    expect(html).toContain('<dt>Blocking</dt><dd>0</dd>')
    expect(html).toContain('Skipped 12 incompatible nodes')
    expect(html).toContain('The current configuration can still be exported.')
    expect(html).toContain('Technical details · 1')
    expect(html).toContain('Available')
    expect(html).not.toContain('Checking')
    expect(html).not.toContain('disabled=""')
  })

  it('shows an inactive Surge target as available on a ready Mihomo export', () => {
    const project = createBlankProject('mihomo')
    useBuilderStore.getState().hydrate(structuredClone(project))
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'mihomo' }),
      mihomoState: { status: 'success', result: successResult },
      surgeState: { status: 'idle' },
      singBoxState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'mihomo', compiles, onPreview: () => undefined, onSelectTarget: () => undefined,
    })))
    expect(html).toContain('Available')
    expect(html).toContain('Compatibility is checked after switching')
    expect(html).not.toContain('Checking')
  })
})
