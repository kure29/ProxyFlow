import { describe, expect, it } from 'vitest'
import { SHADOWROCKET_MINIMUM_VERSION, SHADOWROCKET_SUPPORTED_DNS, SHADOWROCKET_SUPPORTED_MATCHERS, shadowrocketCapabilities } from './capabilities'

describe('Shadowrocket capability boundary', () => {
  it('remains registered but paused until evidence gates close', () => {
    expect(SHADOWROCKET_MINIMUM_VERSION).toBe('audit pending')
    expect(shadowrocketCapabilities.productStatus).toBe('paused')
    expect(shadowrocketCapabilities.native['shadowrocket-profile'].status).toBe('target-native')
  })

  it('keeps the initial matcher and DNS subset explicit', () => {
    expect(SHADOWROCKET_SUPPORTED_MATCHERS).toEqual(['domain', 'domain-suffix', 'domain-keyword', 'ip-cidr', 'ip-cidr6', 'geo-ip'])
    expect(SHADOWROCKET_SUPPORTED_DNS).toEqual(['system', 'udp'])
    expect(shadowrocketCapabilities.routingMatchers.port.status).toBe('unsupported')
    expect(shadowrocketCapabilities.dns.doh.status).toBe('unsupported')
  })
})
