import { describe, expect, it } from 'vitest'
import type { ResolvedProxyEndpointIR, TransformIR } from '../ir'
import { explainProcessing } from './processingExplanation'

const proxy = (id: string, name = id): ResolvedProxyEndpointIR => ({
  id, name, kind: 'http', protocol: 'http', server: '192.0.2.10', port: 443,
})

describe('processing explanation', () => {
  it('identifies filter mode and removal count', () => {
    const transform: TransformIR = { kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'source' }, criterion: { mode: 'region', operation: 'include', regions: ['US'] }, include: [], exclude: [] }
    expect(explainProcessing(transform, [proxy('a'), proxy('b')], [proxy('a')])).toEqual({ kind: 'filter', mode: 'criterion', inputCount: 2, outputCount: 1, removedCount: 1 })
  })

  it('counts renamed and reordered endpoints without changing semantic data', () => {
    const rename: TransformIR = { kind: 'rename', id: 'rename', name: 'Rename', input: { kind: 'source', id: 'source' }, mode: 'simple', pattern: 'A', replacement: 'B' }
    expect(explainProcessing(rename, [proxy('a', 'A')], [proxy('a-renamed', 'B')])).toEqual({ kind: 'rename', mode: 'simple', changedCount: 1 })
    const sort: TransformIR = { kind: 'sort', id: 'sort', name: 'Sort', input: { kind: 'source', id: 'source' }, by: 'region', direction: 'descending' }
    expect(explainProcessing(sort, [proxy('a'), proxy('b')], [proxy('b'), proxy('a')])).toEqual({ kind: 'sort', by: 'region', direction: 'descending', reorderedCount: 2 })
  })

  it('explains merge and limit boundaries', () => {
    const merge: TransformIR = { kind: 'merge', id: 'merge', name: 'Merge', inputs: [{ kind: 'source', id: 'a' }, { kind: 'source', id: 'b' }] }
    expect(explainProcessing(merge, [proxy('a'), proxy('b')], [proxy('a'), proxy('b')])).toEqual({ kind: 'merge', sourceCount: 2, outputCount: 2 })
    const limit: TransformIR = { kind: 'limit', id: 'limit', name: 'Limit', input: { kind: 'source', id: 'source' }, max: 1 }
    expect(explainProcessing(limit, [proxy('a'), proxy('b')], [proxy('a')])).toEqual({ kind: 'limit', max: 1, inputCount: 2, outputCount: 1, removedCount: 1 })
  })
})
