import { describe, expect, it } from 'vitest'
import { targetCapabilityRegistry } from '../../core/capabilities'
import { serviceCatalog } from '../../data/serviceCatalog'
import {
  capabilityUnavailable, createCustomRuleData, createServiceRuleData, filterRoutingServices,
  routingRuleStatusForCapability,
} from './RoutingWorkspace'

describe('Routing Workspace helpers', () => {
  it('filters services by stable product metadata without reading rule source URLs', () => {
    expect(filterRoutingServices(serviceCatalog, 'open').map((service) => service.id)).toEqual(['openai'])
    expect(filterRoutingServices(serviceCatalog, 'streaming').map((service) => service.id)).toEqual(['youtube', 'netflix', 'disney'])
    expect(filterRoutingServices(serviceCatalog, 'no match')).toEqual([])
  })

  it('uses capability declarations to disable only unsupported matcher choices', () => {
    expect(capabilityUnavailable(targetCapabilityRegistry.mihomo.routingMatchers.asn)).toBe(false)
    expect(capabilityUnavailable(targetCapabilityRegistry['sing-box'].routingMatchers.asn)).toBe(true)
    expect(capabilityUnavailable(targetCapabilityRegistry['sing-box'].routingMatchers['rule-set'])).toBe(false)
    expect(capabilityUnavailable(undefined)).toBe(false)
  })

  it('creates the stable Service Rule and Custom Rule data used by the add flow', () => {
    expect(createServiceRuleData(serviceCatalog.find((service) => service.id === 'openai')!)).toEqual(expect.objectContaining({
      title: 'OpenAI', routeMatcherKind: 'service', services: ['openai'],
    }))
    expect(createCustomRuleData('domain-suffix', 'Custom Rule')).toEqual(expect.objectContaining({
      title: 'Custom Rule', routeMatcherKind: 'domain-suffix', routeMatcherValue: '', ruleSource: 'custom',
    }))
  })

  it('marks retained matchers unsupported by the selected target without deleting them', () => {
    expect(routingRuleStatusForCapability('ready', 'asn', targetCapabilityRegistry['sing-box'].routingMatchers)).toBe('error')
    expect(routingRuleStatusForCapability('ready', 'asn', targetCapabilityRegistry.mihomo.routingMatchers)).toBe('ready')
    expect(routingRuleStatusForCapability('disabled', 'asn', targetCapabilityRegistry['sing-box'].routingMatchers)).toBe('disabled')
  })
})
