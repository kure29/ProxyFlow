import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../ir'
import { detectChainCycles } from './detectChainCycles'
import { validateIR } from './validateIR'

const baseIR = (): ProxyFlowIR => ({
  version: PROXYFLOW_IR_VERSION,
  metadata: { projectId: 'test', projectName: 'Test', projectSchemaVersion: 1 },
  sources: [],
  transforms: [],
  strategies: [],
  routes: [],
  finalRoute: { target: { kind: 'direct' } },
  outputs: [{ id: 'output', name: 'Output', target: 'mihomo', enabled: true }],
})

describe('validateIR', () => {
  it('validates references without graph or UI dependencies', () => {
    const ir = baseIR()
    ir.transforms.push({ kind: 'filter', id: 'filter', name: 'Filter', input: { kind: 'source', id: 'missing' }, include: [], exclude: [] })
    expect(validateIR(ir).map((issue) => issue.code)).toEqual(expect.arrayContaining(['PROXY_SET_REFERENCE_NOT_FOUND', 'FILTER_EMPTY']))
  })

  it('detects multi-chain cycles with a stable path', () => {
    const strategies: ProxyFlowIR['strategies'] = [
      { kind: 'chain', id: 'a', name: 'A', hops: [{ kind: 'strategy', id: 'b' }] },
      { kind: 'chain', id: 'b', name: 'B', hops: [{ kind: 'strategy', id: 'c' }] },
      { kind: 'chain', id: 'c', name: 'C', hops: [{ kind: 'strategy', id: 'a' }] },
    ]
    expect(detectChainCycles(strategies)).toEqual([['a', 'b', 'c', 'a']])
    const ir = baseIR()
    ir.strategies = strategies
    expect(validateIR(ir).some((issue) => issue.code === 'CHAIN_CYCLE')).toBe(true)
  })

  it('requires final route and output semantics', () => {
    const ir = baseIR()
    ir.finalRoute = undefined
    ir.outputs = []
    expect(validateIR(ir).map((issue) => issue.code)).toEqual(expect.arrayContaining(['FINAL_MISSING', 'OUTPUT_MISSING']))
  })
})
