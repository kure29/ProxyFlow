import { describe, expect, it } from 'vitest'
import duplicates from '../../../fixtures/subscriptions/duplicates.txt?raw'
import plainLinks from '../../../fixtures/subscriptions/plain-links.txt?raw'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type TransformIR } from '../ir'
import { parseSubscription } from '../subscription'
import { createMaterializationContext, materializeProxySet } from './materialize'

function irWith(transforms: TransformIR[], content = plainLinks): ProxyFlowIR {
  const parsed = parseSubscription(content, { sourceId: 'source', sourceName: 'Source' })
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'pipeline', projectName: 'Pipeline', projectSchemaVersion: 2 },
    sources: [{ kind: 'subscription', id: 'source', name: 'Source', enabled: true, proxies: parsed.proxies, materialization: { status: 'ready' } }],
    transforms, strategies: [], services: [], routes: [], finalRoute: { target: { kind: 'direct' } },
    outputs: [{ id: 'output', name: 'Output', target: 'mihomo', enabled: true }],
  }
}

describe('ProxySet materialization', () => {
  it('filters by name, regex, region and protocol', () => {
    const transform: TransformIR = {
      kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'source' }, include: [], exclude: [],
      includeRegex: 'Demo$', includeProtocols: ['shadowsocks'],
    }
    const result = materializeProxySet(irWith([transform]), { kind: 'transform', id: 'filter' })
    expect(result.proxies.map((proxy) => proxy.protocol)).toEqual(['shadowsocks'])
  })

  it('applies the new keyword filter deterministically for include, exclude, case and empty input', () => {
    const content = [
      'http://demo:pass@hk.example.com:8080#HK%20IEPL',
      'http://demo:pass@sg.example.com:8080#Singapore%20Premium',
    ].join('\n')
    const filter: TransformIR = {
      kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'source' }, include: [], exclude: [],
      criterion: { mode: 'keyword', operation: 'include', keyword: ' hk ' },
    }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).proxies.map((proxy) => proxy.name)).toEqual(['HK IEPL'])
    filter.criterion = { mode: 'keyword', operation: 'exclude', keyword: 'PREMIUM' }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).proxies.map((proxy) => proxy.name)).toEqual(['HK IEPL'])
    filter.criterion = { mode: 'keyword', operation: 'include', keyword: '   ' }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).outputCount).toBe(2)
  })

  it('filters multiple inferred regions without changing stored region metadata', () => {
    const content = [
      'http://demo:pass@hk.example.com:8080#🇭🇰%20香港%2001',
      'http://demo:pass@sg.example.com:8080#SG%20IEPL',
      'http://demo:pass@unknown.example.com:8080#Unknown%20Premium',
    ].join('\n')
    const filter: TransformIR = {
      kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'source' }, include: [], exclude: [],
      criterion: { mode: 'region', operation: 'include', regions: ['HK', 'SG'] },
    }
    const included = materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' })
    expect([included.inputCount, included.outputCount, included.removedCount]).toEqual([3, 2, 1])
    expect(included.proxies.map((proxy) => proxy.metadata?.region?.code)).toEqual(['HK', 'SG'])
    filter.criterion = { mode: 'region', operation: 'exclude', regions: ['HK', 'SG'] }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).proxies.map((proxy) => proxy.metadata?.region?.code)).toEqual(['UNKNOWN'])
  })

  it('applies one or multiple selected regions to the materialized ProxySet', () => {
    const content = [
      'http://demo:pass@hk1.example.com:8080#HK%2001',
      'http://demo:pass@hk2.example.com:8080#HK%2002',
      'http://demo:pass@jp1.example.com:8080#JP%2001',
      'http://demo:pass@jp2.example.com:8080#JP%2002',
      'http://demo:pass@sg1.example.com:8080#SG%2001',
    ].join('\n')
    const filter: TransformIR = {
      kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'source' }, include: [], exclude: [],
      criterion: { mode: 'region', operation: 'include', regions: ['HK'] },
    }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).outputCount).toBe(2)
    filter.criterion = { mode: 'region', operation: 'include', regions: ['HK', 'JP'] }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).outputCount).toBe(4)
    filter.criterion = { mode: 'region', operation: 'exclude', regions: ['HK', 'JP'] }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).proxies.map((proxy) => proxy.metadata?.region?.code)).toEqual(['SG'])
  })

  it('supports include/exclude regex and fails closed for invalid patterns without keyword fallback', () => {
    const content = [
      'http://demo:pass@hk.example.com:8080#HK%20IEPL',
      'http://demo:pass@sg.example.com:8080#sg%20premium',
    ].join('\n')
    const filter: TransformIR = {
      kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'source' }, include: [], exclude: [],
      criterion: { mode: 'regex', operation: 'include', pattern: '^(HK|SG)', ignoreCase: true },
    }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).outputCount).toBe(2)
    filter.criterion = { mode: 'regex', operation: 'include', pattern: '^SG', ignoreCase: false }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).outputCount).toBe(0)
    filter.criterion = { mode: 'regex', operation: 'exclude', pattern: 'premium$', ignoreCase: true }
    expect(materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' }).proxies.map((proxy) => proxy.name)).toEqual(['HK IEPL'])
    filter.criterion = { mode: 'regex', operation: 'include', pattern: '[HK', ignoreCase: true }
    const invalid = materializeProxySet(irWith([filter], content), { kind: 'transform', id: 'filter' })
    expect(invalid).toEqual(expect.objectContaining({ status: 'error', proxies: [] }))
    expect(invalid.issues.map((issue) => issue.code)).toContain('FILTER_INVALID_REGEX')
  })

  it('supports simple and regex rename modes, captures, flags and non-matches', () => {
    const content = [
      'http://demo:pass@hk1.example.com:8080#HK-01',
      'http://demo:pass@hk2.example.com:8080#HK-02',
      'http://demo:pass@sg.example.com:8080#SG-IEPL',
    ].join('\n')
    const rename: TransformIR = {
      kind: 'rename', id: 'rename', name: 'Rename', input: { kind: 'source', id: 'source' },
      mode: 'simple', pattern: 'HK-', replacement: 'HongKong-', global: true,
    }
    expect(materializeProxySet(irWith([rename], content), { kind: 'transform', id: 'rename' }).proxies.map((proxy) => proxy.name)).toEqual([
      'HongKong-01', 'HongKong-02', 'SG-IEPL',
    ])
    rename.mode = 'regex'
    rename.pattern = '^(HK|SG)-(.+)$'
    rename.replacement = '$1 | $2'
    rename.ignoreCase = true
    expect(materializeProxySet(irWith([rename], content), { kind: 'transform', id: 'rename' }).proxies.map((proxy) => proxy.name)).toEqual([
      'HK | 01', 'HK | 02', 'SG | IEPL',
    ])
    rename.pattern = 'hk'
    rename.replacement = 'HongKong'
    rename.global = false
    expect(materializeProxySet(irWith([rename], content), { kind: 'transform', id: 'rename' }).proxies[0].name).toBe('HongKong-01')
  })

  it('fails closed with a stable issue for invalid rename regex', () => {
    const rename: TransformIR = { kind: 'rename', id: 'rename', name: 'Rename', input: { kind: 'source', id: 'source' }, mode: 'regex', pattern: '(', replacement: 'Node' }
    const result = materializeProxySet(irWith([rename]), { kind: 'transform', id: 'rename' })
    expect(result).toEqual(expect.objectContaining({ status: 'error', proxies: [] }))
    expect(result.issues[0]).toEqual(expect.objectContaining({ code: 'INVALID_RENAME_REGEX', entityId: 'rename' }))
  })

  it('deduplicates by endpoint identity, not display name', () => {
    const dedupe: TransformIR = { kind: 'deduplicate', id: 'dedupe', name: 'Dedupe', input: { kind: 'source', id: 'source' }, by: 'identity' }
    const result = materializeProxySet(irWith([dedupe], duplicates), { kind: 'transform', id: 'dedupe' })
    expect(result.inputCount).toBe(2)
    expect(result.outputCount).toBe(1)
  })

  it('sorts deterministically and refuses fake latency', () => {
    const sort: TransformIR = { kind: 'sort', id: 'sort', name: 'Sort', input: { kind: 'source', id: 'source' }, by: 'protocol', direction: 'descending' }
    const result = materializeProxySet(irWith([sort]), { kind: 'transform', id: 'sort' })
    expect(result.proxies.map((proxy) => proxy.protocol)).toEqual([...result.proxies.map((proxy) => proxy.protocol)].sort().reverse())
    sort.by = 'latency'
    expect(materializeProxySet(irWith([sort]), { kind: 'transform', id: 'sort' }).issues[0].code).toBe('SPEED_TEST_REQUIRED')
  })

  it('limits, merges without implicit dedupe, and chains transforms', () => {
    const parsed = parseSubscription(duplicates, { sourceId: 'source', sourceName: 'Source' })
    const ir = irWith([
      { kind: 'merge', id: 'merge', name: 'Merge', inputs: [{ kind: 'source', id: 'source' }, { kind: 'source', id: 'source' }] },
      { kind: 'deduplicate', id: 'dedupe', name: 'Dedupe', input: { kind: 'transform', id: 'merge' }, by: 'identity' },
      { kind: 'limit', id: 'limit', name: 'Limit', input: { kind: 'transform', id: 'dedupe' }, max: 1 },
    ], duplicates)
    ;(ir.sources[0] as Extract<ProxyFlowIR['sources'][number], { kind: 'subscription' }>).proxies = parsed.proxies
    expect(materializeProxySet(ir, { kind: 'transform', id: 'merge' }).outputCount).toBe(4)
    expect(materializeProxySet(ir, { kind: 'transform', id: 'limit' }).outputCount).toBe(1)
  })

  it.each([undefined, 0, -1, 1.5, Number.NaN])('fails closed for invalid Limit value %s', (max) => {
    const limit: TransformIR = { kind: 'limit', id: 'limit', name: 'Limit', input: { kind: 'source', id: 'source' }, max }
    const result = materializeProxySet(irWith([limit]), { kind: 'transform', id: 'limit' })
    expect(result).toEqual(expect.objectContaining({ status: 'error', proxies: [] }))
    expect(result.issues[0]).toEqual(expect.objectContaining({ code: 'LIMIT_INVALID', entityId: 'limit' }))
  })

  it('memoizes sources and transforms and propagates upstream errors', () => {
    const filter: TransformIR = { kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'source' }, include: [], exclude: [] }
    const ir = irWith([filter])
    const context = createMaterializationContext()
    for (let index = 0; index < 10; index += 1) materializeProxySet(ir, { kind: 'transform', id: 'filter' }, context)
    expect(context.evaluations.get('source:source')).toBe(1)
    expect(context.evaluations.get('transform:filter')).toBe(1)

    ;(ir.sources[0] as Extract<ProxyFlowIR['sources'][number], { kind: 'subscription' }>).proxies = undefined
    const failedContext = createMaterializationContext()
    const failed = materializeProxySet(ir, { kind: 'transform', id: 'filter' }, failedContext)
    expect(failed.status).toBe('error')
    expect(failed.issues.map((issue) => issue.code)).toContain('SOURCE_UNAVAILABLE')
  })

  it('keeps resolved partial variants in target-neutral proxy sets', () => {
    const content = [
      'http://demo:pass@ready.example.com:8080#Ready',
      'vless://88888888-8888-4888-8888-888888888888@reality.example.com:443?security=reality&flow=xtls-rprx-vision&pbk=fake&sid=abcd#Reality',
    ].join('\n')
    const parsed = parseSubscription(content, { sourceId: 'source', sourceName: 'Source' })
    expect(parsed.detectedCount).toBe(2)
    expect(parsed.partialCount).toBe(1)
    const result = materializeProxySet(irWith([], content), { kind: 'source', id: 'source' })
    expect(result.inputCount).toBe(2)
    expect(result.outputCount).toBe(2)
    expect(result.issues.map((issue) => issue.code)).not.toContain('PROXY_VARIANT_EXCLUDED')

    const manual = irWith([], content)
    manual.sources = [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies: parsed.proxies }]
    expect(materializeProxySet(manual, { kind: 'source', id: 'source' })).toEqual(expect.objectContaining({ inputCount: 2, outputCount: 2 }))
  })

  it('keeps warning-only endpoints in the usable ProxySet', () => {
    const content = 'trojan://demo-pass@warning.example.com:443?sni=warning.example.com&future-option=1#Warning%20Ready'
    const parsed = parseSubscription(content, { sourceId: 'source', sourceName: 'Source' })
    expect(parsed.nodes[0].status).toBe('ready')
    expect(parsed.issues.map((issue) => issue.code)).toContain('PROXY_PARAMS_UNRECOGNIZED')
    const result = materializeProxySet(irWith([], content), { kind: 'source', id: 'source' })
    expect([result.inputCount, result.outputCount, result.removedCount]).toEqual([1, 1, 0])
    expect(result.issues).toEqual([])
  })

  it('is deterministic across 100 pipeline executions', () => {
    const transforms: TransformIR[] = [
      { kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'source' }, include: ['Demo'], exclude: [] },
      { kind: 'sort', id: 'sort', name: 'Sort', input: { kind: 'transform', id: 'filter' }, by: 'name', direction: 'ascending' },
      { kind: 'rename', id: 'rename', name: 'Rename', input: { kind: 'transform', id: 'sort' }, pattern: 'Demo', replacement: 'Node' },
      { kind: 'limit', id: 'limit', name: 'Limit', input: { kind: 'transform', id: 'rename' }, max: 3 },
    ]
    const ir = irWith(transforms)
    const baseline = materializeProxySet(ir, { kind: 'transform', id: 'limit' }).proxies.map((proxy) => proxy.id)
    for (let index = 0; index < 100; index += 1) expect(materializeProxySet(ir, { kind: 'transform', id: 'limit' }).proxies.map((proxy) => proxy.id)).toEqual(baseline)
    expect(materializeProxySet(ir, { kind: 'transform', id: 'rename' }).proxies.every((proxy) => proxy.name.includes('Node'))).toBe(true)
  })
})
