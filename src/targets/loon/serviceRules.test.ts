import { describe, expect, it } from 'vitest'
import type { ProxyFlowIR } from '../../core/ir'
import { legacyChinaServiceDefinition } from '../../data/legacyServices'
import { serviceCatalog } from '../../data/serviceCatalog'
import type { CompatibilityIssue } from '../../types/project'
import { resolveLoonServiceRuleSource } from './serviceRules'

function resolve(services: ProxyFlowIR['services'], serviceId: string) {
  const issues: CompatibilityIssue[] = []
  const source = resolveLoonServiceRuleSource({ services }, serviceId, 'route', issues)
  return { source, issues }
}

describe('Loon first-party service rule resolver', () => {
  it('resolves only the owned Loon asset even though the IR catalog carries another target source', () => {
    const { source, issues } = resolve(structuredClone(serviceCatalog), 'openai')
    expect(issues).toEqual([])
    expect(source).toEqual({
      type: 'remote-rule-set',
      url: 'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/OpenAI.list',
      ruleCount: 20,
    })
  })

  it('reports a missing IR service reference', () => {
    const { source, issues } = resolve([], 'unknown')
    expect(source).toBeUndefined()
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'LOON_SERVICE_RULE_NOT_FOUND', severity: 'error', entityId: 'route',
    }))
  })

  it('rejects a legacy China service without creating an asset', () => {
    const { source, issues } = resolve([structuredClone(legacyChinaServiceDefinition)], 'china')
    expect(source).toBeUndefined()
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'LOON_LEGACY_SERVICE_RULE_UNSUPPORTED', severity: 'error', entityId: 'route',
    }))
  })

  it('rejects a catalog service that has no owned Loon asset', () => {
    const { source, issues } = resolve([{
      id: 'fictional', name: 'Fictional', ruleSources: [{ id: 'fictional', provider: 'remote', format: 'text', url: 'https://example.invalid/rules.list' }],
    }], 'fictional')
    expect(source).toBeUndefined()
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'LOON_SERVICE_RULE_SOURCE_MISSING', severity: 'error', entityId: 'route',
    }))
  })
})
