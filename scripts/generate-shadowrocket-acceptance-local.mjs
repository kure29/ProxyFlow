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
const profiles = new Set(['core', 'url-test', 'fallback', 'load-balance', 'routing-overlap', 'routing-inverted', 'routing-geoip-only', 'routing-ipcidr-only', 'dns-system', 'dns-udp', 'subscription', 'routing', 'dns', 'all'])
const inputProfiles = new Set(['core', 'url-test', 'fallback', 'load-balance', 'subscription', 'all'])
const routingProfiles = new Set(['routing', 'routing-overlap', 'routing-inverted', 'routing-geoip-only', 'routing-ipcidr-only', 'all'])
const dnsProfiles = new Set(['dns', 'dns-system', 'dns-udp', 'all'])
const strategyHealthProfiles = new Set(['url-test', 'fallback', 'all'])

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
  const acceptance = await loadAcceptanceModule()
  const suppliedHealthUrl = args.healthUrl ?? process.env.SHADOWROCKET_LOCAL_HEALTH_URL
  const healthUrl = suppliedHealthUrl ?? (strategyHealthProfiles.has(requested) ? acceptance.SHADOWROCKET_LOCAL_DEFAULT_HEALTH_URL : undefined)
  if (healthUrl && !isSafeHealthUrl(healthUrl)) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_HEALTH_URL_INVALID')
  const suppliedDnsServer = args.dnsServer ?? process.env.SHADOWROCKET_LOCAL_DNS_SERVER
  const dnsServer = suppliedDnsServer ?? (dnsProfiles.has(requested) ? acceptance.SHADOWROCKET_LOCAL_DEFAULT_DNS_SERVER : undefined)
  if (dnsServer) {
    const validatedDns = acceptance.validateShadowrocketLocalDnsServer(dnsServer)
    if (!validatedDns.ok) throw new LocalAcceptanceError(validatedDns.code)
  }
  const routingInput = {
    ...(args.routingDomain ? { domain: args.routingDomain } : {}),
    ...(args.routingIpv4 ? { ipv4: args.routingIpv4 } : {}),
    ...(args.routingIpv6 ? { ipv6: args.routingIpv6 } : {}),
    ...(args.routingGeoipCountry ? { geoipCountry: args.routingGeoipCountry } : {}),
  }
  const hasRoutingInput = Object.keys(routingInput).length > 0
  const routingEvidence = acceptance.localRoutingEvidenceReadiness({ routing: routingInput })
  if (hasRoutingInput) {
    const validatedRouting = acceptance.validateShadowrocketLocalRoutingValues(routingInput)
    if (!validatedRouting.ok) throw new LocalAcceptanceError(validatedRouting.code)
  }
  const content = inputPath ? await readPrivateInput(inputPath) : undefined
  const parsed = content === undefined ? undefined : acceptance.parseShadowrocketLocalInput(content)
  if (parsed?.issues.some((issue) => issue.severity === 'error')) {
    const codes = [...new Set(parsed.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code))].sort()
    process.stdout.write(`SHADOWROCKET_LOCAL_INPUT_BLOCKED codes=${codes.join(',') || 'UNKNOWN'}\n`)
    process.exitCode = 1
    return
  }

  const compileOptions = {
    ...(healthUrl ? { healthUrl } : {}),
    ...(dnsServer ? { dnsServer } : {}),
    ...(hasRoutingInput ? { routing: routingInput } : {}),
  }
  const results = acceptance.compileShadowrocketLocalProfiles(content, requested, compileOptions)
  const blocked = results.filter((item) => !item.graph.success || !item.result?.success)
  if (blocked.length > 0) {
    for (const item of results) printProfileSummary(item, behaviorMode(item.profile, { suppliedHealthUrl: Boolean(suppliedHealthUrl), suppliedDnsServer: Boolean(suppliedDnsServer), routingEvidence }), routingEvidence)
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
    printProfileSummary(item, behaviorMode(item.profile, { suppliedHealthUrl: Boolean(suppliedHealthUrl), suppliedDnsServer: Boolean(suppliedDnsServer), routingEvidence }), routingEvidence)
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
      if (!value) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_HEALTH_URL_INVALID')
      result.healthUrl = value
      continue
    }
    if (arg === '--dns-server') {
      const value = args[++index]
      if (!value) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_DNS_SERVER_INVALID')
      result.dnsServer = value
      continue
    }
    if (arg === '--routing-domain') {
      const value = args[++index]
      if (!value) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_ROUTING_DOMAIN_INVALID')
      result.routingDomain = value
      continue
    }
    if (arg === '--routing-ipv4') {
      const value = args[++index]
      if (!value) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_ROUTING_IPV4_INVALID')
      result.routingIpv4 = value
      continue
    }
    if (arg === '--routing-ipv6') {
      const value = args[++index]
      if (!value) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_ROUTING_IPV6_INVALID')
      result.routingIpv6 = value
      continue
    }
    if (arg === '--routing-geoip-country') {
      const value = args[++index]
      if (!value) throw new LocalAcceptanceError('SHADOWROCKET_LOCAL_ROUTING_GEOIP_INVALID')
      result.routingGeoipCountry = value
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

function printProfileSummary(item, mode, routingEvidence) {
  const routingEvidenceSuffix = item.profile.startsWith('routing-')
    ? ` routingEvidence=${formatRoutingEvidence(routingEvidence)}`
    : ''
  process.stdout.write(`profile=${item.profile} candidateCount=${item.summary.candidateCount} compatibleCount=${item.summary.compatibleEndpointCount} skippedCount=${item.summary.skippedEndpointCount} blockerCount=${item.summary.blockingIssueCount} diagnosticCodeCounts=${formatCounts(item.summary.issueCodeCounts)} behavioralEvidence=${mode}${routingEvidenceSuffix}\n`)
}

function behaviorMode(profile, inputs) {
  if ((profile === 'url-test' || profile === 'fallback') && !inputs.suppliedHealthUrl) return 'SYNTAX_IMPORT_ONLY'
  if (profile === 'dns-udp' && !inputs.suppliedDnsServer) return 'SYNTAX_IMPORT_ONLY'
  if ((profile === 'dns-system') && !inputs.suppliedDnsServer) return 'SYNTAX_IMPORT_ONLY'
  if (profile === 'routing-geoip-only') return inputs.routingEvidence?.geoip === 'HUMAN_INPUT_READY' ? 'HUMAN_INPUT_READY' : 'SYNTAX_IMPORT_ONLY'
  if (profile === 'routing-ipcidr-only') return inputs.routingEvidence?.ipv4 === 'HUMAN_INPUT_READY' ? 'HUMAN_INPUT_READY' : 'SYNTAX_IMPORT_ONLY'
  if (profile === 'routing-overlap' || profile === 'routing-inverted') {
    const statuses = Object.values(inputs.routingEvidence ?? {})
    if (statuses.every((status) => status === 'HUMAN_INPUT_READY')) return 'HUMAN_INPUT_READY'
    if (statuses.some((status) => status === 'HUMAN_INPUT_READY')) return 'PARTIAL_HUMAN_INPUT_READY'
    return 'SYNTAX_IMPORT_ONLY'
  }
  return 'HUMAN_INPUT_READY'
}

function formatRoutingEvidence(evidence) {
  if (!evidence) return 'none'
  return [
    `DOMAIN:${evidence.domain}`,
    `DOMAIN_SUFFIX:${evidence.domainSuffix}`,
    `IP_CIDR:${evidence.ipv4}`,
    `IP_CIDR6:${evidence.ipv6}`,
    `GEOIP:${evidence.geoip}`,
  ].join(',')
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
    'npm run shadowrocket:acceptance:local -- --input /private/tmp/proxyflow-shadowrocket-input.txt --health-url https://your-controlled-health-endpoint.example/health --dns-server 192.0.2.53:53 --profile all',
    'Optional real controls: --dns-server IPv4[:port], --routing-domain domain,',
    '--routing-ipv4 IPv4, --routing-ipv6 IPv6, --routing-geoip-country CC',
    '',
    'Profiles: all, core, url-test, fallback, load-balance, subscription, routing, dns,',
    '         routing-overlap, routing-inverted, routing-geoip-only, routing-ipcidr-only,',
    '         dns-system, dns-udp',
    '',
    'Input must be a local file under the OS temporary directory. Documentation-only',
    'defaults are labeled SYNTAX_IMPORT_ONLY; the harness never fetches URLs, imports',
    'into Shadowrocket, or prints private node data.',
    '',
  ].join('\n'))
}

main().catch((error) => {
  const code = error instanceof LocalAcceptanceError ? error.code : 'SHADOWROCKET_LOCAL_FAILED'
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
})
