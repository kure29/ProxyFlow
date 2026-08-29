import { describe, expect, it } from 'vitest'
import type { BlockCategory, BlockNodeData, BlockType, GraphNode } from '../../types/project'
import type { StrategyCandidateRef } from '../ir'
import {
  normalizeSourceNode,
  normalizeStrategyNode,
} from './intentNormalization'

function node(id: string, blockType: BlockType, data: Partial<BlockNodeData> = {}): GraphNode {
  const category: BlockCategory = ['subscription', 'manual-proxy', 'provider', 'import-config'].includes(blockType)
    ? 'source'
    : blockType === 'proxy-chain' ? 'chain' : 'strategy'
  return {
    id,
    type: 'block',
    position: { x: 10, y: 20 },
    data: { blockType, category, title: data.title ?? id, subtitle: '', icon: 'blocks', ...data },
  }
}

describe('editor-to-intent normalization', () => {
  it('normalizes subscription defaults without mutating persisted data', () => {
    const source = node('subscription', 'subscription', { subscriptionUrl: '  https://example.test/list  ' })
    const before = structuredClone(source)

    expect(normalizeSourceNode(source)).toEqual(expect.objectContaining({
      kind: 'subscription', id: 'subscription', name: 'subscription', enabled: true,
      inputKind: 'url', url: 'https://example.test/list', requestProfile: 'auto', exportMode: 'materialized',
      materializationStatus: 'unavailable',
    }))
    expect(source).toEqual(before)
    expect(normalizeSourceNode(source)).toEqual(normalizeSourceNode(source))
  })

  it.each([
    ['http', { proxyProtocol: 'http', proxyServer: '  proxy.example ', proxyPort: 8080, proxyUsername: 'user', proxyPassword: 'pass' }, { kind: 'http', server: 'proxy.example', port: 8080, username: 'user', password: 'pass' }],
    ['shadowsocks', { proxyProtocol: 'shadowsocks', proxyServer: 'ss.example', proxyPort: 443, proxyMethod: '2022-blake3-aes-128-gcm', proxyPassword: 'secret' }, { kind: 'shadowsocks', method: '2022-blake3-aes-128-gcm', password: 'secret' }],
    ['trojan', { proxyProtocol: 'trojan', proxyServer: 'trojan.example', proxyPort: 443, proxyPassword: 'secret', proxyTransport: 'grpc', proxyGrpcServiceName: 'proxy' }, { kind: 'trojan', tls: { enabled: true, serverName: 'trojan.example' }, transport: { kind: 'grpc', serviceName: 'proxy' } }],
    ['vmess', { proxyProtocol: 'vmess', proxyServer: 'vmess.example', proxyPort: 443, proxyUuid: 'uuid', proxyTls: true, proxyTransport: 'ws', proxyTransportPath: '/proxy' }, { kind: 'vmess', uuid: 'uuid', security: 'auto', tls: { enabled: true }, transport: { kind: 'ws', path: '/proxy' } }],
    ['vless', { proxyProtocol: 'vless', proxyServer: 'vless.example', proxyPort: 443, proxyUuid: 'uuid', proxyTls: true }, { kind: 'vless', uuid: 'uuid', tls: { enabled: true } }],
  ] as const)('normalizes manual %s proxy semantics', (_name, data, expected) => {
    const intent = normalizeSourceNode(node('manual', 'manual-proxy', data))
    expect(intent?.kind).toBe('manual-proxy')
    expect(intent?.kind === 'manual-proxy' ? intent.endpoint : undefined).toEqual(expect.objectContaining(expected))
  })

  it('keeps provider/import source variants and rejects non-source blocks', () => {
    expect(normalizeSourceNode(node('provider', 'provider', { subscriptionUrl: 'provider://example' }))).toEqual(expect.objectContaining({
      kind: 'provider', reference: 'provider://example', enabled: true,
    }))
    expect(normalizeSourceNode(node('import', 'import-config'))).toEqual(expect.objectContaining({ kind: 'imported-config' }))
    expect(normalizeSourceNode(node('strategy', 'auto-select'))).toBeUndefined()
  })

  it('normalizes every portable strategy kind without target-native leakage', () => {
    const refs: StrategyCandidateRef[] = [{ kind: 'source', id: 'source' }]
    expect(normalizeStrategyNode(node('fixed', 'fixed-proxy', { proxyId: 'proxy' }))).toEqual(expect.objectContaining({ kind: 'fixed', proxyId: 'proxy' }))
    expect(normalizeStrategyNode(node('select', 'manual-select'), { candidates: refs })).toEqual(expect.objectContaining({ kind: 'select', candidates: refs }))
    expect(normalizeStrategyNode(node('auto', 'auto-select', { testUrl: 'https://probe.test', interval: 120, tolerance: 25 }), { source: { kind: 'source', id: 'source' } })).toEqual(expect.objectContaining({
      kind: 'auto-select', source: { kind: 'source', id: 'source' }, healthCheck: { url: 'https://probe.test', intervalSeconds: 120, toleranceMs: 25 },
    }))
    expect(normalizeStrategyNode(node('fallback', 'fallback'), { candidates: refs })).toEqual(expect.objectContaining({ kind: 'fallback', candidates: refs }))
    expect(normalizeStrategyNode(node('balance', 'load-balance', { loadBalanceMode: 'consistent-hash' }), { source: { kind: 'transform', id: 'transform' } })).toEqual(expect.objectContaining({
      kind: 'load-balance', source: { kind: 'transform', id: 'transform' }, mode: 'consistent-hash',
    }))
    expect(normalizeStrategyNode(node('chain', 'proxy-chain', { hopIds: ['first', 'second'] }))).toEqual(expect.objectContaining({
      kind: 'chain', hops: [{ kind: 'strategy', id: 'first' }, { kind: 'strategy', id: 'second' }],
    }))
    expect(normalizeStrategyNode(node('native', 'target-native-strategy'))).toBeUndefined()
  })
})
