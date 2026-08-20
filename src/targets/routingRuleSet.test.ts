import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { explicitProxyIR } from '../core/__fixtures__/crossTargetFixtures'
import { compileMihomo } from './mihomo'
import type { MihomoConfig } from './mihomo/model'
import { compileSingBox } from './singbox'
import type { SingBoxConfig } from './singbox/model'

const fixedNow = () => new Date('2026-08-16T00:00:00.000Z')

function ruleSetIR(format: 'mihomo' | 'sing-box') {
  const ir = explicitProxyIR()
  ir.services = [{
    id: 'catalog', name: 'Catalog', inlineMatchers: [],
    ruleSources: [format === 'mihomo'
      ? { id: 'mihomo-rules', provider: 'remote', format: 'yaml', behavior: 'domain', url: 'https://rules.example.invalid/mihomo.yaml' }
      : { id: 'singbox-rules', provider: 'remote', format: 'sing-box-source', url: 'https://rules.example.invalid/singbox.json' }],
  }]
  const id = format === 'mihomo' ? 'mihomo-rules' : 'singbox-rules'
  ir.routes = [{ id: 'rules-route', name: 'Rules', matcher: { kind: 'rule-set', id }, target: { kind: 'strategy', id: 'us-auto' }, priority: 10 }]
  return ir
}

describe('Rule Set target lowering', () => {
  it.each([
    ['yaml', 'classical'],
    ['text', 'domain'],
    ['mrs', 'domain'],
  ] as const)('lowers a Mihomo-compatible %s Rule Set to a rule provider and route', (format, behavior) => {
    const ir = ruleSetIR('mihomo')
    ir.services[0].ruleSources[0].format = format
    ir.services[0].ruleSources[0].behavior = behavior
    const result = compileMihomo(ir, { now: fixedNow })
    expect(result.success).toBe(true)
    const config = parse(result.content) as MihomoConfig
    expect(config.rules).toContain('RULE-SET,mihomo-rules,US Auto')
    expect(config['rule-providers']?.['mihomo-rules']).toEqual(expect.objectContaining({ format }))
  })

  it('rejects a Mihomo-only Rule Set explicitly in sing-box', () => {
    const result = compileSingBox(ruleSetIR('mihomo'), { now: fixedNow })
    expect(result.success).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('SINGBOX_INVALID_RULESET')
  })

  it('lowers a sing-box-compatible Rule Set using its stable source ID', () => {
    for (const [format, targetFormat] of [['sing-box-source', 'source'], ['sing-box-binary', 'binary']] as const) {
      const ir = ruleSetIR('sing-box')
      ir.services[0].ruleSources[0].format = format
      const result = compileSingBox(ir, { now: fixedNow })
      expect(result.success).toBe(true)
      const config = JSON.parse(result.content) as SingBoxConfig
      expect(config.route.rules).toContainEqual(expect.objectContaining({ rule_set: ['singbox-rules'] }))
      expect(config.route.rule_set).toContainEqual(expect.objectContaining({ tag: 'singbox-rules', format: targetFormat }))
    }
  })

  it('rejects a sing-box-only Rule Set explicitly in Mihomo', () => {
    const result = compileMihomo(ruleSetIR('sing-box'), { now: fixedNow })
    expect(result.success).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('MIHOMO_RULE_SOURCE_FORMAT_UNSUPPORTED')
  })

  it('keeps service and Rule Set IDs in separate namespaces', () => {
    const ir = explicitProxyIR()
    ir.services = [
      { id: 'foo', name: 'Foo service', inlineMatchers: [{ kind: 'domain', value: 'service.example' }], ruleSources: [] },
      { id: 'other', name: 'Other', inlineMatchers: [], ruleSources: [{ id: 'foo', provider: 'remote', format: 'yaml', behavior: 'domain', url: 'https://rules.example.invalid/foo.yaml' }] },
    ]
    ir.routes = [
      { id: 'service-route', name: 'Service', matcher: { kind: 'service', serviceIds: ['foo'] }, target: { kind: 'direct' }, priority: 10 },
      { id: 'rules-route', name: 'Rules', matcher: { kind: 'rule-set', id: 'foo' }, target: { kind: 'reject' }, priority: 20 },
    ]
    const mihomo = compileMihomo(ir, { now: fixedNow })
    expect(mihomo.success).toBe(true)
    expect(parse(mihomo.content).rules).toEqual(['DOMAIN,service.example,DIRECT', 'RULE-SET,foo,REJECT', 'MATCH,US Auto'])
  })

  it('keeps lower priority first and graph order as the tie-break in both targets', () => {
    const ir = explicitProxyIR()
    ir.routes = [
      { id: 'a', name: 'A', matcher: { kind: 'domain', value: 'a.example' }, target: { kind: 'direct' }, priority: 10 },
      { id: 'b', name: 'B', matcher: { kind: 'domain', value: 'b.example' }, target: { kind: 'reject' }, priority: 10 },
      { id: 'c', name: 'C', matcher: { kind: 'domain', value: 'c.example' }, target: { kind: 'direct' }, priority: 20 },
    ]
    const mihomo = parse(compileMihomo(ir, { now: fixedNow }).content) as MihomoConfig
    expect(mihomo.rules.slice(0, 3)).toEqual(['DOMAIN,a.example,DIRECT', 'DOMAIN,b.example,REJECT', 'DOMAIN,c.example,DIRECT'])
    const singbox = JSON.parse(compileSingBox(ir, { now: fixedNow }).content) as SingBoxConfig
    expect(singbox.route.rules.slice(0, 3).map((rule) => rule.domain?.[0])).toEqual(['a.example', 'b.example', 'c.example'])
  })

  it('generates fictional suffix, IPv4, IPv6 and port routes in both targets', () => {
    const ir = explicitProxyIR()
    ir.routes = [
      { id: 'suffix', name: 'Suffix', matcher: { kind: 'domain-suffix', value: 'fictional.example' }, target: { kind: 'strategy', id: 'us-auto' }, priority: 10 },
      { id: 'ipv4', name: 'IPv4', matcher: { kind: 'ip-cidr', value: '192.0.2.0/24' }, target: { kind: 'direct' }, priority: 20 },
      { id: 'ipv6', name: 'IPv6', matcher: { kind: 'ip-cidr6', value: '2001:db8::/32' }, target: { kind: 'reject' }, priority: 30 },
      { id: 'port', name: 'Port', matcher: { kind: 'port', port: 443 }, target: { kind: 'strategy', id: 'us-auto' }, priority: 40 },
    ]
    const mihomo = parse(compileMihomo(ir, { now: fixedNow }).content) as MihomoConfig
    expect(mihomo.rules.slice(0, 4)).toEqual([
      'DOMAIN-SUFFIX,fictional.example,US Auto', 'IP-CIDR,192.0.2.0/24,DIRECT',
      'IP-CIDR6,2001:db8::/32,REJECT', 'DST-PORT,443,US Auto',
    ])
    const singbox = JSON.parse(compileSingBox(ir, { now: fixedNow }).content) as SingBoxConfig
    expect(singbox.route.rules.slice(0, 4)).toEqual([
      { domain_suffix: ['fictional.example'], action: 'route', outbound: 'US Auto' },
      { ip_cidr: ['192.0.2.0/24'], action: 'route', outbound: 'direct' },
      { ip_cidr: ['2001:db8::/32'], action: 'reject' },
      { port: [443], action: 'route', outbound: 'US Auto' },
    ])
  })
})
