import { describe, expect, it } from 'vitest'
import type { GraphNode } from '../../types/project'
import { resolveFinalTargetSummary, summarizeDnsNode } from './BlockNode'

describe('Visual Flow node summaries', () => {
  it('summarizes only enabled DNS resolvers from current node data', () => {
    expect(summarizeDnsNode({
      dnsResolvers: [
        { id: 'disabled', name: 'Disabled', kind: 'doh', role: 'default', address: 'https://disabled.example.com/dns-query', enabled: false },
        { id: 'google', name: 'Google', kind: 'doh', role: 'default', address: 'https://dns.google/dns-query', enabled: true },
        { id: 'quad9', name: 'Quad9', kind: 'dot', role: 'fallback', address: 'tls://dns.quad9.net', enabled: true },
      ],
      resolver: 'https://legacy.example.com/dns-query',
    })).toEqual({ protocol: 'DOH', detail: 'Google', additionalCount: 1 })
  })

  it('normalizes legacy DNS data and reports an unconfigured resolver list', () => {
    expect(summarizeDnsNode({ resolver: 'tls://dns.example.com' })).toEqual({
      protocol: 'DOT', detail: 'dns.example.com', additionalCount: 0,
    })
    expect(summarizeDnsNode({ dnsResolvers: [] })).toBeUndefined()
  })

  it('resolves final-route actions and the current strategy node title', () => {
    const strategy = {
      id: 'auto', type: 'block', position: { x: 0, y: 0 },
      data: { blockType: 'auto-select', category: 'strategy', title: 'US Auto', subtitle: '', icon: 'zap' },
    } satisfies GraphNode

    expect(resolveFinalTargetSummary({ targetKind: 'direct', targetId: 'output', targetLabel: 'Stale label' }, [strategy], 'en-US', 'Missing')).toBe('DIRECT')
    expect(resolveFinalTargetSummary({ targetKind: 'reject', targetId: 'output' }, [strategy], 'en-US', 'Missing')).toBe('REJECT')
    expect(resolveFinalTargetSummary({ targetKind: 'strategy', targetId: 'auto', targetLabel: 'Stale label' }, [strategy], 'en-US', 'Missing')).toBe('US Auto')
    expect(resolveFinalTargetSummary({ targetLabel: 'Fallback' }, [strategy], 'en-US', 'Missing')).toBe('Fallback')
    expect(resolveFinalTargetSummary({}, [strategy], 'en-US', 'Missing')).toBe('Missing')
  })
})
