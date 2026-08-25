#!/usr/bin/env node
import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = path.join(os.tmpdir(), 'proxyflow-shadowrocket-acceptance')
const profiles = new Set(['core', 'url-test', 'fallback', 'load-balance', 'routing-overlap', 'routing-inverted', 'dns-system', 'dns-udp', 'subscription', 'routing', 'dns', 'all'])
const inputProfiles = new Set(['core', 'url-test', 'fallback', 'load-balance', 'subscription', 'all'])

class LocalAcceptanceError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

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
    return await server.ssrLoadModule('/src/targets/shadowrocket/acceptanceLocal.ts')
  } finally {
    await server.close()
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }
  const requested = args.profile ?? 'all'
  if (!profiles.has(requested)) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_PROFILE_INVALID')

  // This directory is a private, disposable output location under the OS temp
  // root. Remove only this exact generated directory before every run.
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true, mode: 0o700 })
  await chmod(outputRoot, 0o700)

  const needsInput = inputProfiles.has(requested)
  const inputPath = args.input ?? process.env.SHADOWROCKET_LOCAL_INPUT
  if (needsInput && !inputPath) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_INPUT_REQUIRED')
  const healthUrl = args.healthUrl ?? process.env.SHADOWROCKET_LOCAL_HEALTH_URL
  if ((requested === 'all' || requested === 'url-test' || requested === 'fallback') && !healthUrl) {
    throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_HEALTH_URL_REQUIRED')
  }
  if (healthUrl && !isSafeHealthUrl(healthUrl)) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_HEALTH_URL_INVALID')
  const content = inputPath ? await readPrivateInput(inputPath) : undefined
  const acceptance = await loadAcceptanceModule()
  const parsed = content === undefined ? undefined : acceptance.parseShadowrocketLocalInput(content)
  if (parsed?.issues.some((issue) => issue.severity === 'error')) {
    const codes = [...new Set(parsed.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code))].sort()
    process.stdout.write(`SHADOWROCKET_LOCAL_INPUT_BLOCKED codes=${codes.join(',') || 'UNKNOWN'}\n`)
    process.exitCode = 1
    return
  }

  const results = acceptance.compileShadowrocketLocalProfiles(content, requested, { healthUrl })
  const blocked = results.filter((item) => !item.graph.success || !item.result?.success)
  if (blocked.length > 0) {
    for (const item of results) printProfileSummary(item)
    process.stdout.write(`SHADOWROCKET_LOCAL_BLOCKED profileCount=${results.length} blockingProfileCount=${blocked.length}\n`)
    process.exitCode = 1
    return
  }

  const artifacts = []
  for (const item of results) {
    if (!item.result?.success) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_COMPILE_FAILED')
    const artifactPath = path.join(outputRoot, `${item.profile}.conf`)
    await writeFile(artifactPath, item.result.content, { encoding: 'utf8', mode: 0o600 })
    await chmod(artifactPath, 0o600)
    const sha256 = createHash('sha256').update(item.result.content, 'utf8').digest('hex')
    artifacts.push({ item, artifactPath, sha256 })
  }

  if (parsed) printInputSummary(acceptance.summarizeParsedSubscription(parsed))
  for (const artifact of artifacts) {
    const { item, artifactPath, sha256 } = artifact
    printProfileSummary(item)
    process.stdout.write(`profile=${item.profile} status=COMPILED_LOCAL_ONLY artifact=${artifactPath} sha256=${sha256}\n`)
  }
  process.stdout.write(`SHADOWROCKET_LOCAL_ACCEPTANCE_OK profileCount=${artifacts.length} artifactDir=${outputRoot} privateInputRequired=${needsInput}\n`)
}

function parseArgs(args) {
  const result = { help: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') { result.help = true; continue }
    if (arg === '--profile') {
      const value = args[++index]
      if (!value) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_PROFILE_REQUIRED')
      result.profile = value
      continue
    }
    if (arg === '--input') {
      const value = args[++index]
      if (!value) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_INPUT_REQUIRED')
      result.input = value
      continue
    }
    if (arg === '--health-url') {
      const value = args[++index]
      if (!value) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_HEALTH_URL_REQUIRED')
      result.healthUrl = value
      continue
    }
    throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_ARGUMENT_INVALID')
  }
  return result
}

async function readPrivateInput(input) {
  if (/^(?:https?|file):/i.test(input)) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_INPUT_MUST_BE_FILE')
  const resolved = path.resolve(input)
  const temporaryRoot = ensureTrailingSeparator(await realpath(os.tmpdir()))
  try {
    const actual = await realpath(resolved)
    const allowedRoots = [temporaryRoot, ensureTrailingSeparator('/tmp'), ensureTrailingSeparator('/private/tmp')]
    if (!allowedRoots.some((candidate) => actual.startsWith(candidate)) || actual.includes(`${path.sep}.git${path.sep}`)) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_INPUT_PATH_INVALID')
    const info = await stat(actual)
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_INPUT_SIZE_INVALID')
    return await readFile(actual, 'utf8')
  } catch (error) {
    if (error instanceof LocalAcceptanceError) throw error
    throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_INPUT_UNREADABLE')
  }
}

function printInputSummary(summary) {
  process.stdout.write(`input candidateCount=${summary.candidateCount} protocolCounts=${formatCounts(summary.protocolCounts)} diagnosticCodeCounts=${formatCounts(summary.issueCodeCounts)}\n`)
}

function printProfileSummary(item) {
  process.stdout.write(`profile=${item.profile} candidateCount=${item.summary.candidateCount} compatibleCount=${item.summary.compatibleEndpointCount} skippedCount=${item.summary.skippedEndpointCount} blockerCount=${item.summary.blockingIssueCount} diagnosticCodeCounts=${formatCounts(item.summary.issueCodeCounts)}\n`)
}

function formatCounts(counts) {
  const entries = Object.entries(counts ?? {}).sort(([left], [right]) => left.localeCompare(right))
  return entries.length ? entries.map(([key, value]) => `${key}:${value}`).join(',') : 'none'
}

function isSafeHealthUrl(value) {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.username && !url.password && !url.hash && !/[\r\n]/.test(value)
  } catch {
    return false
  }
}

function ensureTrailingSeparator(value) {
  return value.endsWith(path.sep) ? value : `${value}${path.sep}`
}

function printHelp() {
  process.stdout.write([
    'Local-only Shadowrocket acceptance harness',
    '',
    'npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --health-url https://your-controlled-health-endpoint.example/health --profile all',
    '',
    'Profiles: all, core, url-test, fallback, load-balance, subscription, routing, dns,',
    '         routing-overlap, routing-inverted, dns-system, dns-udp',
    '',
    'Input must be a local file under the OS temporary directory. The harness never',
    'fetches URLs, imports into Shadowrocket, or prints private node data.',
    '',
  ].join('\n'))
}

main().catch((error) => {
  const code = error instanceof LocalAcceptanceError ? error.code : 'SHADOWROCKET_LOCAL_FAILED'
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
})
