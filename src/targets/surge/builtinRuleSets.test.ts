import { describe, expect, it } from 'vitest'
import { compileGraph } from '../../core/graphCompiler'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type ResolvedProxyEndpointIR } from '../../core/ir'
import type { TargetNativeRuleSetSourceIR } from '../../core/targetNative'
import { compileMihomo } from '../mihomo/compiler'
import { compileSurge } from './compiler'

const fixedNow = () => new Date('2026-08-27T00:00:00.000Z')

function baseIR(routes: ProxyFlowIR['routes'] = []): ProxyFlowIR {
  const proxy: ResolvedProxyEndpointIR = {
    kind: 'http', protocol: 'http', id: 'proxy-a', name: 'Proxy Endpoint', server: 'proxy.example.com', port: 8080,
  }
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'surge-builtins', projectName: 'Surge Built-ins', projectSchemaVersion: 2 },
    sources: [{ kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [proxy] }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'strategy', name: 'Proxy', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [{
      id: 'surge-builtins', name: 'Surge built-ins', ruleSources: [
        { id: 'surge-lan', provider: 'builtin' },
        { id: 'surge-system', provider: 'builtin' },
      ],
    }],
    routes,
    finalRoute: { target: { kind: 'strategy', id: 'strategy' } },
    outputs: [{ id: 'output', name: 'Surge', target: 'surge', enabled: true }],
  }
}

const builtinSources: TargetNativeRuleSetSourceIR[] = [
  { sourceId: 'surge-lan', target: 'surge', kind: 'builtin-rule-set', name: 'LAN' },
  { sourceId: 'surge-system', target: 'surge', kind: 'builtin-rule-set', name: 'SYSTEM' },
]

function compileBuiltins(ir: ProxyFlowIR) {
  return compileSurge(ir, { now: fixedNow, nativeRuleSetSources: builtinSources })
}

function route(id: string, matcher: ProxyFlowIR['routes'][number]['matcher'], target: ProxyFlowIR['routes'][number]['target'], priority: number) {
  return { id, name: id, matcher, target, priority }
}

