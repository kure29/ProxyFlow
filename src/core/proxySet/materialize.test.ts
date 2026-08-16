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

  it('renames with regex and reports invalid expressions', () => {
    const rename: TransformIR = { kind: 'rename', id: 'rename', name: 'Rename', input: { kind: 'source', id: 'source' }, pattern: 'Demo', replacement: 'Node' }
    expect(materializeProxySet(irWith([rename]), { kind: 'transform', id: 'rename' }).proxies.map((proxy) => proxy.name)).toContain('HTTP Node')
    rename.pattern = '('
    expect(materializeProxySet(irWith([rename]), { kind: 'transform', id: 'rename' }).issues[0].code).toBe('INVALID_RENAME_REGEX')
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

  it('keeps partial variants visible to the parser but excludes them from usable proxy sets with a warning', () => {
    const content = [
      'http://demo:pass@ready.example.com:8080#Ready',
      'vless://88888888-8888-4888-8888-888888888888@reality.example.com:443?security=reality&flow=xtls-rprx-vision&pbk=fake&sid=abcd#Reality',
    ].join('\n')
    const parsed = parseSubscription(content, { sourceId: 'source', sourceName: 'Source' })
    expect(parsed.detectedCount).toBe(2)
    expect(parsed.partialCount).toBe(1)
    const result = materializeProxySet(irWith([], content), { kind: 'source', id: 'source' })
    expect(result.inputCount).toBe(2)
    expect(result.outputCount).toBe(1)
    expect(result.issues.map((issue) => issue.code)).toContain('PROXY_VARIANT_EXCLUDED')

    const manual = irWith([], content)
    manual.sources = [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies: parsed.proxies }]
    expect(materializeProxySet(manual, { kind: 'source', id: 'source' })).toEqual(expect.objectContaining({ inputCount: 2, outputCount: 1 }))
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
      { kind: 'limit', id: 'limit', name: 'Limit', input: { kind: 'transform', id: 'sort' }, max: 3 },
    ]
    const ir = irWith(transforms)
    const baseline = materializeProxySet(ir, { kind: 'transform', id: 'limit' }).proxies.map((proxy) => proxy.id)
    for (let index = 0; index < 100; index += 1) expect(materializeProxySet(ir, { kind: 'transform', id: 'limit' }).proxies.map((proxy) => proxy.id)).toEqual(baseline)
  })
})
