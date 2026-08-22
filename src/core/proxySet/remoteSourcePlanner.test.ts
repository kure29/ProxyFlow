import { describe, expect, it } from 'vitest'
import { getTargetCapabilities } from '../capabilities'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../ir'
import { analyzeProxySetLineage, planRemoteProxySource, planRemoteSourceUsage } from './index'

function fixture(exportMode: 'auto' | 'remote' | 'materialized' = 'auto', requestProfile: 'auto' | 'mihomo' | 'sing-box' | 'generic' = 'auto'): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'remote-planner', projectName: 'Remote Planner', projectSchemaVersion: 2 },
    sources: [{
      kind: 'subscription', id: 'source-a', name: 'Source A', url: 'https://example.com/subscription', enabled: true,
      proxies: [{ kind: 'socks', protocol: 'socks5', version: '5', id: 'proxy-a', name: 'Proxy A', server: 'proxy.example.com', port: 1080 }],
      remote: {
        kind: 'remote-subscription', id: 'source-a', name: 'Source A', url: 'https://example.com/subscription', requestProfile, exportMode,
        snapshot: { id: 'snapshot-a', contentHash: 'fictional-hash', fetchedAt: '2026-08-22T00:00:00.000Z' },
      },
    }],
    transforms: [{ kind: 'rename', id: 'rename-a', name: 'Rename', input: { kind: 'source', id: 'source-a' }, pattern: 'A', replacement: 'B' }],
    strategies: [], services: [], routes: [], finalRoute: { target: { kind: 'direct' } }, outputs: [{ id: 'output', name: 'Output', target: 'mihomo', enabled: true }],
  }
}

