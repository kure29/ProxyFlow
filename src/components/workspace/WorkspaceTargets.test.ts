import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CompileResult } from '../../core/compiler'
import { compileGraph } from '../../core/graphCompiler'
import { demoNodes, demoProject } from '../../data/demoProject'
import { createBlankProject } from '../../data/newProject'
import { I18nProvider } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import type { TargetCompileState } from '../compiler/useTargetCompile'
import { stateForTarget, targetStatus, MihomoSettingsDrawer, TargetSwitchDialog, WorkspaceExportPanel, type ProjectCompiles } from './WorkspaceTargets'

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
    const compiles = { mihomoState, surgeState, singBoxState, loonState, shadowrocketState: { status: 'idle' } } as ProjectCompiles

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
      loonState: { status: 'idle' },
      shadowrocketState: { status: 'idle' },
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

  it('shows each supported product target once while explaining a preserved historical sing-box Project', () => {
    const project = createBlankProject('sing-box')
    useBuilderStore.getState().hydrate(structuredClone(project))
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'mihomo' }),
      mihomoState: { status: 'success', result: successResult },
      surgeState: { status: 'error', result: surgeBlockedResult },
      singBoxState: { status: 'idle' },
      loonState: { status: 'idle' },
      shadowrocketState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'sing-box',
      compiles,
      onSelectTarget: () => undefined,
    })))
    expect(html).toContain('sing-box official export is paused')
    expect(html).not.toContain('/third-party/sing-box/icon.svg')
    expect((html.match(/workspace-target-icon/g) ?? [])).toHaveLength(5)
    expect(html).toContain('Surge')
    expect(html).toContain('Loon')
    expect(html).toContain('Shadowrocket')
    expect((html.match(/loon\.png/g) ?? [])).toHaveLength(2)
  })

  it('keeps a supported Loon Project on the Loon compiler and .conf artifact path', () => {
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
      shadowrocketState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'loon', compiles, onSelectTarget: () => undefined,
    })))
    expect(html).not.toContain('Loon official export is paused')
    expect(html).toContain('我的代理配置-loon.conf')
    expect(html).toContain('[General]')
    expect(html).toContain('Loon profile compiler')
    expect(html).toContain('Shared Policy → client output')
    expect(html).toContain('Choose target')
    expect(html).toContain('Compatibility')
    expect(html).toContain('Settings')
    expect(html).toContain('Export')
    expect(html).toContain('Minimum supported versions: 3.5.0 (975).')
    expect(html).not.toContain('我的代理配置-mihomo.yaml')
    expect(html).not.toContain('workspace-export-internal-target')
    expect((html.match(/loon\.png/g) ?? [])).toHaveLength(4)
  })

  it('exposes the evidence-bounded Shadowrocket compiler and current .conf artifact', () => {
    const project = createBlankProject('shadowrocket')
    project.name = 'Shadowrocket Smoke'
    useBuilderStore.getState().hydrate(structuredClone(project))
    const shadowrocketResult: CompileResult = {
      ...successResult,
      content: '[General]\ndns-server = system\n[Rule]\nFINAL,DIRECT\n',
    }
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'shadowrocket' }),
      mihomoState: { status: 'idle' },
      surgeState: { status: 'idle' },
      singBoxState: { status: 'idle' },
      loonState: { status: 'idle' },
      shadowrocketState: { status: 'success', result: shadowrocketResult },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'shadowrocket', compiles, onSelectTarget: () => undefined,
    })))
    expect(html).not.toContain('Shadowrocket official export is paused')
    expect(html).toContain('-shadowrocket.conf')
    expect(html).toContain('Shadowrocket .conf export for the tested 2.2.65 build 2615 subset')
    expect(html).toContain('Tested client baseline: 2.2.65 build 2615.')
    expect(html).not.toContain('Minimum supported versions: 2.2.65 build 2615.')
    expect(html).toContain('[General]')
    expect(html).toContain('Ready to export')
  })

  it('keeps an incompatible Surge target selected and shows a concise blocked export state', () => {
    const project = createBlankProject('surge')
    project.name = 'Blocked RC'
    useBuilderStore.getState().hydrate(structuredClone(project))
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'surge' }),
      mihomoState: { status: 'idle' },
      surgeState: { status: 'error', result: surgeBlockedResult },
      singBoxState: { status: 'idle' },
      loonState: { status: 'idle' },
      shadowrocketState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'surge', compiles, onSelectTarget: () => undefined,
    })))
    expect(useBuilderStore.getState().primaryTarget).toBe('surge')
    expect(html).toContain('Surge configuration cannot be generated yet')
    expect(html).not.toContain('SURGE_PROXY_PROTOCOL_UNSUPPORTED')
    expect(html).not.toContain('0 compatible nodes')
    expect(html).toContain('Surge configuration cannot be generated yet')
    expect(html).not.toContain('workspace-export-code-toolbar')
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps checking inside the same preview shell without rendering configuration', () => {
    const project = createBlankProject('surge')
    useBuilderStore.getState().hydrate(structuredClone(project))
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'surge' }),
      mihomoState: { status: 'idle' }, surgeState: { status: 'idle' }, singBoxState: { status: 'idle' }, loonState: { status: 'idle' }, shadowrocketState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'surge', compiles, onSelectTarget: () => undefined,
    })))

    expect(html).toContain('workspace-export-preview is-loading')
    expect(html).toContain('workspace-export-preview-checking')
    expect(html).toContain('Checking compatibility')
    expect(html).not.toContain('workspace-export-code-toolbar')
    expect(html).not.toContain('workspace-export-preview-blocked-state')
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps Mihomo settings available while blocked without enabling export actions', () => {
    const project = createBlankProject('mihomo')
    useBuilderStore.getState().hydrate(structuredClone(project))
    const blockedResult: CompileResult = {
      ...successResult,
      success: false,
      content: '',
      issues: [{ target: 'mihomo', code: 'MIHOMO_BLOCKED', severity: 'error', feature: 'network', message: 'Mihomo output is blocked.' }],
    }
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'mihomo' }),
      mihomoState: { status: 'error', result: blockedResult }, surgeState: { status: 'idle' }, singBoxState: { status: 'idle' }, loonState: { status: 'idle' }, shadowrocketState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'mihomo', compiles, onSelectTarget: () => undefined,
    })))

    expect(html).toContain('workspace-export-settings-trigger')
    expect(html).toContain('Cannot export yet')
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(2)
    expect(html).not.toContain('workspace-export-code-toolbar')
  })

  it('renders a concise blocked export state without fake configuration正文', () => {
    const project = structuredClone(demoProject)
    project.primaryTarget = 'surge'
    project.name = 'Blocked Export'
    useBuilderStore.getState().hydrate(structuredClone(project))
    const strategyId = demoNodes.find((node) => node.data.category === 'strategy')!.id
    const blockedStrategyResult: CompileResult = {
      ...surgeBlockedResult,
      issues: [
        { target: 'surge', code: 'SURGE_STRATEGY_NO_COMPATIBLE_MEMBERS', severity: 'error', feature: 'strategy', entityId: strategyId, message: 'No compatible members.' },
        { target: 'surge', code: 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED', severity: 'warning', feature: 'strategy', entityId: strategyId, message: 'Surge can use 0 of 13 candidates. 13 endpoints were skipped.' },
      ],
      stats: { proxyCount: 0, endpointCount: 0, candidateCount: 13, compatibleEndpointCount: 0, skippedEndpointCount: 13, blockingIssueCount: 1 },
      targetProjection: {
        target: 'surge', candidateCount: 13, compatibleCount: 0, skippedCount: 13, blockingCount: 1, status: 'blocked', reasons: [],
        strategies: [{ target: 'surge', strategyId, candidateCount: 13, compatibleCount: 0, skippedCount: 13, blockingCount: 1, status: 'blocked', reasons: [] }],
      },
    }
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'surge' }),
      mihomoState: { status: 'idle' },
      surgeState: { status: 'error', result: blockedStrategyResult },
      singBoxState: { status: 'idle' },
      loonState: { status: 'idle' },
      shadowrocketState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'surge', compiles, onSelectTarget: () => undefined, onShowDiagnostics: () => undefined,
    })))

    expect(html).toContain('Surge configuration cannot be generated yet')
    expect(html).toContain('Hong Kong auto select')
    expect(html).toContain('0 of 13 candidate nodes can be used by Surge')
    expect(html).toContain('View all issues')
    expect((html.match(/View all issues/g) ?? [])).toHaveLength(1)
    expect(html).toContain('Cannot export yet · 1 blocker · 2 warnings')
    expect(html).toContain('workspace-export-preview is-blocked')
    expect((html.match(/workspace-export-preview is-blocked/g) ?? [])).toHaveLength(1)
    expect(html).not.toContain('workspace-export-summary-header')
    expect(html).toContain('workspace-export-target-list')
    expect((html.match(/workspace-export-target-item/g) ?? [])).toHaveLength(4)
    expect(html).not.toContain('workspace-export-compatibility')
    expect(html).not.toContain('workspace-export-actions')
    expect(html).not.toContain('workspace-target-status')
    expect(html).not.toContain('workspace-export-code-toolbar')
    expect(html).not.toContain('<ol class="workspace-export-code"')
    expect(html).not.toContain('workspace-export-diagnostics')
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(2)
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
      loonState: { status: 'idle' },
      shadowrocketState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'surge', compiles, onSelectTarget: () => undefined, onShowDiagnostics: () => undefined,
    })))
    expect(html).toContain('Ready to export')
    expect(html).toContain('我的代理配置-surge.conf')
    expect(html).toContain('[General]')
    expect(html).toContain('iOS 5.22+ / Mac 6.9+')
    expect(html).toContain('Minimum supported versions: iOS 5.22+ / Mac 6.9+.')
    expect(html).toContain('Ready to export · 1 warning')
    expect(html).toContain('workspace-export-preview is-ready')
    expect((html.match(/workspace-export-preview is-ready/g) ?? [])).toHaveLength(1)
    expect(html).not.toContain('workspace-export-summary-header')
    expect(html).not.toContain('Skipped 12 incompatible nodes')
    expect(html).not.toContain('Technical details')
    expect(html).toContain('Available')
    expect(html).not.toContain('Checking')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('workspace-export-configuration')
    expect(html).not.toContain('workspace-export-settings-trigger')
  })

  it('deduplicates repeated high-level blocker summaries without exposing technical codes', () => {
    const project = createBlankProject('shadowrocket')
    useBuilderStore.getState().hydrate(structuredClone(project))
    const repeatedIssues = ['proxy-a', 'proxy-b', 'proxy-c'].map((entityId) => ({
      target: 'shadowrocket' as const,
      code: 'SHADOWROCKET_PROXY_PROTOCOL_UNPROVEN',
      severity: 'error' as const,
      feature: 'proxy',
      entityId,
      message: `Unproven proxy mapping for ${entityId}.`,
    }))
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'shadowrocket' }),
      mihomoState: { status: 'idle' }, surgeState: { status: 'idle' }, singBoxState: { status: 'idle' }, loonState: { status: 'idle' },
      shadowrocketState: { status: 'error', result: { ...successResult, success: false, content: '', issues: repeatedIssues } },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'shadowrocket', compiles, onSelectTarget: () => undefined, onShowDiagnostics: () => undefined,
    })))

    expect((html.match(/Shadowrocket behavior is not proven/g) ?? [])).toHaveLength(1)
    expect(html).toContain('Cannot export yet · 3 blockers · 0 warnings')
    expect(html).not.toContain('SHADOWROCKET_PROXY_PROTOCOL_UNPROVEN')
  })

  it('shows an inactive Surge target as available on a ready Mihomo export', () => {
    const project = createBlankProject('mihomo')
    useBuilderStore.getState().hydrate(structuredClone(project))
    const compiles = {
      graphResult: compileGraph(project, { validationTarget: 'mihomo' }),
      mihomoState: { status: 'success', result: successResult },
      surgeState: { status: 'idle' },
      singBoxState: { status: 'idle' },
      loonState: { status: 'idle' },
      shadowrocketState: { status: 'idle' },
    } as ProjectCompiles
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(WorkspaceExportPanel, {
      primaryTarget: 'mihomo', compiles, onSelectTarget: () => undefined,
    })))
    expect(html).toContain('Available')
    expect(html).not.toContain('Available · switch to check')
    expect(html).not.toContain('Checking')
    expect(html).not.toContain('1 blocker · 0 warnings')
    expect(html).not.toContain('SURGE_PROXY_PROTOCOL_UNSUPPORTED')
    expect(html).toContain('workspace-export-preview is-ready')
    expect(html).toContain('workspace-export-settings-trigger')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-controls="workspace-export-settings-drawer"')
    expect(html).not.toContain('workspace-export-configuration')
    expect(html).not.toContain('<aside id="workspace-export-settings-drawer"')
  })

  it('renders managed Mihomo values ahead of legacy profile values without writing on read', () => {
    const onManagedChange = () => { throw new Error('read-only render must not update settings') }
    const profile = {
      preset: 'local-proxy' as const, mixedPort: 7890, allowLan: true, ipv6: true,
      dnsMode: 'redir-host' as const, tunStack: 'mixed' as const, strictRoute: false,
      sniffer: false, storeSelected: true, unifiedDelay: true, tcpConcurrent: true,
    }
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(MihomoSettingsDrawer, {
      targetLabel: 'Mihomo', profile, managedSettings: { mixedPort: 7999, allowLan: false, ipv6: false },
      dnsResolverCount: 0, onChange: () => undefined, onManagedChange, onManagedReset: () => undefined,
      onPresetChange: () => undefined, onClose: () => undefined,
    })))
    expect(html).toContain('value="7999"')
    expect(html).toContain('<strong>LAN access</strong></span><input type="checkbox"/>')
    expect(html).toContain('<strong>IPv6 traffic</strong>')
    expect(html).toContain('Use profile/default')
  })
})