function ruleLines(content: string) {
  const lines = content.split(/\r?\n/)
  const start = lines.indexOf('[Rule]')
  const end = lines.findIndex((line, index) => index > start && /^\[/.test(line))
  return lines.slice(start + 1, end < 0 ? lines.length : end).filter(Boolean)
}

describe('Surge built-in Rule Set lowering', () => {
  it.each([
    ['LAN', 'surge-lan', 'RULE-SET,LAN,DIRECT'],
    ['SYSTEM', 'surge-system', 'RULE-SET,SYSTEM,DIRECT'],
  ] as const)('lowers typed %s provenance with DIRECT', (_name, sourceId, expected) => {
    const result = compileBuiltins(baseIR([route('rule', { kind: 'rule-set', id: sourceId }, { kind: 'direct' }, 10)]))
    expect(result.success, result.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(ruleLines(result.content)).toEqual([expected, 'FINAL,Proxy'])
  })

  it.each([
    ['LAN', 'surge-lan', 'reject', 'RULE-SET,LAN,REJECT'],
    ['LAN', 'surge-lan', 'strategy', 'RULE-SET,LAN,Proxy'],
    ['SYSTEM', 'surge-system', 'reject', 'RULE-SET,SYSTEM,REJECT'],
    ['SYSTEM', 'surge-system', 'strategy', 'RULE-SET,SYSTEM,Proxy'],
  ] as const)('lowers %s with the %s policy target', (_name, sourceId, targetKind, expected) => {
    const target = targetKind === 'reject' ? { kind: 'reject' as const } : { kind: 'strategy' as const, id: 'strategy' }
    const result = compileBuiltins(baseIR([route('rule', { kind: 'rule-set', id: sourceId }, target, 10)]))
    expect(result.success, result.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(ruleLines(result.content)).toEqual([expected, 'FINAL,Proxy'])
  })

  it('lowers LAN and SYSTEM with REJECT and compiled strategy policies', () => {
    const result = compileBuiltins(baseIR([
      route('lan-reject', { kind: 'rule-set', id: 'surge-lan' }, { kind: 'reject' }, 10),
      route('system-proxy', { kind: 'rule-set', id: 'surge-system' }, { kind: 'strategy', id: 'strategy' }, 20),
    ]))
    expect(result.success).toBe(true)
    expect(ruleLines(result.content)).toEqual([
      'RULE-SET,LAN,REJECT',
      'RULE-SET,SYSTEM,Proxy',
      'FINAL,Proxy',
    ])
  })

  it('preserves the shared priority ordering and stable insertion ties', () => {
    const result = compileBuiltins(baseIR([
      route('domain', { kind: 'domain', value: 'example.com' }, { kind: 'direct' }, 10),
      route('lan', { kind: 'rule-set', id: 'surge-lan' }, { kind: 'direct' }, 20),
      route('port', { kind: 'port', port: 443 }, { kind: 'reject' }, 30),
      route('system', { kind: 'rule-set', id: 'surge-system' }, { kind: 'direct' }, 40),
      route('asn', { kind: 'asn', value: 64500 }, { kind: 'strategy', id: 'strategy' }, 50),
      route('tie-a', { kind: 'domain', value: 'a.example' }, { kind: 'direct' }, 60),
      route('tie-b', { kind: 'domain', value: 'b.example' }, { kind: 'direct' }, 60),
    ]))
    expect(result.success).toBe(true)
    expect(ruleLines(result.content)).toEqual([
      'DOMAIN,example.com,DIRECT',
      'RULE-SET,LAN,DIRECT',
      'DEST-PORT,443,REJECT',
      'RULE-SET,SYSTEM,DIRECT',
      'IP-ASN,64500,Proxy',
      'DOMAIN,a.example,DIRECT',
      'DOMAIN,b.example,DIRECT',
      'FINAL,Proxy',
    ])
  })

  it('constructs typed provenance through the graph compiler without a new matcher kind', () => {
    const project = {
      version: 1,
      id: 'graph-builtins',
      name: 'Graph built-ins',
      primaryTarget: 'surge' as const,
      graph: {
        nodes: [
          { id: 'route', type: 'block' as const, position: { x: 0, y: 0 }, data: {
            blockType: 'custom-rule' as const, category: 'routing' as const, title: 'LAN', subtitle: '', icon: 'rule',
            routeMatcherKind: 'rule-set' as const, routeMatcherValue: 'surge-lan', targetKind: 'direct' as const, targetLabel: 'DIRECT', routePriority: 10,
            targetNativeRuleSet: { target: 'surge' as const, kind: 'builtin-rule-set' as const, name: 'LAN' as const },
          } },
          { id: 'final', type: 'block' as const, position: { x: 0, y: 0 }, data: {
            blockType: 'final' as const, category: 'routing' as const, title: 'Final', subtitle: '', icon: 'flag', targetKind: 'direct' as const,
          } },
          { id: 'output', type: 'block' as const, position: { x: 0, y: 0 }, data: {
            blockType: 'output' as const, category: 'output' as const, title: 'Surge', subtitle: '', icon: 'export', client: 'surge' as const,
          } },
        ],
        edges: [],
      },
      services: [], outputs: [], updatedAt: '2026-08-27T00:00:00.000Z',
    }
    const result = compileGraph(project)
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\\n')).toBe(true)
    expect(result.ir?.routes[0].matcher).toEqual({ kind: 'rule-set', id: 'surge-lan' })
    expect(result.ir?.services.flatMap((service) => service.ruleSources).find((source) => source.id === 'surge-lan')).toEqual({
      id: 'surge-lan', provider: 'builtin',
    })
    expect(result.nativeRuleSetSources).toEqual([{ sourceId: 'surge-lan', target: 'surge', kind: 'builtin-rule-set', name: 'LAN' }])
    const compiled = compileSurge(result.ir!, { now: fixedNow, nativeRuleSetSources: result.nativeRuleSetSources })
    expect(compiled.success, compiled.issues.map((issue) => issue.code).join(',')).toBe(true)
    expect(ruleLines(compiled.content)).toEqual(['RULE-SET,LAN,DIRECT', 'FINAL,DIRECT'])
  })

  it('does not treat a colliding custom Rule Set named LAN or SYSTEM as built-in', () => {
    for (const id of ['LAN', 'SYSTEM']) {
      const ir = baseIR([route('collision', { kind: 'rule-set', id }, { kind: 'direct' }, 10)])
      ir.services = [{ id: 'custom', name: 'Custom', ruleSources: [{
        id, provider: 'custom', format: 'text', behavior: 'classical', inlineMatchers: [{ kind: 'domain', value: 'example.com' }],
      }] }]
      const result = compileSurge(ir, { now: fixedNow })
      expect(result.success).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_RULE_SET_SOURCE_UNSUPPORTED', severity: 'error' }))
    }
  })

  it('does not treat a custom Rule Set named LAN or SYSTEM as built-in', () => {
    for (const name of ['LAN', 'SYSTEM'] as const) {
      const project = {
        version: 1,
        id: `custom-${name.toLowerCase()}`,
        name: `Custom ${name}`,
        primaryTarget: 'surge' as const,
        graph: {
          nodes: [
            { id: 'route', type: 'block' as const, position: { x: 0, y: 0 }, data: {
              blockType: 'custom-rule' as const, category: 'routing' as const, title: `${name} custom`, subtitle: '', icon: 'rule',
              routeMatcherKind: 'rule-set' as const, routeMatcherValue: `custom-${name.toLowerCase()}`, targetKind: 'direct' as const, targetLabel: 'DIRECT', routePriority: 10,
              customRuleSource: {
                id: `custom-${name.toLowerCase()}`, name, inputKind: 'file' as const, format: 'surge-list' as const,
                fileName: `${name.toLowerCase()}.list`, enabled: true,
                matchers: [{ kind: 'domain' as const, value: 'example.com' }],
              },
            } },
            { id: 'final', type: 'block' as const, position: { x: 0, y: 0 }, data: {
              blockType: 'final' as const, category: 'routing' as const, title: 'Final', subtitle: '', icon: 'flag', targetKind: 'direct' as const,
            } },
            { id: 'output', type: 'block' as const, position: { x: 0, y: 0 }, data: {
              blockType: 'output' as const, category: 'output' as const, title: 'Surge', subtitle: '', icon: 'export', client: 'surge' as const,
            } },
          ],
          edges: [],
        },
        services: [], outputs: [], updatedAt: '2026-08-27T00:00:00.000Z',
      }
      const graph = compileGraph(project)
      expect(graph.success, graph.issues.map((issue) => issue.message).join('\n')).toBe(true)
      const result = compileSurge(graph.ir!, { now: fixedNow, nativeRuleSetSources: graph.nativeRuleSetSources })
      expect(result.success).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_RULE_SET_SOURCE_UNSUPPORTED', severity: 'error' }))
    }
  })

  it('keeps generic, missing, and ambiguous Rule Set references fail-closed', () => {
    const generic = baseIR([route('generic', { kind: 'rule-set', id: 'generic' }, { kind: 'direct' }, 10)])
    generic.services = [{ id: 'generic', name: 'Generic', ruleSources: [{ id: 'generic', provider: 'remote', format: 'text', url: 'https://example.invalid/rules.list' }] }]
    expect(compileSurge(generic, { now: fixedNow }).success).toBe(false)

    const untypedBuiltin = baseIR([route('builtin', { kind: 'rule-set', id: 'builtin' }, { kind: 'direct' }, 10)])
    untypedBuiltin.services = [{ id: 'builtin', name: 'Builtin', ruleSources: [{ id: 'builtin', provider: 'builtin' }] }]
    expect(compileSurge(untypedBuiltin, { now: fixedNow }).success).toBe(false)

    const missing = baseIR([route('missing', { kind: 'rule-set', id: 'missing' }, { kind: 'direct' }, 10)])
    expect(compileSurge(missing, { now: fixedNow }).issues).toContainEqual(expect.objectContaining({ code: 'IR_ROUTE_RULE_SET_NOT_FOUND' }))

    const ambiguous = baseIR([route('ambiguous', { kind: 'rule-set', id: 'duplicate' }, { kind: 'direct' }, 10)])
    ambiguous.services = [
      { id: 'a', name: 'A', ruleSources: [{ id: 'duplicate', provider: 'builtin' }] },
      { id: 'b', name: 'B', ruleSources: [{ id: 'duplicate', provider: 'builtin' }] },
    ]
    expect(compileSurge(ambiguous, { now: fixedNow }).issues).toContainEqual(expect.objectContaining({ code: 'IR_ROUTE_RULE_SET_AMBIGUOUS' }))
  })

  it('rejects malformed or mismatched native source provenance at runtime', () => {
    const compileWith = (nativeRuleSetSources: TargetNativeRuleSetSourceIR[]) => compileSurge(
      baseIR([route('lan', { kind: 'rule-set', id: 'surge-lan' }, { kind: 'direct' }, 10)]),
      { now: fixedNow, nativeRuleSetSources },
    )

    expect(compileWith([{ sourceId: 'other', target: 'surge', kind: 'builtin-rule-set', name: 'LAN' }])).toMatchObject({ success: false })
    const duplicate = compileWith([
      builtinSources[0],
      { ...builtinSources[0] },
    ])
    expect(duplicate).toMatchObject({ success: false, content: '' })
    expect(duplicate.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_RULE_SET_AMBIGUOUS', severity: 'error' }))
    expect(compileWith([{ sourceId: 'surge-lan', target: 'mihomo', kind: 'builtin-rule-set', name: 'LAN' } as unknown as TargetNativeRuleSetSourceIR])).toMatchObject({ success: false })
    expect(compileWith([{ sourceId: 'surge-lan', target: 'surge', kind: 'builtin-rule-set', name: 'OTHER' } as unknown as TargetNativeRuleSetSourceIR])).toMatchObject({ success: false })

    const remoteBuiltin = baseIR([route('lan', { kind: 'rule-set', id: 'surge-lan' }, { kind: 'direct' }, 10)])
    remoteBuiltin.services[0].ruleSources[0] = { id: 'surge-lan', provider: 'builtin', url: 'https://example.invalid/lan.list' }
    expect(compileWith(builtinSources)).toMatchObject({ success: true })
    expect(compileSurge(remoteBuiltin, { now: fixedNow, nativeRuleSetSources: builtinSources })).toMatchObject({ success: false })

    const inlineBuiltin = baseIR([route('lan', { kind: 'rule-set', id: 'surge-lan' }, { kind: 'direct' }, 10)])
    inlineBuiltin.services[0].ruleSources[0] = {
      id: 'surge-lan', provider: 'builtin', inlineMatchers: [{ kind: 'domain', value: 'example.com' }],
    }
    expect(compileSurge(inlineBuiltin, { now: fixedNow, nativeRuleSetSources: builtinSources })).toMatchObject({ success: false })
  })

  it('rejects spoofed Project sourceId fields before producing Rule Set IR', () => {
    const project = {
      version: 1,
      id: 'graph-builtins-spoof',
      name: 'Graph built-ins spoof',
      primaryTarget: 'surge' as const,
      graph: {
        nodes: [
          { id: 'route', type: 'block' as const, position: { x: 0, y: 0 }, data: {
            blockType: 'custom-rule' as const, category: 'routing' as const, title: 'LAN', subtitle: '', icon: 'rule',
            routeMatcherKind: 'rule-set' as const, routeMatcherValue: 'surge-lan', targetKind: 'direct' as const, targetLabel: 'DIRECT', routePriority: 10,
            targetNativeRuleSet: { target: 'surge' as const, kind: 'builtin-rule-set' as const, name: 'LAN' as const, sourceId: 'spoofed' },
          } },
          { id: 'final', type: 'block' as const, position: { x: 0, y: 0 }, data: {
            blockType: 'final' as const, category: 'routing' as const, title: 'Final', subtitle: '', icon: 'flag', targetKind: 'direct' as const,
          } },
          { id: 'output', type: 'block' as const, position: { x: 0, y: 0 }, data: {
            blockType: 'output' as const, category: 'output' as const, title: 'Surge', subtitle: '', icon: 'export', client: 'surge' as const,
          } },
        ],
        edges: [],
      },
      services: [], outputs: [], updatedAt: '2026-08-27T00:00:00.000Z',
    }
    const result = compileGraph(project)
    expect(result.success).toBe(false)
    expect(result.nativeRuleSetSources).toEqual([])
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_RULE_SET_INVALID', severity: 'error' }))
  })

  it('rejects a target-native service source instead of treating it as a Universal service route', () => {
    const ir = baseIR([{ id: 'service-route', name: 'Service route', matcher: { kind: 'service', serviceIds: ['surge-builtins'] }, target: { kind: 'direct' }, priority: 10 }])
    const result = compileSurge(ir, { now: fixedNow, nativeRuleSetSources: builtinSources })
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_RULE_SET_SOURCE_UNSUPPORTED', severity: 'error' }))
  })

  it('deduplicates synthetic Rule Set identities when multiple graph routes share one source', () => {
    const project = {
      version: 1,
      id: 'graph-builtins-duplicate',
      name: 'Graph built-ins duplicate',
      primaryTarget: 'surge' as const,
      graph: {
        nodes: [
          ...(['a', 'b'] as const).map((id, index) => ({ id: `route-${id}`, type: 'block' as const, position: { x: 0, y: 0 }, data: {
            blockType: 'custom-rule' as const, category: 'routing' as const, title: `LAN ${id}`, subtitle: '', icon: 'rule',
            routeMatcherKind: 'rule-set' as const, routeMatcherValue: 'surge-lan', targetKind: 'direct' as const, targetLabel: 'DIRECT', routePriority: index + 1,
            targetNativeRuleSet: { target: 'surge' as const, kind: 'builtin-rule-set' as const, name: 'LAN' as const },
          } })),
          { id: 'final', type: 'block' as const, position: { x: 0, y: 0 }, data: {
            blockType: 'final' as const, category: 'routing' as const, title: 'Final', subtitle: '', icon: 'flag', targetKind: 'direct' as const,
          } },
          { id: 'output', type: 'block' as const, position: { x: 0, y: 0 }, data: {
            blockType: 'output' as const, category: 'output' as const, title: 'Surge', subtitle: '', icon: 'export', client: 'surge' as const,
          } },
        ],
        edges: [],
      },
      services: [], outputs: [], updatedAt: '2026-08-27T00:00:00.000Z',
    }
    const graph = compileGraph(project)
    expect(graph.success, graph.issues.map((issue) => issue.message).join('\n')).toBe(true)
    expect(graph.ir?.services.flatMap((service) => service.ruleSources).filter((source) => source.id === 'surge-lan')).toHaveLength(1)
    expect(graph.ir?.routes).toHaveLength(2)
  })

  it('does not let other targets consume a Surge built-in source', () => {
    const ir = baseIR([route('lan', { kind: 'rule-set', id: 'surge-lan' }, { kind: 'direct' }, 10)])
    const result = compileMihomo(ir, {
      nativeRuleSetSources: [{ sourceId: 'surge-lan', target: 'surge', kind: 'builtin-rule-set', name: 'LAN' }],
    })
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_RULE_SET_UNSUPPORTED', severity: 'error' }))
  })
})
