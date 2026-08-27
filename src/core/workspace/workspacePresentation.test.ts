import { describe, expect, it } from 'vitest'
import type { CompatibilityIssue, GraphNode } from '../../types/project'
import type { TargetProjectionSummary } from '../compiler'
import type { StructuredDiagnostic } from '../compiler/diagnostics'
import type { WorkspaceNodeItem, WorkspaceProxySummary } from './projectWorkspace'
import {
  extractSafeSourceHostname,
  filterWorkspaceProxies,
  groupProjectHealthDiagnostics,
  summarizeWorkspaceProcessing,
  summarizeWorkspaceSource,
  summarizeWorkspaceStrategy,
} from './workspacePresentation'

function node(id: string, blockType: GraphNode['data']['blockType'], data: Partial<GraphNode['data']> = {}): GraphNode {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    data: {
      blockType,
      category: data.category ?? 'processing',
      title: data.title ?? id,
      subtitle: data.subtitle ?? '',
      icon: data.icon ?? 'box',
      ...data,
    },
  }
}

function item(graphNode: GraphNode, incoming: WorkspaceNodeItem['incoming'] = []): WorkspaceNodeItem {
  return { node: graphNode, incoming, outgoing: [] }
}

describe('workspace presentation', () => {
  it('summarizes a URL source with hostname only and never returns URL secrets', () => {
    const source = node('source', 'subscription', {
      category: 'source',
      title: 'Production subscription',
      subscriptionInputKind: 'url',
      subscriptionUrl: 'https://feeds.example.com:8443/private/list?opaque=test-value#fragment',
      nodeCount: 3,
    })
    const presentation = summarizeWorkspaceSource(source, {
      refreshStatus: 'failed',
      freshness: 'stale',
      activeState: 'usable',
      activeSnapshot: { committedAt: '2026-08-18T01:00:00.000Z', result: { detectedCount: 144 } },
      lastSuccessfulAt: '2026-08-18T02:00:00.000Z',
    })

    expect(presentation).toEqual({
      id: 'source',
      title: 'Production subscription',
      kind: 'subscription',
      hostname: 'feeds.example.com',
      nodeCount: 144,
      lastSuccessfulAt: '2026-08-18T02:00:00.000Z',
      status: 'error',
      usingLastKnownGood: true,
    })
    expect(JSON.stringify(presentation)).not.toMatch(/private|opaque|test-value|8443/)
  })

  it('rejects non-HTTP and malformed source locations and omits locations for pasted sources', () => {
    expect(extractSafeSourceHostname('https://sub.example.com/path?q=secret')).toBe('sub.example.com')
    expect(extractSafeSourceHostname('provider://secret/path')).toBeUndefined()
    expect(extractSafeSourceHostname('not a URL')).toBeUndefined()
    expect(summarizeWorkspaceSource(node('paste', 'subscription', {
      category: 'source', subscriptionInputKind: 'paste', subscriptionUrl: 'https://secret.example.com/token',
    }))).not.toHaveProperty('hostname')
  })

  it('combines search with exact source, region, protocol, availability, and compatibility filters without reordering input', () => {
    const proxies: WorkspaceProxySummary[] = [
      { id: 'hk-1', name: 'Hong Kong Edge', protocol: 'vless', region: 'HK', sourceId: 'airport-a', sourceName: 'Airport A', sourceAvailability: 'healthy', compatibility: 'supported' },
      { id: 'us-1', name: 'US Fast', protocol: 'trojan', region: 'US', sourceId: 'airport-a', sourceName: 'Airport A', sourceAvailability: 'healthy', compatibility: 'partial' },
      { id: 'hk-2', name: 'Backup', protocol: 'trojan', region: 'HK', sourceId: 'airport-b', sourceName: 'Hong Kong Backup', sourceAvailability: 'stale', compatibility: 'partial' },
    ]

    expect(filterWorkspaceProxies(proxies, { search: 'HONG KONG' }).map(({ id }) => id)).toEqual(['hk-1', 'hk-2'])
    expect(filterWorkspaceProxies(proxies, {
      sourceId: ' AIRPORT-A ', region: 'us', protocol: 'trojan', sourceAvailability: 'healthy', compatibility: 'partial',
    }).map(({ id }) => id)).toEqual(['us-1'])
    expect(filterWorkspaceProxies(proxies, { sourceAvailability: 'stale' }).map(({ id }) => id)).toEqual(['hk-2'])
    expect(proxies.map(({ id }) => id)).toEqual(['hk-1', 'us-1', 'hk-2'])
  })

  it('returns structured processing summaries and runtime counts without mutating graph semantics', () => {
    const filter = item(node('filter', 'filter', {
      filterMode: 'region', filterOperation: 'exclude', filterRegions: ['HK', 'US'], disabled: false,
    }))
    const before = structuredClone(filter)
    expect(summarizeWorkspaceProcessing(filter, {
      status: 'ready', inputCount: 20, outputCount: 12, removedCount: 8,
    })).toEqual(expect.objectContaining({
      id: 'filter', status: 'ready', inputCount: 20, outputCount: 12, removedCount: 8,
      summary: { kind: 'filter', mode: 'region', operation: 'exclude', criterionCount: 2 },
    }))
    expect(filter).toEqual(before)

    const merge = item(node('merge', 'merge'), [
      { edgeId: 'a', nodeId: 'source-a', semantic: 'data' },
      { edgeId: 'b', nodeId: 'route-a', semantic: 'route' },
    ])
    expect(summarizeWorkspaceProcessing(merge).summary).toEqual({ kind: 'merge', sourceCount: 1 })
  })

  it('summarizes basic and advanced strategies with target capability and truthful counts', () => {
    const fallback = item(node('fallback', 'fallback', {
      category: 'strategy', interval: 120, tolerance: 40,
    }))
    expect(summarizeWorkspaceStrategy(fallback, 'sing-box', { status: 'ready', outputCount: 12 })).toEqual(expect.objectContaining({
      kind: 'failover', advanced: false, capability: 'unsupported', status: 'ready', candidateCount: 12,
      summary: { kind: 'failover', intervalSeconds: 120, toleranceMs: 40 },
    }))

    const chain = item(node('chain', 'proxy-chain', { category: 'chain', hopIds: ['first', 'second'] }))
    expect(summarizeWorkspaceStrategy(chain, 'mihomo')).toEqual(expect.objectContaining({
      kind: 'chain', advanced: true, capability: 'partial', summary: { kind: 'chain', hopCount: 2 },
    }))
    expect(summarizeWorkspaceStrategy(chain, null).capability).toBe('unknown')
  })

  it.each([
    ['blocked', 0, 13, 13],
    ['partial', 8, 13, 5],
    ['ready', 13, 13, 0],
  ] as const)('projects %s target-specific strategy state without changing neutral runtime counts', (status, compatibleCount, candidateCount, skippedCount) => {
    const strategy = item(node('auto', 'auto-select', { category: 'strategy' }))
    const projection: TargetProjectionSummary = {
      target: 'surge', candidateCount, compatibleCount, skippedCount, blockingCount: status === 'blocked' ? 1 : 0,
      status, reasons: [],
      strategies: [{
        target: 'surge', strategyId: 'auto', candidateCount, compatibleCount, skippedCount,
        blockingCount: status === 'blocked' ? 1 : 0, status, reasons: [],
      }],
    }

    const shown = summarizeWorkspaceStrategy(strategy, 'surge', {
      status: 'ready', outputCount: candidateCount,
    }, [], projection)
    expect(shown.candidateCount).toBe(candidateCount)
    expect(shown.targetProjection).toEqual(expect.objectContaining({
      target: 'surge', strategyId: 'auto', candidateCount, compatibleCount, skippedCount, status,
    }))
  })

  it('keeps Mihomo and Surge projection results scoped to the selected target', () => {
    const strategy = item(node('auto', 'auto-select', { category: 'strategy' }))
    const surgeProjection: TargetProjectionSummary = {
      target: 'surge', candidateCount: 13, compatibleCount: 0, skippedCount: 13,
      blockingCount: 1, status: 'blocked', reasons: [],
      strategies: [{ target: 'surge', strategyId: 'auto', candidateCount: 13, compatibleCount: 0, skippedCount: 13, blockingCount: 1, status: 'blocked', reasons: [] }],
    }
    const mihomoProjection: TargetProjectionSummary = {
      target: 'mihomo', candidateCount: 13, compatibleCount: 13, skippedCount: 0,
      blockingCount: 0, status: 'ready', reasons: [],
      strategies: [{ target: 'mihomo', strategyId: 'auto', candidateCount: 13, compatibleCount: 13, skippedCount: 0, blockingCount: 0, status: 'ready', reasons: [] }],
    }
    expect(summarizeWorkspaceStrategy(strategy, 'surge', undefined, [], surgeProjection).targetProjection?.target).toBe('surge')
    expect(summarizeWorkspaceStrategy(strategy, 'mihomo', undefined, [], mihomoProjection).targetProjection).toEqual(expect.objectContaining({ target: 'mihomo', status: 'ready', compatibleCount: 13 }))
    expect(summarizeWorkspaceStrategy(strategy, 'mihomo', undefined, [], surgeProjection).targetProjection).toBeUndefined()
    expect(summarizeWorkspaceStrategy(strategy, 'surge', undefined, [], mihomoProjection).targetProjection).toBeUndefined()
  })

  it('groups project and compatibility diagnostics while locating only real graph nodes', () => {
    const diagnostics: StructuredDiagnostic[] = [
      { code: 'SOURCE_ERROR', severity: 'error', message: 'Source is invalid.', entityId: 'source' },
      { code: 'ROUTE_WARNING', severity: 'warning', message: 'Route needs review.', nodeId: 'route' },
      { code: 'PROJECT_NOTE', severity: 'info', message: 'Project note.' },
    ]
    const compatibility: CompatibilityIssue[] = [
      { target: 'sing-box', code: 'TARGET_UNSUPPORTED', severity: 'error', feature: 'strategy', message: 'Unsupported.', entityId: 'strategy' },
      { target: 'mihomo', code: 'PROXY_PARTIAL', severity: 'warning', feature: 'source', message: 'Partial.', entityId: 'proxy-not-a-node' },
    ]
    const grouped = groupProjectHealthDiagnostics(diagnostics, compatibility, new Set(['source', 'route', 'strategy']))

    expect(grouped.errors).toEqual([expect.objectContaining({ code: 'SOURCE_ERROR', locationNodeId: 'source' })])
    expect(grouped.warnings).toEqual([
      expect.objectContaining({ code: 'ROUTE_WARNING', locationNodeId: 'route' }),
      expect.objectContaining({ code: 'PROJECT_NOTE', severity: 'info' }),
    ])
    expect(grouped.compatibility).toEqual([
      expect.objectContaining({ code: 'TARGET_UNSUPPORTED', target: 'sing-box', locationNodeId: 'strategy' }),
      expect.not.objectContaining({ locationNodeId: expect.anything() }),
    ])
  })

  it('collapses remote-source cascade diagnostics under the actionable root cause', () => {
    const compatibility: CompatibilityIssue[] = [
      { target: 'mihomo', code: 'REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED', severity: 'error', feature: 'remote-source', message: 'Fallback is forbidden.', entityId: 'source' },
      { target: 'mihomo', code: 'REMOTE_SOURCE_PROCESSING_UNSUPPORTED', severity: 'error', feature: 'remote-source', message: 'Rename cannot be preserved.', entityId: 'source' },
      { target: 'mihomo', code: 'REMOTE_SOURCE_RUNTIME_DRIFT', severity: 'info', feature: 'remote-source', message: 'Runtime nodes can change.', entityId: 'source' },
    ]
    const grouped = groupProjectHealthDiagnostics([], compatibility, new Set(['source']))

    expect(grouped.compatibility).toHaveLength(2)
    expect(grouped.compatibility[0]).toEqual(expect.objectContaining({
      code: 'REMOTE_SOURCE_PROCESSING_UNSUPPORTED',
      related: [expect.objectContaining({ code: 'REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED' })],
    }))
    expect(grouped.compatibility[1]).toEqual(expect.objectContaining({ code: 'REMOTE_SOURCE_RUNTIME_DRIFT' }))
  })
})
