import { describe, expect, it } from 'vitest'
import {
  detectCustomRuleSourceFormat, parseCustomRuleSource, validateCustomRuleSourceForTarget,
} from './customRuleSource'

const base = {
  id: 'custom-rules', name: 'Fictional rules', inputKind: 'file' as const,
}

describe('custom rule source parsing', () => {
  it('detects and normalizes Mihomo payload YAML without retaining raw content', () => {
    const content = `payload:\n  - DOMAIN-SUFFIX,example.com\n  - IP-CIDR,192.0.2.0/24\n  - IP-CIDR6,2001:db8::/32\n  - DST-PORT,443\n`
    expect(detectCustomRuleSourceFormat(content, 'fictional.yaml')).toBe('mihomo-yaml')
    const result = parseCustomRuleSource({ ...base, content, fileName: 'fictional.yaml' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toEqual(expect.objectContaining({
      format: 'mihomo-yaml', fileName: 'fictional.yaml', enabled: true,
      matchers: [
        { kind: 'domain-suffix', value: 'example.com' },
        { kind: 'ip-cidr', value: '192.0.2.0/24' },
        { kind: 'ip-cidr6', value: '2001:db8::/32' },
        { kind: 'port', port: 443 },
      ],
    }))
    expect(result.source).not.toHaveProperty('content')
  })

  it('normalizes Surge list rules and reports an overridden source policy', () => {
    const result = parseCustomRuleSource({
      ...base, content: '# fictional\nDOMAIN,api.example.com,Proxy\n.example.net\n', fileName: 'fictional.list',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.format).toBe('surge-list')
    expect(result.source.matchers).toEqual([
      { kind: 'domain', value: 'api.example.com' },
      { kind: 'domain-suffix', value: 'example.net' },
    ])
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'RULE_SOURCE_POLICY_OVERRIDDEN', severity: 'warning' }))
  })

  it('fails closed for unsupported options, invalid values, unsafe URLs, and target gaps', () => {
    expect(parseCustomRuleSource({ ...base, content: 'IP-CIDR,192.0.2.0/24,DIRECT,no-resolve' })).toEqual(expect.objectContaining({ ok: false }))
    expect(parseCustomRuleSource({ ...base, content: 'DOMAIN,https://example.com' })).toEqual(expect.objectContaining({ ok: false }))
    expect(parseCustomRuleSource({ ...base, inputKind: 'url', url: 'file:///tmp/rules.list', content: 'example.com' })).toEqual(expect.objectContaining({ ok: false }))
    const source = parseCustomRuleSource({ ...base, content: 'example.com' })
    expect(source.ok).toBe(true)
    if (source.ok) expect(validateCustomRuleSourceForTarget({ ...source.source, matchers: [{ kind: 'domain', value: 'example.com' }] }, 'sing-box')).toEqual([])
  })
})
