import { describe, expect, it } from 'vitest'
import type { ProxyFlowIR, ResolvedProxyEndpointIR } from '../../core/ir'
import { PROXYFLOW_IR_VERSION } from '../../core/ir'
import { parseSubscription } from '../../core/subscription'
import anytlsProjectionFixture from '../../../fixtures/subscriptions/anytls-surge-projection-13.yaml?raw'
import {
  aggregateSurgeSkipReasons,
  createSurgeProjectionContext,
  createSurgeTargetProjectionSummary,
  projectSurgeProxySet,
} from './projection'
import { compileSurge } from './compiler'

const parsed = parseSubscription(anytlsProjectionFixture, {
  sourceId: 'anytls-projection',
  sourceName: 'AnyTLS projection fixture',
})

function fixtureIR(proxies: ResolvedProxyEndpointIR[] = parsed.proxies): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'surge-projection', projectName: 'Surge projection', projectSchemaVersion: 2 },
    sources: [{ kind: 'subscription', id: 'anytls-projection', name: 'AnyTLS projection fixture', enabled: true, proxies }],
    transforms: [],
    strategies: [{ kind: 'auto-select', id: 'auto', name: 'Hong Kong Auto', source: { kind: 'source', id: 'anytls-projection' } }],
    services: [],
    routes: [],
    finalRoute: { target: { kind: 'strategy', id: 'auto' } },
    outputs: [{ id: 'surge-output', name: 'Surge', target: 'surge', enabled: true }],
  }
}

describe('Surge projection skip reasons', () => {
  it('preserves every distinct blocking reason for one AnyTLS endpoint', () => {
    expect(parsed.detectedCount).toBe(13)
    expect(parsed.readyCount).toBe(13)
    expect(parsed.partialCount).toBe(0)
    expect(parsed.unsupportedCount).toBe(0)

    const projection = projectSurgeProxySet(
      fixtureIR(),
      { kind: 'source', id: 'anytls-projection' },
      createSurgeProjectionContext(),
    )

    expect(projection.proxies).toHaveLength(0)
    expect(projection.skipped).toHaveLength(13)
    expect(projection.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SURGE_TLS_CLIENT_FINGERPRINT_UNSUPPORTED', endpointCount: 13 }),
      expect.objectContaining({ code: 'SURGE_ANYTLS_SESSION_PARAMETERS_UNSUPPORTED', endpointCount: 13 }),
    ]))
    expect(projection.reasons).toHaveLength(2)
  })

  it('counts a repeated code on one endpoint only once', () => {
    const endpoint = parsed.proxies[0]
    const issue = {
      target: 'surge' as const,
      code: 'SURGE_ANYTLS_SESSION_PARAMETERS_UNSUPPORTED',
      severity: 'error' as const,
      feature: 'proxy',
      message: 'AnyTLS session parameters are unsupported.',
      entityId: 'auto',
    }
    const reasons = aggregateSurgeSkipReasons([{
      endpoint,
      issues: [issue, issue],
    }])

    expect(reasons).toEqual([
      expect.objectContaining({ code: issue.code, endpointCount: 1 }),
    ])
  })

  it('keeps the all-incompatible strategy as one fail-closed blocker', () => {
    const result = compileSurge(fixtureIR(), { now: () => new Date('2026-08-26T00:00:00.000Z') })

    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.stats).toEqual(expect.objectContaining({
      candidateCount: 13,
      compatibleEndpointCount: 0,
      skippedEndpointCount: 13,
      blockingIssueCount: 1,
    }))
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(1)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'SURGE_STRATEGY_NO_COMPATIBLE_MEMBERS',
      severity: 'error',
    }))
    expect(result.targetProjection).toEqual(expect.objectContaining({
      target: 'surge', candidateCount: 13, compatibleCount: 0, skippedCount: 13,
      blockingCount: 1, status: 'blocked',
      reasons: expect.arrayContaining([
        expect.objectContaining({ code: 'SURGE_TLS_CLIENT_FINGERPRINT_UNSUPPORTED', endpointCount: 13 }),
        expect.objectContaining({ code: 'SURGE_ANYTLS_SESSION_PARAMETERS_UNSUPPORTED', endpointCount: 13 }),
      ]),
      strategies: [expect.objectContaining({
        strategyId: 'auto', candidateCount: 13, compatibleCount: 0, skippedCount: 13,
        blockingCount: 1, status: 'blocked',
      })],
    }))
  })

  it.each([
    ['blocked', 0],
    ['partial', 8],
    ['ready', 13],
  ] as const)('derives the %s status from target projection counts', (status, compatibleCount) => {
    const compatible = parsed.proxies.map((endpoint) => endpoint.protocol === 'anytls'
      ? {
        ...endpoint,
        tls: { ...endpoint.tls, fingerprint: undefined },
        idleSessionCheckIntervalSeconds: undefined,
        idleSessionTimeoutSeconds: undefined,
        minIdleSession: undefined,
      }
      : endpoint)
    const proxies = [...compatible.slice(0, compatibleCount), ...parsed.proxies.slice(compatibleCount)]
    const ir = fixtureIR(proxies)
    const context = createSurgeProjectionContext()
    projectSurgeProxySet(ir, { kind: 'source', id: 'anytls-projection' }, context)
    const summary = createSurgeTargetProjectionSummary(ir, context)
    expect(summary.strategies[0]).toEqual(expect.objectContaining({
      candidateCount: 13, compatibleCount, skippedCount: 13 - compatibleCount, status,
    }))
  })
})
