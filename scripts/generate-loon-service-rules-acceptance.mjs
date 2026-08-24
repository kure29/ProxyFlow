#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const serviceRuleIds = Object.freeze(['openai'])
const defaultPrivateInput = 'tmp/loon-real-subscription.txt'
const localArtifactName = 'loon-service-rules-acceptance.conf'
const fixedFailure = 'LOON_SERVICE_RULES_ACCEPTANCE_FAILED\n'

async function loadAcceptanceModule(workspaceRoot) {
  const server = await createServer({
    root: workspaceRoot,
    configFile: false,
    envFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false },
  })
  try {
    return await server.ssrLoadModule('/src/targets/loon/acceptance.ts')
  } finally {
    await server.close()
  }
}

export async function runAcceptanceCommand({
  workspaceRoot,
  acceptance,
  local = false,
  privateInput = defaultPrivateInput,
  writeStdout = (value) => process.stdout.write(value),
}) {
  const actualWorkspaceRoot = await realpath(path.resolve(workspaceRoot))
  let privateWorkspace
  if (local) {
    privateWorkspace = await resolvePrivateWorkspace(actualWorkspaceRoot)
    await removeStalePrivateArtifact(privateWorkspace)
  }

  try {
    const projectPath = path.join(actualWorkspaceRoot, 'fixtures/loon/service-rules-project.json')
    const project = JSON.parse(await readFile(projectPath, 'utf8'))
    if (!local) {
      await verifyFixture(acceptance, project, actualWorkspaceRoot, writeStdout)
      return 0
    }

    const outcome = await executeLocalAcceptance({
      workspaceRoot: actualWorkspaceRoot,
      privateWorkspace,
      acceptance,
      project,
      privateInput,
    })
    writeStdout(`${JSON.stringify(outcome.safe)}\n`)
    if (!outcome.success) {
      writeStdout('status=BLOCKED_LOCAL_ONLY\n')
      return 1
    }
    writeStdout('status=COMPILED_LOCAL_ONLY\n')
    writeStdout(`artifact=${path.relative(actualWorkspaceRoot, outcome.outputPath)}\n`)
    return 0
  } catch (error) {
    if (privateWorkspace) await removeStalePrivateArtifact(privateWorkspace).catch(() => undefined)
    throw error
  }
}

export async function runCliCommand({
  workspaceRoot,
  local,
  privateInput,
  loadAcceptance,
  writeStdout = (value) => process.stdout.write(value),
  writeStderr = (value) => process.stderr.write(value),
}) {
  try {
    const acceptance = await loadAcceptance()
    return await runAcceptanceCommand({ workspaceRoot, acceptance, local, privateInput, writeStdout })
  } catch {
    if (local) {
      const privateWorkspace = await resolvePrivateWorkspace(workspaceRoot).catch(() => undefined)
      if (privateWorkspace) await removeStalePrivateArtifact(privateWorkspace).catch(() => undefined)
    }
    writeStderr(fixedFailure)
    return 1
  }
}

export async function verifyFixture(acceptance, project, workspaceRoot, writeStdout) {
  const expectedPath = path.join(workspaceRoot, 'fixtures/loon/service-rules.expected.conf')
  const expected = await readFile(expectedPath, 'utf8')
  const result = acceptance.compileLoonAcceptanceProject(project)
  assertCompiled(result, 'LOON_SERVICE_RULES_ACCEPTANCE_BLOCKED')
  if (result.loon.content !== expected) throw new Error('LOON_SERVICE_RULES_ACCEPTANCE_GOLDEN_MISMATCH')
  const remoteRuleCount = countRemoteRules(result.loon.content)
  if (remoteRuleCount !== 1) throw new Error('LOON_SERVICE_RULES_ACCEPTANCE_REMOTE_RULE_COUNT')
  assertDeterministicProfile(result.loon.content, workspaceRoot)
  writeStdout(`LOON_SERVICE_RULES_ACCEPTANCE_VERIFIED remoteRuleCount=${remoteRuleCount} serviceRuleIds=${serviceRuleIds.join(',')}\n`)
  writeStdout(`artifact=${path.relative(workspaceRoot, expectedPath)}\n`)
}

