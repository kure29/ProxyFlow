import { describe, expect, it } from 'vitest'
import { explicitProxyIR } from '../__fixtures__/crossTargetFixtures'
import { customDomainRouteFixture } from '../__fixtures__/graphFixtures'
import { validateIR } from '../semanticValidation'
import { compileGraph } from './compileGraph'

function ruleSetProject(value: string) {
  const project = structuredClone(customDomainRouteFixture)
  project.services = [{
    id: 'catalog-service', name: 'Catalog service', category: 'development',
    ruleSources: [{ id: 'remote-rules', provider: 'remote', format: 'yaml', behavior: 'domain', url: 'https://rules.example.invalid/catalog.yaml' }],
  }]
  const route = project.graph.nodes.find((node) => node.id === 'custom-route')!
  route.data.routeMatcherKind = 'rule-set'
  route.data.routeMatcherValue = value
  return project
}

describe('routing semantic hardening', () => {
  it('compiles a valid Rule Set reference without changing the IR model', () => {
    const result = compileGraph(ruleSetProject('remote-rules'))
    expect(result.success).toBe(true)
    expect(result.ir?.routes[0]).toEqual(expect.objectContaining({ matcher: { kind: 'rule-set', id: 'remote-rules' } }))
  })

  it('locates missing and ambiguous Rule Set references at the route node', () => {
    const missing = compileGraph(ruleSetProject('missing-rules'))
    expect(missing.success).toBe(false)
    expect(missing.issues).toContainEqual(expect.objectContaining({ code: 'ROUTE_RULE_SET_NOT_FOUND', nodeId: 'custom-route' }))

    const ambiguous = ruleSetProject('remote-rules')
    ambiguous.services.push({
      id: 'second-service', name: 'Second service', category: 'development',
      ruleSources: [{ id: 'remote-rules', provider: 'remote', format: 'yaml', behavior: 'domain', url: 'https://rules.example.invalid/second.yaml' }],
    })
    const result = compileGraph(ambiguous)
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'ROUTE_RULE_SET_AMBIGUOUS', nodeId: 'custom-route' }))
  })

  it('rejects a missing Rule Set in manually constructed IR', () => {
    const ir = explicitProxyIR()
    ir.routes = [{ id: 'missing-route', name: 'Missing', matcher: { kind: 'rule-set', id: 'missing-rules' }, target: { kind: 'direct' }, priority: 10 }]
    expect(validateIR(ir)).toContainEqual(expect.objectContaining({ code: 'ROUTE_RULE_SET_NOT_FOUND', entity: { type: 'route', id: 'missing-route' } }))
  })
})
