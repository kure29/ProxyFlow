#!/usr/bin/env node
import { createServer } from 'vite'
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const projectPath = path.join(root, 'fixtures/loon/acceptance-project.json')
const expectedPath = path.join(root, 'fixtures/loon/acceptance.expected.conf')
const focusedFixtures = [
  ['routing-ip-project.json', 'routing-ip.expected.conf'],
  ['dns-doh-project.json', 'dns-doh.expected.conf'],
]

async function loadAcceptanceModule() {
  const server = await createServer({
    root,
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

async function main() {
  const acceptance = await loadAcceptanceModule()
  const project = JSON.parse(await readFile(projectPath, 'utf8'))
  const localPath = localSubscriptionPath(process.argv.slice(2))
  if (localPath) {
    await runLocal(acceptance, project, localPath)
    return
  }

  const result = acceptance.compileLoonAcceptanceProject(project)
  if (!result.graph.success || !result.graph.ir || !result.loon?.success) {
    printBlocked('fixture', result)
    process.exitCode = 1
    return
  }
  assertGeneratedProfile(result.loon.content)
  await writeFile(expectedPath, result.loon.content, 'utf8')
  for (const [fixtureName, artifactName] of focusedFixtures) {
    const focused = JSON.parse(await readFile(path.join(root, 'fixtures/loon', fixtureName), 'utf8'))
    const focusedResult = acceptance.compileLoonAcceptanceIr(focused)
    if (!focusedResult.success) {
      const codes = [...new Set(focusedResult.issues.map((issue) => issue.code))].sort().join(',') || 'UNKNOWN'
      throw new Error(`LOON_ACCEPTANCE_FOCUSED_BLOCKED ${fixtureName} ${codes}`)
    }
    assertGeneratedProfile(focusedResult.content)
    await writeFile(path.join(root, 'fixtures/loon', artifactName), focusedResult.content, 'utf8')
  }
  const counts = acceptance.acceptanceDiagnosticCounts(result)
  process.stdout.write(`LOON_ACCEPTANCE_GENERATED candidateCount=${counts.candidateCount} compatibleEndpointCount=${counts.compatibleEndpointCount} skippedEndpointCount=${counts.skippedEndpointCount} blockingIssueCount=${counts.blockingIssueCount}\n`)
  process.stdout.write(`artifact=${path.relative(root, expectedPath)}\n`)
}

async function runLocal(acceptance, project, filePath) {
  const actualPath = await realpath(filePath)
  const tmpRoot = `${path.join(root, 'tmp')}${path.sep}`
  if (!actualPath.startsWith(tmpRoot)) throw new Error('Local Loon acceptance input cannot resolve outside tmp/.')
  const content = await readFile(actualPath, 'utf8')
  const result = acceptance.compileLoonAcceptanceProject(project, content)
  const counts = acceptance.acceptanceDiagnosticCounts(result)
  const safe = {
    candidateCount: counts.candidateCount,
    compatibleEndpointCount: counts.compatibleEndpointCount,
    skippedEndpointCount: counts.skippedEndpointCount,
    blockingIssueCount: counts.blockingIssueCount,
    issueCodeCounts: counts.issueCodeCounts,
  }
  process.stdout.write(`${JSON.stringify(safe)}\n`)
  if (result.loon?.success && result.loon.content) {
    const outputPath = path.join(root, 'tmp/loon-real-subscription.conf')
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, result.loon.content, 'utf8')
    process.stdout.write('status=COMPILED_LOCAL_ONLY\n')
    process.stdout.write(`artifact=${path.relative(root, outputPath)}\n`)
  } else {
    process.stdout.write('status=BLOCKED_LOCAL_ONLY\n')
    process.exitCode = 1
  }
}

function localSubscriptionPath(args) {
  const flagIndex = args.indexOf('--local')
  const candidate = flagIndex >= 0
    ? args[flagIndex + 1] || process.env.LOON_LOCAL_SUBSCRIPTION_FILE || 'tmp/loon-real-subscription.txt'
    : process.env.LOON_LOCAL_SUBSCRIPTION_FILE
  if (!candidate) return undefined
  const resolved = path.resolve(root, candidate)
  const tmpRoot = `${path.join(root, 'tmp')}${path.sep}`
  if (!resolved.startsWith(tmpRoot)) throw new Error('Local Loon acceptance input must be under tmp/.')
  if (path.basename(resolved).startsWith('.env') || resolved.includes(`${path.sep}.git${path.sep}`)) {
    throw new Error('Local Loon acceptance input cannot be an environment or Git file.')
  }
  return resolved
}

function printBlocked(label, result) {
  const graphCodes = result.graph.issues.map((issue) => issue.code)
  const loonCodes = result.loon?.issues.map((issue) => issue.code) ?? []
  const codes = [...new Set([...graphCodes, ...loonCodes])].sort().join(',') || 'UNKNOWN'
  process.stdout.write(`LOON_ACCEPTANCE_BLOCKED scope=${label} codes=${codes}\n`)
}

function assertGeneratedProfile(content) {
  if (content.includes('\r') || !content.endsWith('\n') || content.endsWith('\n\n')) {
    throw new Error('LOON_ACCEPTANCE_NON_DETERMINISTIC_NEWLINE')
  }
  if (content.includes(root) || /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(content)) {
    throw new Error('LOON_ACCEPTANCE_ARTIFACT_CONTAINS_RUNTIME_DATA')
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'LOON_ACCEPTANCE_FAILED'}\n`)
  process.exitCode = 1
})
