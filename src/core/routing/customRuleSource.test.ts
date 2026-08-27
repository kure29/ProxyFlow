import { describe, expect, it } from 'vitest'
import {
  detectCustomRuleSourceFormat, parseCustomRuleSource, validateCustomRuleSourceForTarget,
} from './customRuleSource'

const base = {
  id: 'custom-rules', name: 'Fictional rules', inputKind: 'file' as const,
}

function parseContent(content: string, fileName = 'fictional.list') {
  return parseCustomRuleSource({ ...base, content, fileName })
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
      ...base, content: '[Rule]\n# fictional\nDOMAIN,api.example.com,Proxy\n.example.net\n', fileName: 'fictional.conf',
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

  it.each([
    ['IP-CIDR,203.0.113.0/24,no-resolve', 'fictional.list', 1],
    ['IP-CIDR6,2001:db8::/32,no-resolve', 'fictional.list', 1],
    ['DOMAIN,example.com,extended-matching', 'fictional.list', 1],
    ['payload:\n  - IP-CIDR,203.0.113.0/24,no-resolve', 'fictional.yaml', 2],
    ['payload:\n  - DOMAIN,example.com,extended-matching', 'fictional.yaml', 2],
  ] as const)('rejects unsupported policy-less modifiers without losing line %s', (content, fileName, line) => {
    const result = parseContent(content, fileName)
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'RULE_SOURCE_OPTIONS_UNSUPPORTED', severity: 'error', line,
    }))
  })

  it('keeps policy override warnings for explicit Mihomo rules grammar', () => {
    const result = parseContent('rules:\n  - DOMAIN,example.com,Proxy\n  - IP-CIDR,192.0.2.0/24,no-resolve', 'fictional.yaml')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.matchers).toEqual([
      { kind: 'domain', value: 'example.com' },
      { kind: 'ip-cidr', value: '192.0.2.0/24' },
    ])
    expect(result.issues.filter((issue) => issue.code === 'RULE_SOURCE_POLICY_OVERRIDDEN')).toHaveLength(2)
    expect(result.issues.every((issue) => issue.severity !== 'error')).toBe(true)
  })

  it('rejects a policy-less third field instead of routing it through policy override', () => {
    const result = parseContent('payload:\n  - DOMAIN,example.com,Proxy', 'fictional.yaml')
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'RULE_SOURCE_OPTIONS_UNSUPPORTED', severity: 'error', line: 2 }))
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'RULE_SOURCE_POLICY_OVERRIDDEN' }))
  })

  it('fails a mixed policy-less source and preserves the unsupported line number', () => {
    const result = parseContent('payload:\n  - DOMAIN,ok.example\n  - IP-CIDR,203.0.113.0/24,no-resolve\n  - DOMAIN-SUFFIX,after.example', 'fictional.yaml')
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'RULE_SOURCE_OPTIONS_UNSUPPORTED', severity: 'error', line: 3,
    }))
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'RULE_SOURCE_POLICY_OVERRIDDEN', severity: 'warning' }))
  })

  it('accepts a top-level Mihomo payload array only when entries are policy-less', () => {
    const result = parseContent('- DOMAIN,example.com\n- IP-CIDR,192.0.2.0/24', 'fictional.yaml')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.source.matchers).toEqual([
      { kind: 'domain', value: 'example.com' },
      { kind: 'ip-cidr', value: '192.0.2.0/24' },
    ])
  })

  it('rejects modifiers in a top-level Mihomo payload array', () => {
    const result = parseContent('- DOMAIN,example.com\n- IP-CIDR,203.0.113.0/24,no-resolve', 'fictional.yaml')
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'RULE_SOURCE_OPTIONS_UNSUPPORTED', severity: 'error', line: 2,
    }))
  })

  it('rejects ambiguous Mihomo YAML containing both payload and rules arrays', () => {
    const result = parseContent('payload:\n  - DOMAIN,payload.example\nrules:\n  - DOMAIN,rules.example', 'fictional.yaml')
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'RULE_SOURCE_YAML_SHAPE_INVALID', severity: 'error',
    }))
  })

  it('does not ignore a malformed payload key beside a valid rules array', () => {
    const result = parseContent('payload: malformed\nrules:\n  - DOMAIN,rules.example', 'fictional.yaml')
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'RULE_SOURCE_YAML_SHAPE_INVALID', severity: 'error',
    }))
  })

  it('only parses rules from an explicit Surge Rule section', () => {
    const result = parseContent('[General]\nhttp-api = 127.0.0.1\n[Rule]\n# comment\n\nDOMAIN,example.com,Proxy\n[Proxy]\nProxy = http,proxy.example,443', 'fictional.conf')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.matchers).toEqual([{ kind: 'domain', value: 'example.com' }])
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'RULE_SOURCE_POLICY_OVERRIDDEN', severity: 'warning', line: 6 }))
  })

  it('accepts modifier-looking policy names only in explicit full-rule grammar', () => {
    const result = parseContent('[Rule]\nDOMAIN,example.com,extended-matching\nIP-CIDR,192.0.2.0/24,no-resolve', 'fictional.conf')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.matchers).toEqual([
      { kind: 'domain', value: 'example.com' },
      { kind: 'ip-cidr', value: '192.0.2.0/24' },
    ])
    expect(result.issues.filter((issue) => issue.code === 'RULE_SOURCE_POLICY_OVERRIDDEN')).toHaveLength(2)
  })

  it('rejects malformed multi-option entries while retaining the existing safety error', () => {
    const result = parseContent('payload:\n  - IP-CIDR,203.0.113.0/24,no-resolve,extra', 'fictional.yaml')
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'RULE_SOURCE_OPTIONS_UNSUPPORTED', severity: 'error', line: 2,
    }))
  })
})
