import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WorkspaceProxySummary } from '../../core/workspace'
import { I18nProvider } from '../../i18n'
import { demoNodes, demoProject } from '../../data/demoProject'
import { useBuilderStore } from '../../store/useBuilderStore'
import { createWorkspaceProjection } from '../../core/workspace'
import { collectProxyFilterOptions, ProcessingWorkspace, ProjectHealthWorkspace, resolveRelativeSourceTime } from './WorkspacePages'

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
