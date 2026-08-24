import { afterEach, describe, expect, it } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  executeLocalAcceptance,
  resolvePrivateWorkspace,
  runAcceptanceCommand,
  runCliCommand,
} from './generate-loon-service-rules-acceptance.mjs'

const profile = [
  '[General]',
  '',
  '[Proxy]',
  '',
  '[Proxy Group]',
  '',
  '[Rule]',
  'final,DIRECT',
  '',
  '[Remote Rule]',
  'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/OpenAI.list,policy=DIRECT,enabled=true',
  '',
].join('\n')

const diagnosticCounts = {
  candidateCount: 1,
  compatibleEndpointCount: 1,
  skippedEndpointCount: 0,
  blockingIssueCount: 0,
  issueCodeCounts: {},
}

const successfulAcceptance = {
  compileLoonAcceptanceProject: () => ({
    graph: { success: true, ir: {} },
    loon: { success: true, content: profile },
  }),
  acceptanceDiagnosticCounts: () => diagnosticCounts,
}

const blockedAcceptance = {
  compileLoonAcceptanceProject: () => ({
    graph: { success: true, ir: {} },
    loon: { success: false, issues: [] },
  }),
  acceptanceDiagnosticCounts: () => ({ ...diagnosticCounts, blockingIssueCount: 1 }),
}

const disposableRoots = []

afterEach(async () => {
  await Promise.all(disposableRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function workspace() {
  const parent = await mkdtemp(path.join(tmpdir(), 'proxyflow-loon-service-rules-'))
  disposableRoots.push(parent)
  const root = path.join(parent, 'workspace')
  await mkdir(path.join(root, 'fixtures/loon'), { recursive: true })
  await mkdir(path.join(root, 'tmp'))
  await writeFile(path.join(root, 'fixtures/loon/service-rules-project.json'), '{}\n')
  await writeFile(path.join(root, 'tmp/loon-real-subscription.txt'), 'synthetic private input\n', { mode: 0o600 })
  return { parent, root }
}

describe('Loon Service Rules private acceptance I/O', () => {
  it('rejects a symlinked tmp root without following it', async () => {
    const { parent, root } = await workspace()
    await rm(path.join(root, 'tmp'), { recursive: true })
    const outside = path.join(parent, 'outside')
    await mkdir(outside)
    await symlink(outside, path.join(root, 'tmp'))

    await expect(resolvePrivateWorkspace(root)).rejects.toThrow('LOON_SERVICE_RULES_LOCAL_TMP_SYMLINK')
  })

  it('replaces a stale output symlink with a mode-0600 regular artifact', async () => {
    const { root } = await workspace()
    const victim = path.join(root, 'victim.conf')
    const output = path.join(root, 'tmp/loon-service-rules-acceptance.conf')
    await writeFile(victim, 'do not overwrite\n')
    await symlink(victim, output)

    const outcome = await executeLocalAcceptance({
      workspaceRoot: root,
      acceptance: successfulAcceptance,
      project: {},
      privateInput: 'tmp/loon-real-subscription.txt',
    })

    expect(outcome.success).toBe(true)
    expect(await readFile(victim, 'utf8')).toBe('do not overwrite\n')
    expect(await readFile(output, 'utf8')).toBe(profile)
    const stats = await lstat(output)
    expect(stats.isFile()).toBe(true)
    expect(stats.isSymbolicLink()).toBe(false)
    expect(stats.mode & 0o777).toBe(0o600)
  })

  it('removes stale artifacts on blocked and invalid-input runs', async () => {
    const { root } = await workspace()
    const output = path.join(root, 'tmp/loon-service-rules-acceptance.conf')
    await writeFile(output, 'stale private artifact\n')
    const blocked = await executeLocalAcceptance({
      workspaceRoot: root,
      acceptance: blockedAcceptance,
      project: {},
      privateInput: 'tmp/loon-real-subscription.txt',
    })
    expect(blocked.success).toBe(false)
    await expect(lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })

    await writeFile(output, 'stale private artifact\n')
    const outsideInput = path.join(root, 'outside-subscription.txt')
    await writeFile(outsideInput, 'synthetic private input\n')
    await rm(path.join(root, 'tmp/loon-real-subscription.txt'))
    await symlink(outsideInput, path.join(root, 'tmp/loon-real-subscription.txt'))
    await expect(executeLocalAcceptance({
      workspaceRoot: root,
      acceptance: successfulAcceptance,
      project: {},
      privateInput: 'tmp/loon-real-subscription.txt',
    })).rejects.toThrow('LOON_SERVICE_RULES_LOCAL_INPUT_SYMLINK_ESCAPE')
    await expect(lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('canonicalizes the workspace and prints only aggregate local state', async () => {
    const { parent, root } = await workspace()
    const alias = path.join(parent, 'workspace-alias')
    await symlink(root, alias)
    let stdout = ''

    const exitCode = await runAcceptanceCommand({
      workspaceRoot: alias,
      acceptance: successfulAcceptance,
      local: true,
      writeStdout: (value) => { stdout += value },
    })

    expect(exitCode).toBe(0)
    expect(stdout).toContain('"candidateCount":1')
    expect(stdout).toContain('"remoteRuleCount":1')
    expect(stdout).toContain('status=COMPILED_LOCAL_ONLY\n')
    expect(stdout).toContain('artifact=tmp/loon-service-rules-acceptance.conf\n')
    expect(stdout).not.toContain('synthetic private input')
    expect(stdout).not.toContain(profile)
    expect(stdout).not.toContain(root)
  })

  it('reduces exceptional CLI output to a fixed non-secret failure', async () => {
    const { root } = await workspace()
    const output = path.join(root, 'tmp/loon-service-rules-acceptance.conf')
    await writeFile(output, 'stale private artifact\n')
    let stdout = ''
    let stderr = ''
    const exitCode = await runCliCommand({
      workspaceRoot: root,
      local: true,
      loadAcceptance: async () => { throw new Error('private credential') },
      writeStdout: (value) => { stdout += value },
      writeStderr: (value) => { stderr += value },
    })

    expect(exitCode).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toBe('LOON_SERVICE_RULES_ACCEPTANCE_FAILED\n')
    expect(stderr).not.toContain('private credential')
    await expect(lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