export async function executeLocalAcceptance({ workspaceRoot, privateWorkspace: suppliedWorkspace, acceptance, project, privateInput }) {
  const privateWorkspace = suppliedWorkspace ?? await resolvePrivateWorkspace(workspaceRoot)
  // unlink removes a symlink itself, so neither cleanup nor publication follows
  // a stale artifact link.
  await removeStalePrivateArtifact(privateWorkspace)
  try {
    const content = await readPrivateInput(privateWorkspace, privateInput)

    const result = acceptance.compileLoonAcceptanceProject(project, content)
    const counts = acceptance.acceptanceDiagnosticCounts(result)
    const remoteRuleCount = result.loon?.success ? countRemoteRules(result.loon.content) : 0
    const safe = {
      candidateCount: counts.candidateCount,
      compatibleEndpointCount: counts.compatibleEndpointCount,
      skippedEndpointCount: counts.skippedEndpointCount,
      blockingIssueCount: counts.blockingIssueCount,
      remoteRuleCount,
      serviceRuleIds,
      issueCodeCounts: counts.issueCodeCounts,
    }
    if (!result.loon?.success || !result.loon.content || remoteRuleCount !== 1) {
      await removeStalePrivateArtifact(privateWorkspace)
      return { success: false, safe }
    }

    assertDeterministicProfile(result.loon.content, privateWorkspace.workspaceRoot)
    const outputPath = await publishPrivateArtifact(privateWorkspace, result.loon.content)
    return { success: true, safe, outputPath }
  } catch (error) {
    await removeStalePrivateArtifact(privateWorkspace).catch(() => undefined)
    throw error
  }
}

export async function resolvePrivateWorkspace(workspaceRoot) {
  const actualWorkspaceRoot = await realpath(path.resolve(workspaceRoot))
  const tmpRoot = path.join(actualWorkspaceRoot, 'tmp')
  let tmpStats
  try {
    tmpStats = await lstat(tmpRoot)
  } catch {
    throw new Error('LOON_SERVICE_RULES_LOCAL_TMP_MISSING')
  }
  if (tmpStats.isSymbolicLink()) throw new Error('LOON_SERVICE_RULES_LOCAL_TMP_SYMLINK')
  if (!tmpStats.isDirectory()) throw new Error('LOON_SERVICE_RULES_LOCAL_TMP_NOT_DIRECTORY')
  if (await realpath(tmpRoot) !== tmpRoot) throw new Error('LOON_SERVICE_RULES_LOCAL_TMP_ESCAPE')
  return {
    workspaceRoot: actualWorkspaceRoot,
    tmpRoot,
    outputPath: path.join(tmpRoot, localArtifactName),
    tmpDevice: tmpStats.dev,
    tmpInode: tmpStats.ino,
  }
}

export async function readPrivateInput(privateWorkspace, candidate = defaultPrivateInput) {
  const resolvedCandidate = path.resolve(privateWorkspace.workspaceRoot, candidate)
  if (!isInside(privateWorkspace.tmpRoot, resolvedCandidate)) {
    throw new Error('LOON_SERVICE_RULES_LOCAL_INPUT_OUTSIDE_TMP')
  }
  if (hasForbiddenPrivatePath(privateWorkspace.tmpRoot, resolvedCandidate)) {
    throw new Error('LOON_SERVICE_RULES_LOCAL_INPUT_FORBIDDEN')
  }

  const actualInput = await realpath(resolvedCandidate)
  if (!isInside(privateWorkspace.tmpRoot, actualInput)) {
    throw new Error('LOON_SERVICE_RULES_LOCAL_INPUT_SYMLINK_ESCAPE')
  }
  if (hasForbiddenPrivatePath(privateWorkspace.tmpRoot, actualInput)) {
    throw new Error('LOON_SERVICE_RULES_LOCAL_INPUT_FORBIDDEN')
  }

  await assertPrivateWorkspaceUnchanged(privateWorkspace)
  const handle = await open(actualInput, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const inputStats = await handle.stat()
    if (!inputStats.isFile()) throw new Error('LOON_SERVICE_RULES_LOCAL_INPUT_NOT_REGULAR_FILE')
    return await handle.readFile({ encoding: 'utf8' })
  } finally {
    await handle.close()
  }
}

