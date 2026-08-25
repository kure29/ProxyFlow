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
  })

  it('generates controlled routing and DNS profiles without private input or network access', async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, '--profile', 'routing'], { cwd: root })
    expect(stderr).toBe('')
    expect(stdout).toContain('profile=routing-overlap status=COMPILED_LOCAL_ONLY')
    expect(stdout).toContain('profile=routing-inverted status=COMPILED_LOCAL_ONLY')
    expect(stdout).not.toContain('http://')
    expect(stdout).not.toContain('https://')
  })
})
