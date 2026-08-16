import { describe, expect, it } from 'vitest'
import { diffSubscriptionSnapshots } from './diff'
import { parseSubscription } from './parseSubscription'
import { commitCandidate } from './refreshCoordinator'
import { createSnapshotCandidate } from './snapshot'

const sourceId = 'subscription-a'
const uuid = '11111111-1111-4111-8111-111111111111'
const realityKey = 'A'.repeat(43)

describe('subscription lifecycle diff', () => {
  it('represents the first refresh as an initial baseline instead of Added entries', async () => {
    const next = await candidate(vless())
    expect(await diffSubscriptionSnapshots(undefined, next)).toEqual(expect.objectContaining({
      isInitialBaseline: true, entries: [], added: 0, removed: 0, changed: 0, unchanged: 0,
    }))
  })

  it('detects added and removed nodes', async () => {
    const oldSnapshot = await snapshot(vless({ name: 'Old' }))
    const next = await candidate(vless({ name: 'New', server: 'other.example.invalid', uuid: '22222222-2222-4222-8222-222222222222' }))
    const diff = await diffSubscriptionSnapshots(oldSnapshot, next)
    expect(diff).toEqual(expect.objectContaining({ added: 1, removed: 1, changed: 0, unchanged: 0 }))
  })

  it('detects a rename without using display metadata as primary identity', async () => {
    const diff = await compare(vless({ name: 'Node One' }), vless({ name: 'Node Renamed' }))
    expect(diff.entries).toContainEqual(expect.objectContaining({ kind: 'changed', changeTypes: ['renamed'], changedFields: ['name'] }))
  })

  it('detects authentication changes without exposing credential values', async () => {
    const oldBody = http({ password: 'fictional-old-password' })
    const nextBody = http({ password: 'fictional-new-password' })
    const diff = await compare(oldBody, nextBody)
    expect(diff.entries).toContainEqual(expect.objectContaining({ kind: 'changed', changeTypes: ['authentication'] }))
    const serialized = JSON.stringify(diff)
    expect(serialized).not.toContain('fictional-old-password')
    expect(serialized).not.toContain('fictional-new-password')
  })

  it.each([
    ['server', vless(), vless({ server: 'new.example.invalid' }), 'server'],
    ['port', vless(), vless({ port: 8443 }), 'port'],
    ['protocol', vless(), vmess(), 'protocol'],
    ['TLS', vless({ tls: true }), vless({ tls: false }), 'connection-settings'],
    ['transport', vless({ network: 'ws', path: '/old' }), vless({ network: 'grpc', serviceName: 'new-service' }), 'connection-settings'],
    ['Reality', vless({ reality: false }), vless({ reality: true }), 'connection-settings'],
  ])('detects %s connection changes', async (_label, oldBody, nextBody, field) => {
    const diff = await compare(oldBody, nextBody)
    expect(diff.entries[0]).toEqual(expect.objectContaining({ kind: 'changed', changeTypes: expect.arrayContaining(['connection']), changedFields: expect.arrayContaining([field]) }))
  })

  it('detects AnyTLS session changes', async () => {
    const diff = await compare(anytls(30), anytls(60))
    expect(diff.entries).toContainEqual(expect.objectContaining({ kind: 'changed', changeTypes: ['connection'], changedFields: ['connection-settings'] }))
  })

  it('detects readiness and metadata changes and preserves unchanged nodes', async () => {
    const oldSnapshot = await snapshot(vless())
    const unchanged = await candidate(vless())
    expect(await diffSubscriptionSnapshots(oldSnapshot, unchanged)).toEqual(expect.objectContaining({ unchanged: 1, changed: 0 }))

    const next = await candidate(vless({ flow: 'unsupported-flow' }))
    const changed = await diffSubscriptionSnapshots(oldSnapshot, next)
    expect(changed.entries[0].changeTypes).toEqual(expect.arrayContaining(['metadata', 'readiness']))
  })

  it('degrades ambiguous identity matches to Removed and Added', async () => {
    const duplicated = combine(http({ name: 'First' }), http({ name: 'Second' }))
    const renamed = duplicated.replace('First', 'First New').replace('Second', 'Second New')
    const diff = await compare(duplicated, renamed)
    expect(diff).toEqual(expect.objectContaining({ added: 2, removed: 2, changed: 0 }))
    expect(diff.issues.map((issue) => issue.code)).toContain('SUBSCRIPTION_IDENTITY_AMBIGUOUS')
  })

  it('is deterministic across repeated comparisons', async () => {
    const oldSnapshot = await snapshot(combine(vless(), http({ name: 'HTTP One' })))
    const next = await candidate(combine(vless({ name: 'Renamed' }), http({ name: 'HTTP One', password: 'changed' })))
    const baseline = JSON.stringify(await diffSubscriptionSnapshots(oldSnapshot, next))
    for (let index = 0; index < 20; index += 1) expect(JSON.stringify(await diffSubscriptionSnapshots(oldSnapshot, next))).toBe(baseline)
  })
})

