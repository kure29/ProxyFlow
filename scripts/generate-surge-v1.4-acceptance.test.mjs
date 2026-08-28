import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { parseSubscription } from '../src/core/subscription/parseSubscription.ts'
import {
  assertCoreStrategySurface,
  assertGeneratedProxyHostSafety,
  assertMaterializedProxySafety,
} from './generate-surge-v1.4-acceptance.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = path.join(root, 'fixtures/surge/v1.4-acceptance')
const script = path.join(root, 'scripts/generate-surge-v1.4-acceptance.mjs')
const execFileAsync = promisify(execFile)
const deferredKeys = [
  'test-timeout',
  'proxy-test-udp',
  'hijack-dns',
  'allow-dns-svcb',
  'encrypted-dns-follow-outbound-mode',
  'use-local-host-item-for-proxy',
  'udp-policy-not-supported-behaviour',
  'block-quic',
  'loglevel',
]

function generalKeys(content) {
  const general = content.split('[General]\n')[1]?.split('\n\n[Proxy]')[0] ?? ''
  return general.split('\n').filter(Boolean).map((line) => line.split(' = ', 1)[0])
}

function parsedSubscriptionSources(content) {
  const result = parseSubscription(content, {
    sourceId: 'fixture-safety-source',
    sourceName: 'Fixture Safety Source',
  })
  expect(result.readyCount).toBe(1)
  return [{
    kind: 'subscription',
    id: 'fixture-safety-source',
    name: 'Fixture Safety Source',
    enabled: true,
    proxies: result.proxies,
    materialization: { status: 'ready' },
  }]
}

