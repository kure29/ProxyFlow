import { describe, expect, it } from 'vitest'
import { serviceCatalog } from '../../data/serviceCatalog'
import type { GraphNode, RouteMatcherKind } from '../../types/project'
import {
  presentRoutingRule, resolveSelectedServices, sumKnownRuleCounts, type RoutingPresentationCopy,
} from './routePresentation'

const copy: RoutingPresentationCopy = {
  matcherLabels: Object.fromEntries([
    'service', 'domain', 'domain-suffix', 'domain-keyword', 'ip-cidr', 'ip-cidr6', 'port',
    'asn', 'geo-ip', 'geo-site', 'rule-set',
  ].map((kind) => [kind, kind])) as Record<RouteMatcherKind, string>,
  emptyMatcher: 'Not configured',
  targetMissing: 'Target required',
  ruleCount: (count) => `${count} rules`,
}

function route(id: string, data: Partial<GraphNode['data']>): GraphNode {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    data: {
      blockType: 'service-rule', category: 'routing', title: id, subtitle: '', icon: 'waypoints',
      ...data,
    },
  }
}

describe('routing presentation', () => {
  it('presents service rules with catalog counts without leaking provenance', () => {
    const result = presentRoutingRule(route('ai', {
      services: ['OpenAI', 'claude', 'OpenAI'], targetId: 'auto', targetLabel: 'US Auto', targetKind: 'strategy',
      ruleSource: 'ios_rule_script',
    }), serviceCatalog, [], copy)

    expect(result).toEqual(expect.objectContaining({
      intent: 'service', serviceNames: ['OpenAI', 'Claude'], serviceRuleCount: 24,
      matcherSummary: 'OpenAI, Claude · 24 rules', targetSummary: 'US Auto', status: 'ready',
    }))
    expect(JSON.stringify(result)).not.toContain('ios_rule_script')
    expect(JSON.stringify(result)).not.toContain('github.com')
  })

  it('normalizes legacy routing nodes into the same service/custom presentation', () => {
    const legacyService = presentRoutingRule(route('legacy-service', {
      blockType: 'routing-group', services: ['openai'], targetKind: 'direct', targetId: 'DIRECT',
    }), serviceCatalog, [], copy)
    const legacyCustom = presentRoutingRule(route('legacy-custom', {
      blockType: 'custom-rule', routeMatcherKind: 'domain-suffix', routeMatcherValue: 'example.com',
      targetKind: 'reject', targetId: 'REJECT',
    }), serviceCatalog, [], copy)

    expect(legacyService).toEqual(expect.objectContaining({ intent: 'service', targetSummary: 'DIRECT', status: 'ready' }))
    expect(legacyCustom).toEqual(expect.objectContaining({ intent: 'custom', matcherSummary: 'domain-suffix · example.com', targetSummary: 'REJECT', status: 'ready' }))
  })

  it('derives warning, error, disabled, and locally invalid states', () => {
    const base = route('rule', {
      routeMatcherKind: 'port', routeMatcherPort: 443, targetKind: 'direct', targetId: 'DIRECT',
    })
    expect(presentRoutingRule(base, serviceCatalog, [{ nodeId: 'rule', severity: 'warning' }], copy).status).toBe('warning')
    expect(presentRoutingRule(base, serviceCatalog, [{ nodeId: 'rule', severity: 'error' }], copy).status).toBe('error')
    expect(presentRoutingRule({ ...base, data: { ...base.data, disabled: true } }, serviceCatalog, [], copy).status).toBe('disabled')
    expect(presentRoutingRule(route('empty', { routeMatcherKind: 'port', routeMatcherPort: 0 }), serviceCatalog, [], copy).status).toBe('error')
  })

  it('resolves service IDs and names case-insensitively and counts only known metadata', () => {
    const selected = resolveSelectedServices(['OPENAI', 'Claude', 'missing', 'openai'], serviceCatalog)
    expect(selected.map((service) => service.id)).toEqual(['openai', 'claude'])
    expect(sumKnownRuleCounts(selected)).toBe(24)
    expect(sumKnownRuleCounts([{ ...selected[0], ruleSources: [] }])).toBeUndefined()
  })
})
