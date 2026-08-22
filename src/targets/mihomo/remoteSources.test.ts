import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { explicitProxyIR } from '../../core/__fixtures__/crossTargetFixtures'
import type { ProxyFlowIR, SubscriptionSourceIR } from '../../core/ir'
import { compileSingBox } from '../singbox'
import { compileMihomo } from './compiler'
import type { MihomoConfig } from './model'
import { mihomoRemoteProviderKey } from './remoteSourceAdapter'

function remoteIR(exportMode: 'auto' | 'remote' | 'materialized' = 'auto', requestProfile: 'auto' | 'mihomo' | 'sing-box' | 'generic' = 'auto') {
  const ir = explicitProxyIR()
  const explicit = ir.sources.find((source) => source.id === 'us-source')!
  const source: SubscriptionSourceIR = {
    kind: 'subscription', id: explicit.id, name: explicit.name, url: 'https://example.com/subscription?token=test-token', enabled: true,
    proxies: explicit.kind === 'manual-proxy' ? explicit.proxies.filter((proxy) => proxy.protocol !== 'unmodeled') : [],
    remote: {
      kind: 'remote-subscription', id: explicit.id, name: explicit.name,
      url: 'https://example.com/subscription?token=test-token', requestProfile, exportMode,
      snapshot: { id: 'snapshot-example', contentHash: 'fictional-hash', fetchedAt: '2026-08-22T00:00:00.000Z' },
    },
  }
  ir.sources = ir.sources.map((item) => item.id === source.id ? source : item)
  return ir
}

function mihomo(ir: ProxyFlowIR) {
  const result = compileMihomo(ir, { now: () => new Date('2026-08-22T00:00:00.000Z') })
  expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
  return { result, config: parse(result.content) as MihomoConfig }
}

