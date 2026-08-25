import { describe, expect, it } from 'vitest'
import fixture from '../../../fixtures/shadowrocket/acceptance.expected.conf?raw'
import { compileShadowrocketAcceptance } from './acceptance'
import {
  compileShadowrocketLocalProfile,
  compileShadowrocketLocalProfiles,
  parseShadowrocketLocalInput,
  summarizeParsedSubscription,
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