export async function removeStalePrivateArtifact(privateWorkspace) {
  await assertPrivateWorkspaceUnchanged(privateWorkspace)
  try {
    await unlink(privateWorkspace.outputPath)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
}

export async function publishPrivateArtifact(privateWorkspace, content) {
  await assertPrivateWorkspaceUnchanged(privateWorkspace)
  await removeStalePrivateArtifact(privateWorkspace)
  const temporaryPath = path.join(
    privateWorkspace.tmpRoot,
    `.loon-service-rules-acceptance.${process.pid}.${randomUUID()}.tmp`,
  )
  let handle
  try {
    handle = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
    await handle.writeFile(content, { encoding: 'utf8' })
    await handle.chmod(0o600)
    await handle.sync()
    await handle.close()
    handle = undefined
    await assertPrivateWorkspaceUnchanged(privateWorkspace)
    await removeStalePrivateArtifact(privateWorkspace)
    await rename(temporaryPath, privateWorkspace.outputPath)
    return privateWorkspace.outputPath
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined)
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function assertPrivateWorkspaceUnchanged(privateWorkspace) {
  const current = await lstat(privateWorkspace.tmpRoot)
  if (current.isSymbolicLink()
    || !current.isDirectory()
    || current.dev !== privateWorkspace.tmpDevice
    || current.ino !== privateWorkspace.tmpInode) {
    throw new Error('LOON_SERVICE_RULES_LOCAL_TMP_CHANGED')
  }
}

function hasForbiddenPrivatePath(tmpRoot, candidate) {
  const relative = path.relative(tmpRoot, candidate)
  return relative.split(path.sep).some((segment) => segment === '.git' || segment.startsWith('.env'))
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function isMissing(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT'
}

function assertCompiled(result, code) {
  if (!result.graph.success || !result.graph.ir || !result.loon?.success || !result.loon.content) throw new Error(code)
}

export function countRemoteRules(content) {
  const lines = content.split('\n')
  const start = lines.indexOf('[Remote Rule]')
  if (start < 0) return 0
  const endOffset = lines.slice(start + 1).findIndex((line) => /^\[[^\]]+\]$/.test(line))
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset
  return lines.slice(start + 1, end).filter(Boolean).length
}

function assertDeterministicProfile(content, workspaceRoot) {
  if (content.includes('\r') || !content.endsWith('\n') || content.endsWith('\n\n')) {
    throw new Error('LOON_SERVICE_RULES_ACCEPTANCE_NON_DETERMINISTIC_NEWLINE')
  }
  if (content.includes(workspaceRoot) || /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(content)) {
    throw new Error('LOON_SERVICE_RULES_ACCEPTANCE_ARTIFACT_CONTAINS_RUNTIME_DATA')
  }
}

async function main() {
  const exitCode = await runCliCommand({
    workspaceRoot: root,
    local: process.argv.includes('--local'),
    privateInput: process.env.LOON_LOCAL_SUBSCRIPTION_FILE || defaultPrivateInput,
    loadAcceptance: () => loadAcceptanceModule(root),
  })
  process.exitCode = exitCode
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch(() => {
    process.stderr.write(fixedFailure)
    process.exitCode = 1
  })
}
