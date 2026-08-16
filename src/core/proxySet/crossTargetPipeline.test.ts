import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type ResolvedProxyEndpointIR } from '../ir'
import { parseSubscription } from '../subscription'
import { compileMihomo } from '../../targets/mihomo/compiler'
import type { MihomoConfig } from '../../targets/mihomo/model'
import { compileSingBox } from '../../targets/singbox/compiler'
import type { SingBoxConfig } from '../../targets/singbox/model'
import { materializeProxySet } from './materialize'

const now = () => new Date('2026-08-16T00:00:00.000Z')

describe('real subscription cross-target pipeline', () => {
  it('parses 126 nodes and executes 126 → 24 → 21 → 10 before both compilers', () => {
    const parsed = parseSubscription(make126NodeSubscription(), { sourceId: 'subscription', sourceName: 'Airport Fixture' })
    expect(parsed.detectedCount).toBe(126)
    const ir = pipelineIR(parsed.proxies)
    const filtered = materializeProxySet(ir, { kind: 'transform', id: 'hk-filter' })
    const deduped = materializeProxySet(ir, { kind: 'transform', id: 'dedupe' })
    const limited = materializeProxySet(ir, { kind: 'transform', id: 'limit' })
    expect([filtered.outputCount, deduped.outputCount, limited.outputCount]).toEqual([24, 21, 10])

    const mihomo = compileMihomo(ir, { now })
    expect(mihomo.success, mihomo.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    const mihomoConfig = parseYaml(mihomo.content) as MihomoConfig
    expect(mihomoConfig.proxies).toHaveLength(10)
    expect(mihomoConfig['proxy-groups']?.[0]).toEqual(expect.objectContaining({ type: 'url-test', proxies: expect.any(Array) }))

    const singBox = compileSingBox(ir, { now })
    expect(singBox.success, singBox.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    const singBoxConfig = JSON.parse(singBox.content) as SingBoxConfig
    expect(singBoxConfig.outbounds.filter((outbound) => outbound.type === 'http')).toHaveLength(10)
    expect(singBoxConfig.outbounds).toContainEqual(expect.objectContaining({ type: 'urltest', outbounds: expect.any(Array) }))
  })

  it('maps Shadowsocks, Trojan, VMess and VLESS semantics to both targets', () => {
    const content = [
      'ss://YWVzLTEyOC1nY206ZGVtby1wYXNz@ss.example.com:8388#SS',
      'trojan://demo-pass@trojan.example.com:443?sni=trojan.example.com&type=tcp#Trojan',
      'vmess://eyJ2IjoiMiIsInBzIjoiVk1lc3MiLCJhZGQiOiJ2bWVzcy5leGFtcGxlLmNvbSIsInBvcnQiOiI0NDMiLCJpZCI6Ijk5OTk5OTk5LTk5OTktNDk5OS04OTk5LTk5OTk5OTk5OTk5OSIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwidGxzIjoidGxzIiwic25pIjoidm1lc3MuZXhhbXBsZS5jb20iLCJuZXQiOiJ0Y3AifQ==',
      'vless://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@vless.example.com:443?security=tls&sni=vless.example.com&type=grpc&serviceName=proxyflow#VLESS',
    ].join('\n')
    const parsed = parseSubscription(content, { sourceId: 'protocols', sourceName: 'Protocols' })
    const ir = directIR(parsed.proxies)
    const mihomo = parseYaml(compileMihomo(ir, { now }).content) as MihomoConfig
    expect(mihomo.proxies?.map((proxy) => proxy.type)).toEqual(['ss', 'trojan', 'vmess', 'vless'])
    expect(mihomo.proxies?.find((proxy) => proxy.type === 'vmess')).toEqual(expect.objectContaining({ uuid: '99999999-9999-4999-8999-999999999999', tls: true, alterId: 0 }))
    const singBox = JSON.parse(compileSingBox(ir, { now }).content) as SingBoxConfig
    expect(singBox.outbounds.filter((outbound) => ['shadowsocks', 'trojan', 'vmess', 'vless'].includes(outbound.type)).map((outbound) => outbound.type)).toEqual(['shadowsocks', 'trojan', 'vmess', 'vless'])
    expect(singBox.outbounds.find((outbound) => outbound.type === 'vless')).toEqual(expect.objectContaining({ tls: expect.objectContaining({ enabled: true }), transport: expect.objectContaining({ type: 'grpc' }) }))
  })

  it('maps HTTPS proxy TLS and excludes partial variants without blocking ready nodes', () => {
    const content = [
      'https://demo:pass@secure-http.example.com:443#HTTPS',
      'vless://88888888-8888-4888-8888-888888888888@reality.example.com:443?security=reality&flow=xtls-rprx-vision&pbk=fake&sid=abcd#Reality',
    ].join('\n')
    const parsed = parseSubscription(content, { sourceId: 'protocols', sourceName: 'Protocols' })
    expect(parsed.partialCount).toBe(1)
    const ir = directIR(parsed.proxies)

    const mihomoResult = compileMihomo(ir, { now })
    expect(mihomoResult.success).toBe(true)
    expect(mihomoResult.issues.map((issue) => issue.code)).toContain('MIHOMO_PROXY_VARIANT_UNSUPPORTED')
    const mihomo = parseYaml(mihomoResult.content) as MihomoConfig
    expect(mihomo.proxies).toEqual([expect.objectContaining({ type: 'http', tls: true, servername: 'secure-http.example.com' })])

    const singBoxResult = compileSingBox(ir, { now })
    expect(singBoxResult.success).toBe(true)
    expect(singBoxResult.issues.map((issue) => issue.code)).toContain('SINGBOX_PROXY_VARIANT_UNSUPPORTED')
    const singBox = JSON.parse(singBoxResult.content) as SingBoxConfig
    expect(singBox.outbounds.filter((outbound) => outbound.type === 'http')).toEqual([
      expect.objectContaining({ tls: expect.objectContaining({ enabled: true, server_name: 'secure-http.example.com' }) }),
    ])
  })

  it.each([100, 500, 1000])('parses and processes %i nodes without changing count', (count) => {
    const content = Array.from({ length: count }, (_, index) => `http://demo:pass@node-${index}.example.com:8080#US%20Node%20${index}`).join('\n')
    const parsed = parseSubscription(content, { sourceId: `perf-${count}`, sourceName: 'Performance' })
    const ir = directIR(parsed.proxies)
    expect(materializeProxySet(ir, { kind: 'source', id: 'source' }).outputCount).toBe(count)
  })
})

function pipelineIR(proxies: ResolvedProxyEndpointIR[]): ProxyFlowIR {
  return {
    ...directIR(proxies),
    transforms: [
      { kind: 'filter', id: 'hk-filter', name: 'HK Filter', input: { kind: 'source', id: 'source' }, include: [], exclude: [], includeRegions: ['HK'] },
      { kind: 'deduplicate', id: 'dedupe', name: 'Dedupe', input: { kind: 'transform', id: 'hk-filter' }, by: 'identity' },
      { kind: 'limit', id: 'limit', name: 'Limit', input: { kind: 'transform', id: 'dedupe' }, max: 10 },
    ],
    strategies: [{ kind: 'auto-select', id: 'auto', name: 'HK Auto', source: { kind: 'transform', id: 'limit' } }],
  }
}

function directIR(proxies: ResolvedProxyEndpointIR[]): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'cross-target-subscription', projectName: 'Cross Target Subscription', projectSchemaVersion: 2 },
    sources: [{ kind: 'subscription', id: 'source', name: 'Materialized Source', enabled: true, proxies, materialization: { status: 'ready' } }],
    transforms: [], strategies: [{ kind: 'auto-select', id: 'auto', name: 'Auto', source: { kind: 'source', id: 'source' } }],
    services: [], routes: [], finalRoute: { target: { kind: 'strategy', id: 'auto' } },
    outputs: [{ id: 'mihomo', name: 'Mihomo', target: 'mihomo', enabled: true }, { id: 'singbox', name: 'sing-box', target: 'sing-box', enabled: true }],
  }
}

function make126NodeSubscription() {
  const hkUnique = Array.from({ length: 21 }, (_, index) => `http://demo:pass@hk-${index}.example.com:8080#🇭🇰%20香港%20${index}`)
  const hkDuplicates = [0, 1, 2].map((index) => `http://demo:pass@hk-${index}.example.com:8080#🇭🇰%20香港%20Duplicate%20${index}`)
  const us = Array.from({ length: 102 }, (_, index) => `http://demo:pass@us-${index}.example.com:8080#🇺🇸%20美国%20${index}`)
  return [...hkUnique, ...hkDuplicates, ...us].join('\n')
}
