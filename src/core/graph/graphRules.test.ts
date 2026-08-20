import { describe, expect, it } from 'vitest'
import { demoNodes } from '../../data/demoProject'
import { isConnectionAllowed, semanticForConnection } from './graphRules'

describe('graph connection rules', () => {
  it('accepts source to processing connections', () => {
    expect(isConnectionAllowed({ source: 'hkt-subscription', target: 'hk-filter', sourceHandle: null, targetHandle: null }, demoNodes)).toBe(true)
  })

  it('rejects output to source connections', () => {
    expect(isConnectionAllowed({ source: 'output', target: 'hkt-subscription', sourceHandle: null, targetHandle: null }, demoNodes)).toBe(false)
  })

  it('preserves DNS semantics when connecting DNS to Output', () => {
    expect(semanticForConnection({ source: 'dns', target: 'output', sourceHandle: null, targetHandle: null }, demoNodes)).toBe('dns')
  })
})
