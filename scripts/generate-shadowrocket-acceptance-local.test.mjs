import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'scripts/generate-shadowrocket-acceptance-local.mjs')
const execFileAsync = promisify(execFile)
const privateInput = [
  'proxies:',
  '  - name: Private One',
  '    type: http',
  '    server: private-one.example.invalid',
  '    port: 8080',
  '    username: private-user',
  '    password: private-password',
  '  - name: Private Two',
  '    type: http',
  '    server: private-two.example.invalid',
  '    port: 8081',
  '    username: private-user-2',
  '    password: private-password-2',
].join('\n')

describe('Shadowrocket local acceptance CLI safety contract', () => {
  it('writes private output outside the repository with mode 0600 and aggregate-only logs', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'proxyflow-shadowrocket-input-'))
    const inputPath = path.join(tempDir, 'private-subscription.yaml')
    await writeFile(inputPath, privateInput, { encoding: 'utf8', mode: 0o600 })
    await chmod(inputPath, 0o600)
    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, [script, '--input', inputPath, '--profile', 'core'], { cwd: root })
      expect(stderr).toBe('')
      expect(stdout).toContain('status=COMPILED_LOCAL_ONLY')
      expect(stdout).toContain('sha256=')
      expect(stdout).not.toContain('private-one.example.invalid')
      expect(stdout).not.toContain('private-password')
      expect(stdout).not.toContain('private-user')
      const artifactPath = stdout.match(/artifact=(\S+) sha256=/)?.[1]
      expect(artifactPath).toBeTruthy()
      expect(path.relative(root, artifactPath)).toMatch(/^\.\./)
      const artifactInfo = await stat(artifactPath)
      expect(artifactInfo.mode & 0o777).toBe(0o600)
      const artifact = await readFile(artifactPath, 'utf8')
      expect(artifact).toContain('private-one.example.invalid')
      expect(artifact).toContain('private-password')
      const expectedSha = createHash('sha256').update(artifact, 'utf8').digest('hex')
      expect(stdout).toContain(`sha256=${expectedSha}`)

      const outputDir = path.dirname(artifactPath)
      await writeFile(path.join(outputDir, 'stale-private-artifact.conf'), 'stale', { mode: 0o600 })
      await execFileAsync(process.execPath, [script, '--input', inputPath, '--profile', 'core'], { cwd: root })
      await expect(stat(path.join(outputDir, 'stale-private-artifact.conf'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }, 20_000)

  it('rejects malformed and repository paths without printing private input', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'proxyflow-shadowrocket-input-'))
    const malformedPath = path.join(tempDir, 'malformed.txt')
    await writeFile(malformedPath, 'not a supported subscription', { mode: 0o600 })
    try {
      await expect(execFileAsync(process.execPath, [script, '--input', malformedPath, '--profile', 'core'], { cwd: root }))
        .rejects.toMatchObject({ stdout: expect.stringContaining('SHADOWROCKET_LOCAL_INPUT_BLOCKED') })
      await expect(execFileAsync(process.execPath, [script, '--input', path.join(root, 'fixtures/shadowrocket/minimal.conf'), '--profile', 'core'], { cwd: root }))
        .rejects.toMatchObject({ stderr: expect.stringContaining('SHADOWROCKET_LOCAL_INPUT_PATH_INVALID') })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }, 20_000)

  it('generates controlled routing and DNS profiles without private input or network access', async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, '--profile', 'routing'], { cwd: root })
    expect(stderr).toBe('')
    expect(stdout).toContain('profile=routing-geoip-only status=COMPILED_LOCAL_ONLY')
    expect(stdout).toContain('profile=routing-ipcidr-only status=COMPILED_LOCAL_ONLY')
    expect(stdout).toContain('behavioralEvidence=SYNTAX_IMPORT_ONLY')
    expect(stdout).not.toContain('http://')
    expect(stdout).not.toContain('https://')

    const custom = await execFileAsync(process.execPath, [
      script,
      '--profile', 'routing',
      '--routing-domain', 'controlled.example',
      '--routing-ipv4', '198.51.100.9',
      '--routing-ipv6', '2001:db8:1::9',
      '--routing-geoip-country', 'CA',
    ], { cwd: root })
    expect(custom.stderr).toBe('')
    expect(custom.stdout).toContain('behavioralEvidence=HUMAN_INPUT_READY')
    expect(custom.stdout).not.toContain('controlled.example')
    expect(custom.stdout).not.toContain('198.51.100.9')
    expect(custom.stdout).not.toContain('2001:db8:1::9')

    const partial = await execFileAsync(process.execPath, [
      script,
      '--profile', 'routing-overlap',
      '--routing-domain', 'controlled.example',
      '--routing-ipv4', '198.51.100.9',
      '--routing-geoip-country', 'CA',
    ], { cwd: root }).catch((error) => error)
    expect(partial.stderr).toBe('')
    expect(partial.stdout).toContain('SHADOWROCKET_LOCAL_BLOCKED')
    expect(partial.stdout).toContain('behavioralEvidence=PARTIAL_HUMAN_INPUT_READY')
    expect(partial.stdout).toContain('DOMAIN:HUMAN_INPUT_READY')
    expect(partial.stdout).toContain('DOMAIN_SUFFIX:HUMAN_INPUT_READY')
    expect(partial.stdout).toContain('IP_CIDR:HUMAN_INPUT_READY')
    expect(partial.stdout).toContain('IP_CIDR6:SYNTAX_IMPORT_ONLY')
    expect(partial.stdout).toContain('GEOIP:HUMAN_INPUT_READY')
    expect(partial.stdout).not.toContain('controlled.example')
    expect(partial.stdout).not.toContain('198.51.100.9')

    const geoipProbe = await execFileAsync(process.execPath, [
      script,
      '--profile', 'routing-geoip-only',
      '--routing-ipv4', '219.78.242.109',
      '--routing-geoip-country', 'HK',
    ], { cwd: root })
    expect(geoipProbe.stderr).toBe('')
    expect(geoipProbe.stdout).toContain('profile=routing-geoip-only candidateCount=0')
    expect(geoipProbe.stdout).toContain('behavioralEvidence=HUMAN_INPUT_READY')
    expect(geoipProbe.stdout).not.toContain('219.78.242.109')
    expect(geoipProbe.stdout).not.toContain('HK')

    const ipcidrProbe = await execFileAsync(process.execPath, [
      script,
      '--profile', 'routing-ipcidr-only',
      '--routing-ipv4', '219.78.242.109',
    ], { cwd: root })
    expect(ipcidrProbe.stderr).toBe('')
    expect(ipcidrProbe.stdout).toContain('profile=routing-ipcidr-only candidateCount=0')
    expect(ipcidrProbe.stdout).toContain('behavioralEvidence=HUMAN_INPUT_READY')
    expect(ipcidrProbe.stdout).not.toContain('219.78.242.109')

    const dns = await execFileAsync(process.execPath, [script, '--profile', 'dns', '--dns-server', '1.1.1.1'], { cwd: root })
    expect(dns.stderr).toBe('')
    expect(dns.stdout).toContain('behavioralEvidence=HUMAN_INPUT_READY')
    expect(dns.stdout).not.toContain('1.1.1.1')
  }, 20_000)

  it('rejects invalid new arguments without echoing their values', async () => {
    const cases = [
      [['--profile', 'dns', '--dns-server', 'dns.example'], 'SHADOWROCKET_LOCAL_DNS_SERVER_INVALID', 'dns.example'],
      [['--profile', 'dns', '--dns-server', '1.1.1.1:0'], 'SHADOWROCKET_LOCAL_DNS_SERVER_INVALID', '1.1.1.1:0'],
      [['--profile', 'routing', '--routing-ipv4', 'router.example'], 'SHADOWROCKET_LOCAL_ROUTING_IPV4_INVALID', 'router.example'],
      [['--profile', 'routing', '--routing-ipv6', '2001:::1'], 'SHADOWROCKET_LOCAL_ROUTING_IPV6_INVALID', '2001:::1'],
      [['--profile', 'routing', '--routing-domain', 'https://controlled.example'], 'SHADOWROCKET_LOCAL_ROUTING_DOMAIN_INVALID', 'https://controlled.example'],
      [['--profile', 'routing', '--routing-geoip-country', 'C\nA'], 'SHADOWROCKET_LOCAL_ROUTING_GEOIP_INVALID', 'C\nA'],
    ]
    for (const [args, code, forbidden] of cases) {
      const result = await execFileAsync(process.execPath, [script, ...args], { cwd: root }).catch((error) => error)
      expect(result.stderr).toContain(code)
      expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).not.toContain(forbidden)
    }
  }, 20_000)
})
