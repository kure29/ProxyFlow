import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

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

  it('is deterministic and does not rewrite goldens in verification mode', async () => {
    const first = await execFileAsync(process.execPath, [script], { cwd: root })
    const second = await execFileAsync(process.execPath, [script], { cwd: root })
    expect(first.stdout).toBe(second.stdout)
    expect(first.stderr).toBe('')
    expect(second.stderr).toBe('')
  }, 20_000)
})
