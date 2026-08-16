import { describe, expect, it } from 'vitest'
import type { ResolvedProxyEndpointIR } from './model'
import { validateProxyEndpointSemantics } from './validateEndpointSemantics'

describe('validateProxyEndpointSemantics', () => {
  it('is deterministic and reports stable VLESS Reality conflict codes', () => {
    const endpoint: ResolvedProxyEndpointIR = {
      kind: 'vless', protocol: 'vless', id: 'vless', name: 'VLESS', server: 'vless.example.com', port: 443,
      uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', security: 'none',
      tls: {
        enabled: false, serverName: 'www.example.com',
        reality: { publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', shortId: 'abcd' },
      },
    }
    const first = validateProxyEndpointSemantics(endpoint)
    expect(first.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'PROXY_TLS_DISABLED_WITH_SECURITY_FIELDS', 'PROXY_REALITY_TLS_REQUIRED', 'PROXY_VLESS_REALITY_SECURITY_CONFLICT',
    ]))
    expect(validateProxyEndpointSemantics(endpoint)).toEqual(first)
  })

  it('does not confuse explicit VLESS no-ops with unsupported semantics', () => {
    const endpoint: ResolvedProxyEndpointIR = {
      kind: 'vless', protocol: 'vless', id: 'vless', name: 'VLESS', server: 'vless.example.com', port: 80,
      uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', security: 'none', encryption: 'none',
    }
    expect(validateProxyEndpointSemantics(endpoint)).toEqual([])
  })

  it('rejects TLS-only VMess intent when TLS is disabled', () => {
    const endpoint: ResolvedProxyEndpointIR = {
      kind: 'vmess', protocol: 'vmess', id: 'vmess', name: 'VMess', server: 'vmess.example.com', port: 443,
      uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', security: 'auto', tls: { enabled: false, fingerprint: 'chrome' },
    }
    expect(validateProxyEndpointSemantics(endpoint)).toContainEqual(expect.objectContaining({
      code: 'PROXY_TLS_DISABLED_WITH_SECURITY_FIELDS', feature: 'tls:disabled-with-security-fields',
    }))
  })
})
