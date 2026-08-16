import { describe, expect, it } from 'vitest'
import { diagnosticNodeId, groupDiagnostics } from './diagnostics'

describe('structured diagnostics', () => {
  it('locates only diagnostics with a real graph entity, independent of message locale', () => {
    const nodes = new Set(['source', 'transform'])
    expect(diagnosticNodeId({ code: 'SOURCE', severity: 'error', message: 'Source failed', entityId: 'source' }, nodes)).toBe('source')
    expect(diagnosticNodeId({ code: 'SOURCE', severity: 'error', message: '数据源失败', entityId: 'source' }, nodes)).toBe('source')
    expect(diagnosticNodeId({ code: 'GLOBAL', severity: 'error', message: 'Global failure' }, nodes)).toBeUndefined()
    expect(diagnosticNodeId({ code: 'STALE', severity: 'error', message: 'Stale', entityId: 'missing' }, nodes)).toBeUndefined()
  })

  it('groups exact semantic duplicates without hiding different entities', () => {
    const issues = [
      { code: 'SOURCE', severity: 'error' as const, message: 'Unavailable', entityId: 'source-a' },
      { code: 'SOURCE', severity: 'error' as const, message: 'Unavailable', entityId: 'source-a' },
      { code: 'SOURCE', severity: 'error' as const, message: 'Unavailable', entityId: 'source-b' },
    ]
    expect(groupDiagnostics(issues)).toEqual([
      { issue: issues[0], count: 2 },
      { issue: issues[2], count: 1 },
    ])
  })
})