async function compare(oldBody: string, newBody: string) {
  return diffSubscriptionSnapshots(await snapshot(oldBody), await candidate(newBody))
}

async function snapshot(body: string) {
  return commitCandidate(await candidate(body), '2026-08-15T00:00:00.000Z')
}

async function candidate(body: string) {
  const result = parseSubscription(body, { sourceId, sourceName: 'Test Subscription' })
  return createSnapshotCandidate({
    sourceId, inputKind: 'url', sourceConfigFingerprint: 'fingerprint-a', content: body, result,
    fetchedAt: '2026-08-15T00:00:00.000Z', parsedAt: '2026-08-15T00:00:01.000Z',
  })
}

function vless(options: { name?: string; server?: string; port?: number; uuid?: string; tls?: boolean; network?: string; path?: string; serviceName?: string; reality?: boolean; flow?: string } = {}) {
  const tls = options.tls ?? true
  const network = options.network ?? 'ws'
  return `proxies:
  - name: ${options.name ?? 'SG 01'}
    type: vless
    server: ${options.server ?? 'edge.example.invalid'}
    port: ${options.port ?? 443}
    uuid: ${options.uuid ?? uuid}
    tls: ${tls}
    security: ${options.reality ? 'reality' : tls ? 'tls' : 'none'}
    ${options.flow ? `flow: ${options.flow}` : ''}
    sni: edge.example.invalid
    ${options.reality ? `reality-opts:\n      public-key: ${realityKey}\n      short-id: a1b2` : ''}
    network: ${network}
    ${network === 'ws' || network === 'xhttp' ? `${network}-opts:\n      path: ${options.path ?? '/proxy'}` : ''}
    ${network === 'grpc' ? `grpc-opts:\n      grpc-service-name: ${options.serviceName ?? 'proxy'}` : ''}`
}

function vmess() {
  return `proxies:
  - name: SG 01
    type: vmess
    server: edge.example.invalid
    port: 443
    uuid: ${uuid}
    cipher: auto
    tls: true
    sni: edge.example.invalid
    network: ws
    ws-opts:
      path: /proxy`
}

function http(options: { name?: string; password?: string } = {}) {
  return `proxies:
  - name: ${options.name ?? 'HTTP One'}
    type: http
    server: http.example.invalid
    port: 8080
    username: fictional-user
    password: ${options.password ?? 'fictional-password'}`
}

function anytls(interval: number) {
  return `proxies:
  - name: AnyTLS One
    type: anytls
    server: anytls.example.invalid
    port: 443
    password: fictional-anytls-password
    sni: anytls.example.invalid
    idle-session-check-interval: ${interval}
    idle-session-timeout: 30
    min-idle-session: 1`
}

function combine(...bodies: string[]) {
  return `proxies:\n${bodies.map((body) => body.replace(/^proxies:\n/, '')).join('\n')}`
}
