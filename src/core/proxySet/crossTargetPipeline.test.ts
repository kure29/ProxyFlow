import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR, type ResolvedProxyEndpointIR } from '../ir'
import { encodeBase64Text, parseSubscription } from '../subscription'
import { compileMihomo } from '../../targets/mihomo/compiler'
import type { MihomoConfig } from '../../targets/mihomo/model'
import { compileSingBox } from '../../targets/singbox/compiler'
import type { SingBoxConfig } from '../../targets/singbox/model'
import { materializeProxySet } from './materialize'
import hysteria2 from '../../../fixtures/subscriptions/hysteria2.txt?raw'
import mixedModern from '../../../fixtures/subscriptions/mixed-modern.txt?raw'
import modernTransports from '../../../fixtures/subscriptions/modern-transports.txt?raw'
import tuic from '../../../fixtures/subscriptions/tuic.txt?raw'
import vlessReality from '../../../fixtures/subscriptions/vless-reality.txt?raw'

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
    expect(mihomo.proxies).toEqual([expect.objectContaining({ type: 'http', tls: true, sni: 'secure-http.example.com' })])

    const singBoxResult = compileSingBox(ir, { now })
    expect(singBoxResult.success).toBe(true)
    expect(singBoxResult.issues.map((issue) => issue.code)).toContain('SINGBOX_PROXY_VARIANT_UNSUPPORTED')
    const singBox = JSON.parse(singBoxResult.content) as SingBoxConfig
    expect(singBox.outbounds.filter((outbound) => outbound.type === 'http')).toEqual([
      expect.objectContaining({ tls: expect.objectContaining({ enabled: true, server_name: 'secure-http.example.com' }) }),
    ])
  })

  it('lowers complete Reality and Vision semantics independently to both targets', () => {
    const parsed = parseSubscription(vlessReality, { sourceId: 'reality', sourceName: 'Reality' })
    const ir = directIR(parsed.proxies)
    const mihomoResult = compileMihomo(ir, { now })
    expect(mihomoResult.success).toBe(true)
    const mihomo = parseYaml(mihomoResult.content) as MihomoConfig
    expect(mihomo.proxies).toEqual([expect.objectContaining({
      type: 'vless', tls: true, servername: 'www.example.com', 'client-fingerprint': 'chrome',
      'reality-opts': { 'public-key': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'short-id': 'abcd1234' },
    })])

    const singBoxResult = compileSingBox(ir, { now })
    expect(singBoxResult.success).toBe(true)
    const singBox = JSON.parse(singBoxResult.content) as SingBoxConfig
    expect(singBox.outbounds.find((outbound) => outbound.type === 'vless')).toEqual(expect.objectContaining({
      tls: expect.objectContaining({
        server_name: 'www.example.com', utls: { enabled: true, fingerprint: 'chrome' },
        reality: { enabled: true, public_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', short_id: 'abcd1234' },
      }),
    }))
  })

  it('lowers WS early data, gRPC, HTTP/2 and HTTPUpgrade to both targets', () => {
    const content = modernTransports.trim().split('\n').slice(0, 4).join('\n')
    const parsed = parseSubscription(content, { sourceId: 'transports', sourceName: 'Transports' })
    const ir = directIR(parsed.proxies)
    const mihomo = parseYaml(compileMihomo(ir, { now }).content) as MihomoConfig
    expect(mihomo.proxies).toEqual(expect.arrayContaining([
      expect.objectContaining({ network: 'ws', 'ws-opts': expect.objectContaining({ 'max-early-data': 2048, 'early-data-header-name': 'Sec-WebSocket-Protocol' }) }),
      expect.objectContaining({ network: 'grpc', 'grpc-opts': { 'grpc-service-name': 'proxyflow' } }),
      expect.objectContaining({ network: 'h2', 'h2-opts': { path: '/h2', host: ['h2-host.example.com'] } }),
      expect.objectContaining({ network: 'ws', 'ws-opts': expect.objectContaining({ 'v2ray-http-upgrade': true }) }),
    ]))
    const singBox = JSON.parse(compileSingBox(ir, { now }).content) as SingBoxConfig
    expect(singBox.outbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'vless', transport: expect.objectContaining({ type: 'ws', max_early_data: 2048 }) }),
      expect.objectContaining({ type: 'vless', transport: { type: 'grpc', service_name: 'proxyflow' } }),
      expect.objectContaining({ type: 'vless', transport: { type: 'http', path: '/h2', host: ['h2-host.example.com'] } }),
      expect.objectContaining({ type: 'vless', transport: { type: 'httpupgrade', path: '/upgrade', host: 'upgrade-host.example.com' } }),
    ]))
  })

  it('supports XHTTP in Mihomo and fails the sing-box target with a stable compatibility code', () => {
    const xhttp = modernTransports.trim().split('\n').at(-1)!
    const ir = directIR(parseSubscription(xhttp, { sourceId: 'xhttp', sourceName: 'XHTTP' }).proxies)
    const mihomoResult = compileMihomo(ir, { now })
    expect(mihomoResult.success).toBe(true)
    expect((parseYaml(mihomoResult.content) as MihomoConfig).proxies).toContainEqual(expect.objectContaining({
      network: 'xhttp', 'xhttp-opts': { path: '/xhttp', host: 'xhttp-host.example.com', mode: 'stream-up' },
    }))
    const singBoxResult = compileSingBox(ir, { now })
    expect(singBoxResult.success).toBe(false)
    expect(singBoxResult.issues.map((issue) => issue.code)).toContain('SINGBOX_TRANSPORT_XHTTP_UNSUPPORTED')
  })

  it('lowers Hysteria2 and TUIC v5 fields to both target schemas', () => {
    const parsed = parseSubscription(`${hysteria2}\n${tuic}`, { sourceId: 'quic', sourceName: 'QUIC' })
    const ir = directIR(parsed.proxies)
    const mihomo = parseYaml(compileMihomo(ir, { now }).content) as MihomoConfig
    expect(mihomo.proxies).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'hysteria2', password: 'hy2-demo-password', ports: '443,5000-6000', 'hop-interval': 30, obfs: 'salamander' }),
      expect.objectContaining({ type: 'tuic', password: 'tuic-demo-password', 'congestion-controller': 'bbr', 'udp-relay-mode': 'native' }),
    ]))
    const singBox = JSON.parse(compileSingBox(ir, { now }).content) as SingBoxConfig
    expect(singBox.outbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'hysteria2', password: 'hy2-demo-password', server_ports: ['443', '5000:6000'], hop_interval: '30s', obfs: { type: 'salamander', password: 'hy2-obfs-password' } }),
      expect.objectContaining({ type: 'tuic', password: 'tuic-demo-password', congestion_control: 'bbr', udp_relay_mode: 'native' }),
    ]))
  })

  it('lowers TUIC allow_insecure and disable_sni to both targets', () => {
    const parsed = parseSubscription('tuic://99999999-9999-4999-8999-999999999993:demo@tuic.example.com:443?allow_insecure=true&disable_sni=true#TUIC', { sourceId: 'tuic-security', sourceName: 'TUIC Security' })
    const ir = directIR(parsed.proxies)
    const mihomo = parseYaml(compileMihomo(ir, { now }).content) as MihomoConfig
    expect(mihomo.proxies).toContainEqual(expect.objectContaining({ type: 'tuic', 'skip-cert-verify': true, 'disable-sni': true }))
    const singBox = JSON.parse(compileSingBox(ir, { now }).content) as SingBoxConfig
    expect(singBox.outbounds).toContainEqual(expect.objectContaining({
      type: 'tuic', tls: expect.objectContaining({ insecure: true, disable_sni: true }),
    }))
  })

  it('lowers VMess H2 distinctly for both targets', () => {
    const link = 'vmess://eyJ2IjoiMiIsInBzIjoiVk1lc3MgSDIiLCJhZGQiOiJ2bWVzcy1oMi5leGFtcGxlLmNvbSIsInBvcnQiOiI0NDMiLCJpZCI6Ijk5OTk5OTk5LTk5OTktNDk5OS04OTk5LTk5OTk5OTk5OTk5MiIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwidGxzIjoidGxzIiwic25pIjoidm1lc3MtaDIuZXhhbXBsZS5jb20iLCJuZXQiOiJoMiIsImhvc3QiOiJoMi1ob3N0LmV4YW1wbGUuY29tIiwicGF0aCI6Ii9oMiJ9'
    const ir = directIR(parseSubscription(link, { sourceId: 'vmess-h2', sourceName: 'VMess H2' }).proxies)
    const mihomo = parseYaml(compileMihomo(ir, { now }).content) as MihomoConfig
    expect(mihomo.proxies).toContainEqual(expect.objectContaining({ network: 'h2', 'h2-opts': { path: '/h2', host: ['h2-host.example.com'] } }))
    const singBox = JSON.parse(compileSingBox(ir, { now }).content) as SingBoxConfig
    expect(singBox.outbounds).toContainEqual(expect.objectContaining({ type: 'vmess', transport: { type: 'http', path: '/h2', host: ['h2-host.example.com'] } }))
  })

  it('lowers a valid VMess client fingerprint to both target TLS schemas', () => {
    const link = `vmess://${encodeBase64Text(JSON.stringify({
      v: '2', ps: 'VMess Fingerprint', add: 'vmess-fp.example.com', port: '443',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', aid: '0', scy: 'auto', tls: 'tls', fp: 'chrome', net: 'tcp',
    }))}`
    const ir = directIR(parseSubscription(link, { sourceId: 'vmess-fp', sourceName: 'VMess Fingerprint' }).proxies)
    const mihomo = parseYaml(compileMihomo(ir, { now }).content) as MihomoConfig
    expect(mihomo.proxies).toContainEqual(expect.objectContaining({ type: 'vmess', tls: true, 'client-fingerprint': 'chrome' }))
    const singBox = JSON.parse(compileSingBox(ir, { now }).content) as SingBoxConfig
    expect(singBox.outbounds).toContainEqual(expect.objectContaining({
      type: 'vmess', tls: expect.objectContaining({ enabled: true, utls: { enabled: true, fingerprint: 'chrome' } }),
    }))
  })

  it('lowers random Hysteria2 hop interval only where the target supports it', () => {
    const parsed = parseSubscription('hysteria2://demo@hy2.example.com:443,5000-6000/?hop-interval=15-30#Random', { sourceId: 'hy2-random', sourceName: 'HY2 Random' })
    const ir = directIR(parsed.proxies)
    const mihomoResult = compileMihomo(ir, { now })
    expect(mihomoResult.success).toBe(true)
    expect((parseYaml(mihomoResult.content) as MihomoConfig).proxies).toContainEqual(expect.objectContaining({ 'hop-interval': '15-30' }))
    const singBoxResult = compileSingBox(ir, { now })
    expect(singBoxResult.success).toBe(false)
    expect(singBoxResult.issues.map((issue) => issue.code)).toContain('SINGBOX_HYSTERIA2_RANDOM_HOP_INTERVAL_UNSUPPORTED')
  })

  it('keeps a mixed modern subscription deterministic across both compilers', () => {
    const parsed = parseSubscription(mixedModern, { sourceId: 'mixed-modern', sourceName: 'Mixed Modern' })
    expect(parsed.readyCount).toBe(4)
    const ir = directIR(parsed.proxies)
    const mihomo = compileMihomo(ir, { now })
    const singBox = compileSingBox(ir, { now })
    expect([mihomo.success, singBox.success]).toEqual([true, true])
    for (let index = 0; index < 50; index += 1) {
      expect(compileMihomo(ir, { now }).content).toBe(mihomo.content)
      expect(compileSingBox(ir, { now }).content).toBe(singBox.content)
    }
  })

  it('keeps a Partial endpoint out of target output through source, transform, strategy, and chain paths', () => {
    const parsed = parseSubscription([
      'socks5://demo:pass@entry.example.com:1080#Entry',
      'http://demo:pass@exit.example.com:8080#Exit',
      'vless://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@blocked.example.com:443?security=none&sni=www.example.com&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA#Blocked',
    ].join('\n'), { sourceId: 'firewall', sourceName: 'Firewall' })
    expect(parsed.partialCount).toBe(1)
    const ir = directIR(parsed.proxies)
    ir.transforms = [{ kind: 'rename', id: 'rename', name: 'Rename', input: { kind: 'source', id: 'source' }, pattern: 'Exit', replacement: 'Exit Renamed' }]
    ir.strategies = [
      { kind: 'auto-select', id: 'entry', name: 'Entry', source: { kind: 'source', id: 'source' } },
      { kind: 'auto-select', id: 'exit', name: 'Exit', source: { kind: 'transform', id: 'rename' } },
      { kind: 'chain', id: 'chain', name: 'Chain', hops: [{ kind: 'strategy', id: 'entry' }, { kind: 'strategy', id: 'exit' }] },
    ]
    ir.finalRoute = { target: { kind: 'strategy', id: 'chain' } }

    const mihomo = compileMihomo(ir, { now })
    const singBox = compileSingBox(ir, { now })
    expect([mihomo.success, singBox.success]).toEqual([true, true])
    expect(mihomo.content).not.toContain('blocked.example.com')
    expect(singBox.content).not.toContain('blocked.example.com')
    expect(mihomo.issues.map((issue) => issue.code)).toContain('MIHOMO_PROXY_VARIANT_UNSUPPORTED')
    expect(singBox.issues.map((issue) => issue.code)).toContain('SINGBOX_PROXY_VARIANT_UNSUPPORTED')
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