describe('Mihomo universal remote source lowering', () => {
  it('lowers a direct Auto URL source to one provider and group use without explicit duplication', () => {
    const { result, config } = mihomo(remoteIR())
    const key = mihomoRemoteProviderKey({ id: 'us-source' })
    expect(config['proxy-providers']).toEqual({
      [key]: expect.objectContaining({
        type: 'http', url: 'https://example.com/subscription?token=test-token',
        header: { 'User-Agent': ['Clash.Meta'] }, interval: 21_600,
      }),
    })
    expect(Object.values(config['proxy-providers'] ?? {})[0]).not.toHaveProperty('health-check')
    expect(config['proxy-groups']?.find((group) => group.name === 'US Select')).toEqual(expect.objectContaining({ use: [key] }))
    expect(config['proxy-groups']?.find((group) => group.name === 'US Auto')).toEqual(expect.objectContaining({ use: [key] }))
    expect(config.proxies?.map((proxy) => proxy.name)).not.toEqual(expect.arrayContaining(['US HTTP', 'US SOCKS']))
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'REMOTE_SOURCE_NATIVE', 'REMOTE_SOURCE_RUNTIME_DRIFT', 'REMOTE_SOURCE_URL_EMBEDDED',
    ]))
    for (const issue of result.issues) expect(issue.message).not.toContain('test-token')
  })

  it('keeps Materialized mode explicit even when Mihomo supports providers', () => {
    const { config } = mihomo(remoteIR('materialized'))
    expect(config['proxy-providers']).toBeUndefined()
    expect(config.proxies?.map((proxy) => proxy.name)).toEqual(expect.arrayContaining(['US HTTP', 'US SOCKS']))
    expect(config['proxy-groups']?.find((group) => group.name === 'US Select')).toEqual(expect.objectContaining({ proxies: ['US HTTP', 'US SOCKS'] }))
  })

  it('honors a direct forced Remote source when Mihomo can preserve it exactly', () => {
    const { config } = mihomo(remoteIR('remote', 'mihomo'))
    expect(Object.keys(config['proxy-providers'] ?? {})).toEqual([mihomoRemoteProviderKey({ id: 'us-source' })])
    expect(config.proxies?.map((proxy) => proxy.name)).not.toEqual(expect.arrayContaining(['US HTTP', 'US SOCKS']))
  })

  it('plans a direct branch natively and a processed branch from the same source materially', () => {
    const ir = remoteIR()
    ir.transforms.push({ kind: 'filter', id: 'us-filter', name: 'US filter', input: { kind: 'source', id: 'us-source' }, include: ['HTTP'], exclude: [] })
    ir.strategies.push({ kind: 'select', id: 'filtered', name: 'Filtered', candidates: [{ kind: 'transform', id: 'us-filter' }] })
    const { config } = mihomo(ir)
    const key = mihomoRemoteProviderKey({ id: 'us-source' })
    expect(Object.keys(config['proxy-providers'] ?? {})).toEqual([key])
    expect(config['proxy-groups']?.find((group) => group.name === 'US Select')).toEqual(expect.objectContaining({ use: [key] }))
    expect(config['proxy-groups']?.find((group) => group.name === 'Filtered')).toEqual(expect.objectContaining({ proxies: ['US HTTP'] }))
  })

  it('deduplicates one stable provider across multiple strategies and display-name changes', () => {
    const ir = remoteIR()
    const renamed = structuredClone(ir)
    const source = renamed.sources.find((item) => item.id === 'us-source') as SubscriptionSourceIR
    source.name = 'Renamed display label'
    source.remote!.name = source.name
    const original = mihomo(ir).config
    const changed = mihomo(renamed).config
    expect(Object.keys(original['proxy-providers'] ?? {})).toEqual([mihomoRemoteProviderKey({ id: 'us-source' })])
    expect(Object.keys(changed['proxy-providers'] ?? {})).toEqual(Object.keys(original['proxy-providers'] ?? {}))
  })

  it('materializes Rename in Auto and fails a forced Remote Rename', () => {
    const auto = remoteIR('auto')
    auto.transforms.push({ kind: 'rename', id: 'rename', name: 'Rename', input: { kind: 'source', id: 'us-source' }, pattern: 'US', replacement: 'USA' })
    auto.strategies[1] = { kind: 'select', id: 'us-select', name: 'US Select', candidates: [{ kind: 'transform', id: 'rename' }] }
    auto.strategies[2] = { kind: 'auto-select', id: 'us-auto', name: 'US Auto', source: { kind: 'transform', id: 'rename' } }
    expect(mihomo(auto).config.proxies?.map((proxy) => proxy.name)).toEqual(expect.arrayContaining(['USA HTTP', 'USA SOCKS']))

    const forced = structuredClone(auto)
    ;(forced.sources.find((source) => source.id === 'us-source') as SubscriptionSourceIR).remote!.exportMode = 'remote'
    const result = compileMihomo(forced)
    expect(result).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'REMOTE_SOURCE_PROCESSING_UNSUPPORTED', 'REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED',
    ]))
  })

  it('materializes for sing-box Auto and rejects forced Remote without losing snapshots', () => {
    const auto = compileSingBox(remoteIR('auto'))
    expect(auto.success, auto.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    const config = JSON.parse(auto.content) as { outbounds: Array<{ tag?: string }> }
    expect(config.outbounds.map((outbound) => outbound.tag)).toEqual(expect.arrayContaining(['US HTTP', 'US SOCKS']))
    expect(auto.issues).toContainEqual(expect.objectContaining({ code: 'REMOTE_SOURCE_TARGET_UNSUPPORTED', severity: 'info' }))

    const forced = compileSingBox(remoteIR('remote'))
    expect(forced).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(forced.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'REMOTE_SOURCE_TARGET_UNSUPPORTED', 'REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED',
    ]))
  })

  it.each(['sing-box', 'generic'] as const)('materializes nonportable %s request profile in Auto', (profile) => {
    const { config, result } = mihomo(remoteIR('auto', profile))
    expect(config['proxy-providers']).toBeUndefined()
    expect(config.proxies?.length).toBeGreaterThan(0)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'REMOTE_SOURCE_REQUEST_PROFILE_UNSUPPORTED' }))
  })

  it('uses the same allowlisted Clash.Meta identity for the explicit Mihomo profile', () => {
    const { config } = mihomo(remoteIR('auto', 'mihomo'))
    const provider = Object.values(config['proxy-providers'] ?? {})[0]
    expect(provider?.header).toEqual({ 'User-Agent': ['Clash.Meta'] })
    expect(provider?.header).not.toHaveProperty('Authorization')
  })

  it('fails forced Remote when the request profile is not portable to Mihomo', () => {
    const result = compileMihomo(remoteIR('remote', 'generic'))
    expect(result).toEqual(expect.objectContaining({ success: false, content: '' }))
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'REMOTE_SOURCE_REQUEST_PROFILE_UNSUPPORTED', 'REMOTE_SOURCE_FORCED_BUT_UNSUPPORTED',
    ]))
  })

  it('keeps provider-backed membership equivalent for fallback and load-balance groups', () => {
    const ir = remoteIR()
    ir.strategies.push(
      { kind: 'fallback', id: 'remote-fallback', name: 'Remote Fallback', candidates: [{ kind: 'source', id: 'us-source' }] },
      { kind: 'load-balance', id: 'remote-balance', name: 'Remote Balance', source: { kind: 'source', id: 'us-source' }, mode: 'consistent-hash' },
    )
    const { config } = mihomo(ir)
    const key = mihomoRemoteProviderKey({ id: 'us-source' })
    expect(config['proxy-groups']?.find((group) => group.name === 'Remote Fallback')).toEqual(expect.objectContaining({ type: 'fallback', use: [key] }))
    expect(config['proxy-groups']?.find((group) => group.name === 'Remote Balance')).toEqual(expect.objectContaining({ type: 'load-balance', use: [key], strategy: 'consistent-hashing' }))
  })

  it('materializes remote membership used by a proxy chain', () => {
    const ir = remoteIR()
    ir.strategies.push({ kind: 'chain', id: 'remote-chain', name: 'Remote Chain', hops: [{ kind: 'strategy', id: 'hk-auto' }, { kind: 'strategy', id: 'us-auto' }] })
    ir.finalRoute = { target: { kind: 'strategy', id: 'remote-chain' } }
    const { config } = mihomo(ir)
    expect(Object.keys(config['proxy-providers'] ?? {})).toEqual([mihomoRemoteProviderKey({ id: 'us-source' })])
    expect(config['proxy-groups']?.find((group) => group.name === 'US Select')).toEqual(expect.objectContaining({ use: [mihomoRemoteProviderKey({ id: 'us-source' })] }))
    expect(config['proxy-groups']?.find((group) => group.name === 'US Auto')).toEqual(expect.objectContaining({ proxies: ['US HTTP', 'US SOCKS'] }))
    expect(config.proxies?.map((proxy) => proxy.name)).toEqual(expect.arrayContaining(['US HTTP', 'US SOCKS']))
  })
})