describe('Surge 1.4 acceptance package', () => {
  it('verifies all manifest scenarios through the production compiler path', async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script], { cwd: root })
    expect(stderr).toBe('')
    expect(stdout).toContain('SURGE_ACCEPTANCE_VERIFIED scenarioCount=5')
    expect(stdout).not.toContain(root)
    const manifest = JSON.parse(await readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
    expect(manifest.scenarios).toHaveLength(5)
    for (const scenario of manifest.scenarios) {
      const project = JSON.parse(await readFile(path.join(fixtureRoot, scenario.project), 'utf8'))
      const profile = await readFile(path.join(fixtureRoot, scenario.expected), 'utf8')
      expect(project.primaryTarget).toBe('surge')
      expect(profile).toMatch(/^\[General\]/)
      expect(profile).toMatch(/\n\[Proxy\]/)
      expect(profile).toMatch(/\n\[Proxy Group\]/)
      expect(profile).toMatch(/\n\[Rule\]/)
      expect(generalKeys(profile)).toEqual(scenario.expectedGeneralKeys)
      expect(deferredKeys.some((key) => generalKeys(profile).includes(key))).toBe(false)
      expect(profile).not.toMatch(/https?:\/\/[^\s,=]+@/)
      expect(profile).not.toMatch(/\b(?:10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)\b/)
      expect(() => assertGeneratedProxyHostSafety(profile, scenario.id)).not.toThrow()
    }
  }, 20_000)

  it('keeps ownership-specific keys in their intended scenarios', async () => {
    const manifest = JSON.parse(await readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
    const profiles = new Map()
    for (const scenario of manifest.scenarios) profiles.set(scenario.id, await readFile(path.join(fixtureRoot, scenario.expected), 'utf8'))
    expect(generalKeys(profiles.get('02-general-connectivity'))).toEqual([
      'proxy-test-url', 'internet-test-url', 'ipv6', 'ipv6-vif', 'icmp-forwarding',
    ])
    expect(generalKeys(profiles.get('03-dns-behavior'))).toEqual(['proxy-test-url', 'always-real-ip'])
    expect(generalKeys(profiles.get('04-vif-routes'))).toEqual([
      'proxy-test-url', 'ipv6', 'ipv6-vif', 'icmp-forwarding', 'tun-excluded-routes', 'tun-included-routes',
    ])
    expect(generalKeys(profiles.get('05-proxy-bypass'))).toEqual([
      'proxy-test-url', 'skip-proxy', 'exclude-simple-hostnames',
    ])
    expect(profiles.get('01-core')).toContain('encrypted-dns-server = https://1.1.1.1/dns-query')
    expect(profiles.get('01-core')).toContain('Native Smart = smart')
    expect(profiles.get('01-core')).toContain('Native Subnet = subnet')
  })

  it('proves all seven distinct core strategy surfaces by stable group name', async () => {
    const project = JSON.parse(await readFile(path.join(fixtureRoot, '01-core.project.json'), 'utf8'))
    const profile = await readFile(path.join(fixtureRoot, '01-core.conf'), 'utf8')
    const blockTypeByTitle = new Map(project.graph.nodes.map((node) => [node.data.title, node.data.blockType]))
    expect(blockTypeByTitle.get('Manual Select')).toBe('manual-select')
    expect(blockTypeByTitle.get('Manual Fixed')).toBe('fixed-proxy')
    expect(() => assertCoreStrategySurface(profile)).not.toThrow()
    expect(profile).toContain('Snapshot Auto = url-test, HK Snapshot A, HK Snapshot B')
    expect(profile).toContain('Manual Select = select, Manual HTTPS Egress, Fallback Egress')
    expect(profile).toContain('Fallback = fallback, Fallback Egress, Manual HTTPS Egress')
    expect(profile).toContain('Manual Fixed = select, Manual HTTPS Egress')
    expect(profile).toContain('Native Smart = smart, Manual HTTPS Egress, Fallback Egress')
    expect(profile).toContain('Native Subnet = subnet')
    expect(profile).toContain('Release Chain = select, Manual HTTPS Egress, underlying-proxy=Snapshot Auto')
    expect(profile).toContain('DOMAIN-SUFFIX,select.example.org,Manual Select')
  })

  it('rejects subscription-derived real hosts and non-fixture credentials after production parsing', () => {
    const realHost = 'real-host.example.com'
    const realUser = 'real-user'
    const realSecret = 'real-secret'
    const unsafeHostSources = parsedSubscriptionSources(
      `socks5://fixture-user:fixture-pass@${realHost}:1080`,
    )
    const unsafeCredentialSources = parsedSubscriptionSources(
      `socks5://${realUser}:${realSecret}@fixture-host.example.invalid:1080`,
    )
    const safeSources = parsedSubscriptionSources(
      'socks5://fixture-user:fixture-pass@fixture-host.example.invalid:1080',
    )

    expect(() => assertMaterializedProxySafety(unsafeHostSources, 'adversarial-host'))
      .toThrow('SURGE_ACCEPTANCE_PROXY_HOST_NOT_FIXTURE adversarial-host')
    expect(() => assertMaterializedProxySafety(unsafeCredentialSources, 'adversarial-credential'))
      .toThrow('SURGE_ACCEPTANCE_PROXY_CREDENTIAL_NOT_FIXTURE adversarial-credential')
    expect(() => assertMaterializedProxySafety(safeSources, 'safe-fixture')).not.toThrow()

    for (const rejectedValue of [realHost, realUser, realSecret]) {
      try {
        assertMaterializedProxySafety(
          rejectedValue === realHost ? unsafeHostSources : unsafeCredentialSources,
          'redaction-check',
        )
      } catch (error) {
        expect(String(error)).not.toContain(rejectedValue)
      }
    }
  })

  it('rejects a generated Proxy host outside the fixture boundary without logging it', () => {
    const rejectedHost = 'generated-real.example.com'
    const profile = `[Proxy]\nNode = socks5, ${rejectedHost}, 1080\n\n[Proxy Group]\nSelect = select, Node\n`
    let failure
    try {
      assertGeneratedProxyHostSafety(profile, 'generated-host')
    } catch (error) {
      failure = error
    }
    expect(String(failure)).toContain('SURGE_ACCEPTANCE_GENERATED_PROXY_HOST_NOT_FIXTURE generated-host')
    expect(String(failure)).not.toContain(rejectedHost)
  })

  it('is deterministic and does not rewrite goldens in verification mode', async () => {
    const first = await execFileAsync(process.execPath, [script], { cwd: root })
    const second = await execFileAsync(process.execPath, [script], { cwd: root })
    expect(first.stdout).toBe(second.stdout)
    expect(first.stderr).toBe('')
    expect(second.stderr).toBe('')
  }, 20_000)
})
