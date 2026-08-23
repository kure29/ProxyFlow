import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WorkspaceProxySummary } from '../../core/workspace'
import { I18nProvider, setCurrentLocale } from '../../i18n'
import { demoNodes, demoProject } from '../../data/demoProject'
import { useBuilderStore } from '../../store/useBuilderStore'
import { createWorkspaceProjection } from '../../core/workspace'
import { collectProxyFilterOptions, ProcessingWorkspace, ProjectHealthWorkspace, resolveRelativeSourceTime } from './WorkspacePages'
import type { CompatibilityIssue } from '../../types/project'

describe('Workspace page presentation helpers', () => {
  it('builds stable de-duplicated Proxy filters from real projection values', () => {
    const proxies: WorkspaceProxySummary[] = [
      { id: 'us', name: 'US', protocol: 'trojan', region: 'US', sourceId: 'b', sourceName: 'Beta', sourceAvailability: 'stale', compatibility: 'partial' },
      { id: 'hk', name: 'HK', protocol: 'vless', region: 'HK', sourceId: 'a', sourceName: 'Alpha', sourceAvailability: 'healthy', compatibility: 'supported' },
      { id: 'hk-2', name: 'HK 2', protocol: 'trojan', region: 'HK', sourceId: 'a', sourceName: 'Alpha duplicate', sourceAvailability: 'healthy', compatibility: 'partial' },
    ]

    expect(collectProxyFilterOptions(proxies)).toEqual({
      sources: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }],
      regions: ['HK', 'US'],
      protocols: ['trojan', 'vless'],
      sourceAvailabilities: ['healthy', 'stale'],
      compatibilities: ['partial', 'supported'],
    })
  })

  it('classifies recent refresh timestamps without locale-dependent strings', () => {
    const now = Date.parse('2026-08-18T12:00:00.000Z')
    expect(resolveRelativeSourceTime('2026-08-18T11:59:45.000Z', now)).toEqual({ unit: 'now', count: 0 })
    expect(resolveRelativeSourceTime('2026-08-18T11:52:00.000Z', now)).toEqual({ unit: 'minute', count: 8 })
    expect(resolveRelativeSourceTime('2026-08-18T09:00:00.000Z', now)).toEqual({ unit: 'hour', count: 3 })
    expect(resolveRelativeSourceTime('2026-08-16T12:00:00.000Z', now)).toEqual({ unit: 'day', count: 2 })
  })

  it('uses an absolute date for older refreshes and rejects invalid timestamps', () => {
    const now = Date.parse('2026-08-18T12:00:00.000Z')
    expect(resolveRelativeSourceTime('2026-08-01T12:00:00.000Z', now)).toEqual({ unit: 'date', value: new Date('2026-08-01T12:00:00.000Z') })
    expect(resolveRelativeSourceTime('not-a-date', now)).toBeUndefined()
  })

  it('keeps the existing Route Inspector available from Workspace Project Health', () => {
    useBuilderStore.getState().hydrate(structuredClone(demoProject))
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(ProjectHealthWorkspace, {
      nodes: demoNodes,
      diagnostics: [],
      compatibilityDiagnostics: [],
      onOpenNode: () => undefined,
    })))

    expect(html).toContain('route-inspector-panel')
    expect(html).toContain('route-inspector-query')
    expect(html).toContain('workspace-health-ready')
  })

  it('shows repeated Mihomo compatibility rows as one human issue with folded technical details', () => {
    setCurrentLocale('en-US')
    useBuilderStore.getState().hydrate(structuredClone(demoProject))
    const sourceIds = demoNodes.filter((node) => node.data.category === 'source').slice(0, 2).map(({ id }) => id)
    const compatibilityDiagnostics: CompatibilityIssue[] = Array.from({ length: 88 }, (_, index) => ({
      target: 'mihomo', code: 'MIHOMO_PROXY_VARIANT_UNSUPPORTED', severity: 'warning', feature: 'source',
      entityId: sourceIds[index % sourceIds.length], message: `Proxy “Node ${index + 1}” contains unsupported feature-${index + 1}.`,
    }))
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(ProjectHealthWorkspace, {
      nodes: demoNodes, diagnostics: [], compatibilityDiagnostics, onOpenNode: () => undefined,
    })))

    expect(html).toContain('88 nodes have compatibility limits')
    expect(html).toContain('This warning does not itself block export.')
    expect(html).toContain('87 related issues')
    expect((html.match(/88 nodes have compatibility limits/g) ?? [])).toHaveLength(1)
    expect(html.indexOf('MIHOMO_PROXY_VARIANT_UNSUPPORTED')).toBeGreaterThan(html.indexOf('<details class="workspace-health-technical">'))
  })

  it('keeps info and raw diagnostic details in the right Project Health hierarchy', () => {
    setCurrentLocale('en-US')
    useBuilderStore.getState().hydrate(structuredClone(demoProject))
    const sourceId = demoNodes.find((node) => node.data.category === 'source')!.id
    const strategyId = demoNodes.find((node) => node.data.category === 'strategy')!.id
    const diagnostics = [{
      code: 'FUTURE_DIAGNOSTIC', severity: 'warning' as const, nodeId: sourceId,
      message: 'Raw future compiler wording.',
    }]
    const compatibilityDiagnostics: CompatibilityIssue[] = [{
      target: 'surge', code: 'SURGE_LEGACY_SERVICE_RULE_UNSUPPORTED', severity: 'error', feature: 'routing', entityId: strategyId,
      message: 'A first-party service rule cannot be represented by Surge.',
    }, {
      target: 'surge', code: 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED', severity: 'warning', feature: 'strategy', entityId: strategyId,
      message: 'Surge can use 15 of 23 candidates in strategy “Auto Select”. 8 incompatible endpoints were skipped (endpoint variant: 6, VLESS: 2).',
    }, {
      target: 'surge', code: 'SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED', severity: 'info', feature: 'remote-source', entityId: sourceId,
      message: 'Source “Subscription” is materialized from its validated snapshot because its remote format is not proven Surge-compatible.',
    }]
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(ProjectHealthWorkspace, {
      nodes: demoNodes, diagnostics, compatibilityDiagnostics, onOpenNode: () => undefined,
    })))

    expect(html).toContain('Skipped 8 incompatible nodes')
    expect(html).toContain('6 nodes include parameters that Surge cannot fully represent')
    expect(html).toContain('2 nodes use protocols that Surge does not support')
    expect(html).toContain('Compatibility limitation')
    expect(html.indexOf('FUTURE_DIAGNOSTIC')).toBeGreaterThan(html.indexOf('<details class="workspace-health-technical">'))
    expect(html.indexOf('Raw future compiler wording.')).toBeGreaterThan(html.indexOf('<details class="workspace-health-technical">'))

    const errorStart = html.indexOf('data-severity="error"')
    const warningStart = html.indexOf('data-severity="warning"')
    const compatibilityStart = html.indexOf('data-severity="compatibility"')
    const infoStart = html.indexOf('data-severity="info"')
    expect(html.slice(errorStart, warningStart)).toContain('Export blocked')
    expect(html.slice(errorStart, warningStart)).toContain('SURGE_LEGACY_SERVICE_RULE_UNSUPPORTED')
    expect(html.slice(compatibilityStart, infoStart)).not.toContain('SURGE_LEGACY_SERVICE_RULE_UNSUPPORTED')
    expect(infoStart).toBeGreaterThan(compatibilityStart)
    expect(html.slice(compatibilityStart, infoStart)).not.toContain('Using the current subscription snapshot')
    expect(html.slice(infoStart)).toContain('Using the current subscription snapshot')
    expect(html.indexOf('SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED')).toBeGreaterThan(infoStart)
  })

  it('keeps Processing card controls in the mobile two-row layout contract', () => {
    const item = createWorkspaceProjection(demoProject).processing[0]
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(ProcessingWorkspace, {
      items: [item],
      runtime: new Map(),
      issues: [],
      availability: () => ({ up: false, down: false }),
      onMove: () => undefined,
      onToggle: () => undefined,
      onEdit: () => undefined,
      onShowFlow: () => undefined,
      onDuplicate: () => undefined,
      onDelete: () => undefined,
    })))
    expect(html).toContain('workspace-processing-step')
    expect(html).toContain('workspace-processing-body')
    expect(html).toContain('workspace-compact-toggle')
    expect(html).toContain('workspace-step-actions')
    expect(html).toContain('data-mobile-layout="body-toggle-actions"')
    expect(html).toContain('data-action-layout="horizontal"')
  })
})
