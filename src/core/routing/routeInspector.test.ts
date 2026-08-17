import { describe, expect, it } from 'vitest'
import { compileGraph } from '../graphCompiler'
import { v08BasicRoutingFixture, v08FailoverFixture } from '../__fixtures__/v08Acceptance'
import type { ProxyFlowIR } from '../ir'
import { inspectRoute } from './routeInspector'

function basicIr() {
  const result = compileGraph(v08BasicRoutingFixture)
  expect(result.success).toBe(true)
  return result.ir!
}

describe('route inspector', () => {
  it('explains a service match and its strategy candidate path', () => {
    const result = inspectRoute(basicIr(), { serviceId: 'openai' })
    expect(result.status).toBe('matched')
    expect(result.matchedRule).toEqual(expect.objectContaining({ routeId: 'openai', priority: 10, matched: true }))
    expect(result.matchedRule?.reason.code).toBe('service-match')
    expect(result.target).toEqual(expect.objectContaining({ kind: 'strategy', label: 'US Auto' }))
    expect(result.target?.strategy).toEqual(expect.objectContaining({ candidatePath: ['Hong Kong source'], candidateCount: 1 }))
  })

  it('explains domain, port, and direct/reject targets without mixing matcher semantics', () => {
    const ir = basicIr()
    const domain = inspectRoute(ir, { hostname: 'router.lan' })
    expect(domain.target?.kind).toBe('direct')
    expect(domain.matchedRule?.reason.code).toBe('domain-suffix-match')

    const portIr: ProxyFlowIR = {
      ...ir,
      routes: [{ ...ir.routes[0], id: 'port-route', name: 'HTTPS', priority: 1, matcher: { kind: 'port', port: 443 }, target: { kind: 'reject' } }, ...ir.routes],
    }
    const port = inspectRoute(portIr, { port: 443 })
    expect(port.matchedRule?.routeId).toBe('port-route')
    expect(port.target?.kind).toBe('reject')
    expect(port.matchedRule?.reason.code).toBe('port-match')
  })

  it('matches IPv4 and IPv6 CIDRs', () => {
    const ir = basicIr()
    const cidrIr: ProxyFlowIR = {
      ...ir,
      routes: [
        { ...ir.routes[0], id: 'v4', name: 'v4', priority: 1, matcher: { kind: 'ip-cidr', value: '192.0.2.0/24' }, target: { kind: 'direct' } },
        { ...ir.routes[0], id: 'v6', name: 'v6', priority: 2, matcher: { kind: 'ip-cidr6', value: '2001:db8::/32' }, target: { kind: 'reject' } },
      ],
    }
    expect(inspectRoute(cidrIr, { ip: '192.0.2.42' }).matchedRule?.routeId).toBe('v4')
    expect(inspectRoute(cidrIr, { ip: '2001:db8:1::42' }).matchedRule?.routeId).toBe('v6')
    expect(inspectRoute(cidrIr, { ip: '203.0.113.42' }).status).toBe('default')
  })

  it('reports default route and unresolved input distinctly', () => {
    const ir = basicIr()
    expect(inspectRoute(ir, {}).status).toBe('unresolved')
    const result = inspectRoute(ir, { hostname: 'unknown.example' })
    expect(result.status).toBe('default')
    expect(result.defaultRoute?.label).toBe('US Auto')
  })

  it('exposes target-specific failover support instead of implying equivalence', () => {
    const graph = compileGraph(v08FailoverFixture)
    expect(graph.success).toBe(true)
    const result = inspectRoute(graph.ir!, { hostname: 'example.com' })
    expect(result.target?.strategy?.kind).toBe('fallback')
    expect(result.target?.strategy?.targetSupport).toEqual({ mihomo: 'supported', 'sing-box': 'unsupported' })
  })

  it('does not present an unhydrated subscription as a usable strategy candidate', () => {
    const ir = basicIr()
    const emptySourceIr: ProxyFlowIR = {
      ...ir,
      sources: ir.sources.map((source) => source.id === 'hk-source'
        ? { id: source.id, name: source.name, kind: 'subscription' as const, enabled: true, url: 'https://example.com/sub', materialization: { status: 'unavailable' as const } }
        : source),
    }
    const result = inspectRoute(emptySourceIr, { serviceId: 'openai' })
    expect(result.target?.strategy?.candidateCount).toBe(0)
    expect(result.target?.strategy?.targetSupport).toEqual({ mihomo: 'unsupported', 'sing-box': 'unsupported' })
  })
})
