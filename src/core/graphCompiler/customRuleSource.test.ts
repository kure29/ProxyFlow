import { describe, expect, it } from 'vitest'
import { customDomainRouteFixture } from '../__fixtures__/graphFixtures'
import { compileGraph } from './compileGraph'

function customSourceProject() {
  const project = structuredClone(customDomainRouteFixture)
  project.primaryTarget = 'mihomo'
  const route = project.graph.nodes.find((node) => node.id === 'custom-route')!
  route.data.routeMatcherKind = 'rule-set'
  route.data.routeMatcherValue = 'custom-rule-custom-route'
  route.data.customRuleSource = {
    id: 'custom-rule-custom-route', name: 'Fictional rules', inputKind: 'url',
    url: 'https://rules.example.com/fictional.yaml', format: 'mihomo-yaml', enabled: true,
    matchers: [{ kind: 'domain-suffix', value: 'example.com' }, { kind: 'port', port: 443 }],
  }
  return project
}

describe('custom rule source Graph -> IR pipeline', () => {
  it('injects only normalized matchers into Universal IR', () => {
    const result = compileGraph(customSourceProject())
    expect(result.success).toBe(true)
    const source = result.ir?.services.find((service) => service.id.startsWith('custom-rule-source:'))?.ruleSources[0]
    expect(source).toEqual(expect.objectContaining({
      id: 'custom-rule-custom-route', provider: 'custom', format: 'yaml', behavior: 'classical',
      inlineMatchers: [{ kind: 'domain-suffix', value: 'example.com' }, { kind: 'port', port: 443 }],
    }))
    expect(source).not.toHaveProperty('url')
  })

  it('fails closed for disabled, mismatched, and corrupted normalized sources', () => {
    const disabled = customSourceProject()
    disabled.graph.nodes.find((node) => node.id === 'custom-route')!.data.customRuleSource!.enabled = false
    expect(compileGraph(disabled).issues).toContainEqual(expect.objectContaining({ code: 'RULE_SOURCE_DISABLED' }))

    const mismatched = customSourceProject()
    mismatched.graph.nodes.find((node) => node.id === 'custom-route')!.data.routeMatcherValue = 'other-source'
    expect(compileGraph(mismatched).issues).toContainEqual(expect.objectContaining({ code: 'ROUTE_RULE_SOURCE_REFERENCE_MISMATCH' }))

    const corrupted = customSourceProject()
    corrupted.graph.nodes.find((node) => node.id === 'custom-route')!.data.customRuleSource!.matchers = [{ kind: 'port', port: 0 }]
    expect(compileGraph(corrupted).issues).toContainEqual(expect.objectContaining({ code: 'RULE_SOURCE_NORMALIZED_MODEL_INVALID' }))
  })

  it('checks the active supported Target without mutating a historical sing-box Project', () => {
    const historical = customSourceProject()
    historical.primaryTarget = 'sing-box'

    const productResult = compileGraph(historical, { validationTarget: 'mihomo' })
    expect(productResult.success).toBe(true)
    expect(productResult.issues.some((issue) => issue.code.startsWith('SINGBOX_'))).toBe(false)
    expect(historical.primaryTarget).toBe('sing-box')
  })
})