describe('remote source lowering planner', () => {
  it('keeps direct lineage machine-readable and plans a Mihomo-native source', () => {
    const ir = fixture()
    const ref = { kind: 'source' as const, id: 'source-a' }
    expect(analyzeProxySetLineage(ir, ref)).toEqual(expect.objectContaining({
      sourceIds: ['source-a'], operations: [], mixed: false,
      remoteSources: [expect.objectContaining({ id: 'source-a' })],
    }))
    const plan = planRemoteProxySource(ir, ref, getTargetCapabilities('mihomo').remoteProxySource, 'select')
    expect(plan.decision).toBe('native-remote')
    expect(plan.diagnostics.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'REMOTE_SOURCE_NATIVE', 'REMOTE_SOURCE_RUNTIME_DRIFT', 'REMOTE_SOURCE_URL_EMBEDDED', 'REMOTE_REQUEST_FALLBACK_NOT_PORTABLE',
    ]))
  })

  it('always materializes an explicit materialized mode', () => {
    const ir = fixture('materialized')
    const plan = planRemoteProxySource(ir, { kind: 'source', id: 'source-a' }, getTargetCapabilities('mihomo').remoteProxySource, 'select')
    expect(plan).toEqual(expect.objectContaining({ decision: 'materialized' }))
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: 'REMOTE_SOURCE_MATERIALIZED' }))
  })

  it('does not claim native preservation without a parsed snapshot', () => {
    const ir = fixture()
    delete (ir.sources[0] as Extract<ProxyFlowIR['sources'][number], { kind: 'subscription' }>).remote!.snapshot
    const plan = planRemoteProxySource(ir, { kind: 'source', id: 'source-a' }, getTargetCapabilities('mihomo').remoteProxySource, 'select')
    expect(plan).toEqual(expect.objectContaining({ decision: 'materialized' }))
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: 'REMOTE_SOURCE_SNAPSHOT_UNAVAILABLE' }))
  })

  it('materializes processed auto paths and rejects processed forced-remote paths', () => {
    const auto = fixture('auto')
    const autoPlan = planRemoteProxySource(auto, { kind: 'transform', id: 'rename-a' }, getTargetCapabilities('mihomo').remoteProxySource, 'select')
    expect(autoPlan).toEqual(expect.objectContaining({ decision: 'materialized' }))
    expect(autoPlan.lineage.operations).toEqual([{ id: 'rename-a', kind: 'rename' }])
    expect(autoPlan.diagnostics).toContainEqual(expect.objectContaining({ code: 'REMOTE_SOURCE_PROCESSING_UNSUPPORTED', severity: 'info' }))

    const forced = fixture('remote')
    const forcedPlan = planRemoteProxySource(forced, { kind: 'transform', id: 'rename-a' }, getTargetCapabilities('mihomo').remoteProxySource, 'select')
    expect(forcedPlan).toEqual(expect.objectContaining({ decision: 'unsupported' }))
    expect(forcedPlan.diagnostics.map((issue) => issue.code)).toEqual([
      'REMOTE_SOURCE_PROCESSING_UNSUPPORTED', 'REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED',
    ])
  })

  it('uses capabilities rather than target conditionals', () => {
    const auto = fixture('auto')
    const autoPlan = planRemoteProxySource(auto, { kind: 'source', id: 'source-a' }, getTargetCapabilities('sing-box').remoteProxySource, 'select')
    expect(autoPlan).toEqual(expect.objectContaining({ decision: 'materialized' }))
    expect(autoPlan.diagnostics).toContainEqual(expect.objectContaining({ code: 'REMOTE_SOURCE_TARGET_UNSUPPORTED', severity: 'info' }))

    const forced = fixture('remote')
    const forcedPlan = planRemoteProxySource(forced, { kind: 'source', id: 'source-a' }, getTargetCapabilities('sing-box').remoteProxySource, 'select')
    expect(forcedPlan).toEqual(expect.objectContaining({ decision: 'unsupported' }))
  })

  it.each(['sing-box', 'generic'] as const)('materializes unsupported Mihomo request profile %s', (requestProfile) => {
    const ir = fixture('auto', requestProfile)
    const plan = planRemoteProxySource(ir, { kind: 'source', id: 'source-a' }, getTargetCapabilities('mihomo').remoteProxySource, 'select')
    expect(plan).toEqual(expect.objectContaining({ decision: 'materialized' }))
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: 'REMOTE_SOURCE_REQUEST_PROFILE_UNSUPPORTED' }))
  })

  it('materializes mixed source lineages without changing either source', () => {
    const ir = fixture()
    ir.sources.push({
      kind: 'manual-proxy', id: 'manual', name: 'Manual',
      proxies: [{ kind: 'http', protocol: 'http', id: 'manual-proxy', name: 'Manual Proxy', server: 'manual.example.com', port: 8080 }],
    })
    ir.transforms.push({ kind: 'merge', id: 'merge', name: 'Merge', inputs: [{ kind: 'source', id: 'source-a' }, { kind: 'source', id: 'manual' }] })
    const before = structuredClone(ir.sources)
    const plan = planRemoteProxySource(ir, { kind: 'transform', id: 'merge' }, getTargetCapabilities('mihomo').remoteProxySource, 'select')
    expect(plan).toEqual(expect.objectContaining({ decision: 'materialized' }))
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: 'REMOTE_SOURCE_MIXED_INPUTS' }))
    expect(ir.sources).toEqual(before)
  })

  it('reports direct and processed consumer paths independently for inspector feedback', () => {
    const ir = fixture()
    ir.strategies = [
      { kind: 'select', id: 'direct', name: 'Direct Path', candidates: [{ kind: 'source', id: 'source-a' }] },
      { kind: 'auto-select', id: 'processed', name: 'Processed Path', source: { kind: 'transform', id: 'rename-a' } },
    ]
    const usages = planRemoteSourceUsage(ir, 'source-a', getTargetCapabilities('mihomo').remoteProxySource)
    expect(usages.map(({ consumerName, plan }) => [consumerName, plan.decision])).toEqual([
      ['Direct Path', 'native-remote'],
      ['Processed Path', 'materialized'],
    ])
  })
})
