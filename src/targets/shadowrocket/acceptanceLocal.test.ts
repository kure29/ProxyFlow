import { describe, expect, it } from 'vitest'
import fixture from '../../../fixtures/shadowrocket/acceptance.expected.conf?raw'
import { compileShadowrocketAcceptance } from './acceptance'
import {
  compileShadowrocketLocalProfile,
  compileShadowrocketLocalProfiles,
  localRoutingEvidenceReadiness,
  localBehavioralEvidenceMode,
  parseShadowrocketLocalInput,
  summarizeParsedSubscription,
  validateShadowrocketLocalDnsServer,
  validateShadowrocketLocalRoutingValues,
} from './acceptanceLocal'

const localInput = [
  'proxies:',
  '  - name: Private One',
  '    type: http',
  '    server: private-one.example.invalid',
  '    port: 8080',
  '    username: private-user',
  '    password: private-password',
  '  - name: Private Two',
  '    type: http',
  '    server: private-two.example.invalid',
  '    port: 8081',
  '    username: private-user-2',
  '    password: private-password-2',
].join('\n')

describe('Shadowrocket local acceptance profiles', () => {
  it('keeps the checked-in deterministic fixture independent from private profiles', () => {
    expect(compileShadowrocketAcceptance().content).toBe(fixture)
    const privateResult = compileShadowrocketLocalProfile('core', localInput)
    expect(privateResult.result?.content).not.toBe(fixture)
    expect(privateResult.summary.protocolCounts).toEqual({ http: 2 })
  })

  it('uses the normal parser → graph → Universal IR → target compiler path', () => {
    const result = compileShadowrocketLocalProfile('core', localInput)
    expect(result.graph.success).toBe(true)
    expect(result.result?.success).toBe(true)
    expect(result.result?.content).toContain('Local Select = select, Private One, Private Two')
    expect(result.result?.content).toContain('FINAL,Local Select')
  })

  it('does not manufacture a second member for select or strategy acceptance', () => {
    const oneEndpoint = localInput.replace(/  - name: Private Two[\s\S]*$/, '')
    const result = compileShadowrocketLocalProfile('core', oneEndpoint)
    expect(result.graph.success).toBe(false)
    expect(result.summary.issueCodeCounts).toEqual({ SHADOWROCKET_LOCAL_SELECT_NEEDS_TWO_DISTINCT_MEMBERS: 1 })
    expect(result.result).toBeUndefined()
  })

  it('generates separate strategy, routing, and DNS profiles without adding production semantics', () => {
    const profiles = compileShadowrocketLocalProfiles(localInput, 'all')
    expect(profiles.map(({ profile }) => profile)).toEqual([
      'core', 'url-test', 'fallback', 'load-balance', 'routing-overlap', 'routing-inverted', 'dns-system', 'dns-udp', 'subscription',
    ])
    for (const profile of profiles) expect(profile.result?.success, profile.profile).toBe(true)
    expect(profiles.find(({ profile }) => profile === 'url-test')?.result?.content).toContain('url-test')
    expect(profiles.find(({ profile }) => profile === 'fallback')?.result?.content).toContain('fallback')
    expect(profiles.find(({ profile }) => profile === 'load-balance')?.result?.content).toContain('load-balance')
    expect(profiles.find(({ profile }) => profile === 'routing-overlap')?.result?.content).toContain('DOMAIN-SUFFIX')
    expect(profiles.find(({ profile }) => profile === 'dns-system')?.result?.content).toContain('dns-server = system')
    expect(profiles.find(({ profile }) => profile === 'dns-udp')?.result?.content).toContain('dns-server = 192.0.2.53:53')
  })

  it('accepts human-supplied DNS and routing controls without printing or tracking them', () => {
    const dns = compileShadowrocketLocalProfile('dns-udp', undefined, undefined, { dnsServer: '1.1.1.1' })
    expect(dns.result?.content).toContain('dns-server = 1.1.1.1:53')
    const routing = compileShadowrocketLocalProfiles(undefined, 'routing', {
      routing: { domain: 'controlled.example', ipv4: '198.51.100.9', ipv6: '2001:db8:1::9', geoipCountry: 'CA' },
    })
    expect(routing.every(({ result }) => result?.success)).toBe(true)
    expect(routing[0].result?.content).toContain('DOMAIN,controlled.example,REJECT')
    expect(routing[0].result?.content).toContain('IP-CIDR,198.51.100.9/32,REJECT')
    expect(routing[0].result?.content).toContain('IP-CIDR6,2001:db8:1::9/128,DIRECT')
    expect(routing[0].result?.content).toContain('GEOIP,CA,DIRECT')
  })

  it('keeps routing policy assignments fixed while inverting only precedence priorities', () => {
    const options = { routing: { domain: 'controlled.example', ipv4: '198.51.100.9', ipv6: '2001:db8:1::9', geoipCountry: 'CA' } }
    const baseline = compileShadowrocketLocalProfile('routing-overlap', undefined, undefined, options).result?.content ?? ''
    const inverted = compileShadowrocketLocalProfile('routing-inverted', undefined, undefined, options).result?.content ?? ''
    expect(baseline).toContain('DOMAIN,controlled.example,REJECT')
    expect(baseline).toContain('DOMAIN-SUFFIX,controlled.example,DIRECT')
    expect(baseline).toContain('IP-CIDR,198.51.100.9/32,REJECT')
    expect(baseline).toContain('GEOIP,CA,DIRECT')
    expect(inverted).toContain('DOMAIN,controlled.example,REJECT')
    expect(inverted).toContain('DOMAIN-SUFFIX,controlled.example,DIRECT')
    expect(inverted).toContain('IP-CIDR,198.51.100.9/32,REJECT')
    expect(inverted).toContain('GEOIP,CA,DIRECT')
    expect(baseline.indexOf('DOMAIN,controlled.example,REJECT')).toBeLessThan(baseline.indexOf('DOMAIN-SUFFIX,controlled.example,DIRECT'))
    expect(inverted.indexOf('DOMAIN-SUFFIX,controlled.example,DIRECT')).toBeLessThan(inverted.indexOf('DOMAIN,controlled.example,REJECT'))
    expect(baseline.indexOf('IP-CIDR,198.51.100.9/32,REJECT')).toBeLessThan(baseline.indexOf('GEOIP,CA,DIRECT'))
    expect(inverted.indexOf('GEOIP,CA,DIRECT')).toBeLessThan(inverted.indexOf('IP-CIDR,198.51.100.9/32,REJECT'))
  })

  it('rejects hostnames, malformed IPv4/IPv6, ports, and control characters', () => {
    expect(validateShadowrocketLocalDnsServer('dns.example')).toEqual({ ok: false, code: 'SHADOWROCKET_LOCAL_DNS_SERVER_INVALID' })
    expect(validateShadowrocketLocalDnsServer('1.1.1.1:abc')).toEqual({ ok: false, code: 'SHADOWROCKET_LOCAL_DNS_SERVER_INVALID' })
    expect(validateShadowrocketLocalDnsServer('1.1.1.1:0')).toEqual({ ok: false, code: 'SHADOWROCKET_LOCAL_DNS_SERVER_INVALID' })
    expect(validateShadowrocketLocalRoutingValues({ ipv4: 'router.example' })).toEqual({ ok: false, code: 'SHADOWROCKET_LOCAL_ROUTING_IPV4_INVALID' })
    expect(validateShadowrocketLocalRoutingValues({ ipv6: '2001:::1' })).toEqual({ ok: false, code: 'SHADOWROCKET_LOCAL_ROUTING_IPV6_INVALID' })
    expect(validateShadowrocketLocalRoutingValues({ domain: 'https://controlled.example' })).toEqual({ ok: false, code: 'SHADOWROCKET_LOCAL_ROUTING_DOMAIN_INVALID' })
    expect(validateShadowrocketLocalRoutingValues({ geoipCountry: 'C\nA' })).toEqual({ ok: false, code: 'SHADOWROCKET_LOCAL_ROUTING_GEOIP_INVALID' })
  })

  it('labels documentation-only defaults as syntax/import-only evidence', () => {
    expect(localBehavioralEvidenceMode('dns-udp')).toBe('SYNTAX_IMPORT_ONLY')
    expect(localBehavioralEvidenceMode('routing-overlap')).toBe('SYNTAX_IMPORT_ONLY')
    expect(localBehavioralEvidenceMode('url-test')).toBe('SYNTAX_IMPORT_ONLY')
    expect(localBehavioralEvidenceMode('dns-udp', { dnsServer: '1.1.1.1:53' })).toBe('HUMAN_INPUT_READY')
    expect(localBehavioralEvidenceMode('routing-overlap', { routing: { domain: 'controlled.example', ipv4: '198.51.100.9', ipv6: '2001:db8:1::9', geoipCountry: 'CA' } })).toBe('HUMAN_INPUT_READY')
    expect(localBehavioralEvidenceMode('routing-overlap', { routing: { domain: 'controlled.example', ipv4: '198.51.100.9', geoipCountry: 'CA' } })).toBe('PARTIAL_HUMAN_INPUT_READY')
    expect(localBehavioralEvidenceMode('url-test', { healthUrl: 'https://health.example/ok' })).toBe('HUMAN_INPUT_READY')
  })

  it('reports routing evidence readiness independently for each matcher family', () => {
    expect(localRoutingEvidenceReadiness()).toEqual({
      domain: 'SYNTAX_IMPORT_ONLY',
      domainSuffix: 'SYNTAX_IMPORT_ONLY',
      ipv4: 'SYNTAX_IMPORT_ONLY',
      ipv6: 'SYNTAX_IMPORT_ONLY',
      geoip: 'SYNTAX_IMPORT_ONLY',
    })
    expect(localRoutingEvidenceReadiness({ routing: { domain: 'controlled.example', ipv4: '198.51.100.9', geoipCountry: 'CA' } })).toEqual({
      domain: 'HUMAN_INPUT_READY',
      domainSuffix: 'HUMAN_INPUT_READY',
      ipv4: 'HUMAN_INPUT_READY',
      ipv6: 'SYNTAX_IMPORT_ONLY',
      geoip: 'HUMAN_INPUT_READY',
    })
  })

  it('keeps aggregate summaries free of endpoint bodies and credentials', () => {
    const parsed = parseShadowrocketLocalInput(localInput)
    const summary = JSON.stringify(summarizeParsedSubscription(parsed))
    expect(summary).toContain('http')
    expect(summary).not.toContain('private-one.example.invalid')
    expect(summary).not.toContain('private-password')
    expect(summary).not.toContain('private-user')
  })

  it('fails closed for malformed local input', () => {
    const parsed = parseShadowrocketLocalInput('this is not a supported subscription')
    expect(parsed.proxies).toHaveLength(0)
    expect(parsed.issues.some((issue) => issue.severity === 'error')).toBe(true)
    expect(compileShadowrocketLocalProfile('subscription', 'this is not a supported subscription').graph.success).toBe(false)
  })
})
