#!/usr/bin/env node
import { createServer } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = path.join(root, 'fixtures/surge/v1.4-acceptance')
const manifestPath = path.join(fixtureRoot, 'manifest.json')
const fixedNow = () => new Date('2026-08-29T00:00:00.000Z')
const deferredGeneralKeys = [
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
const fixtureCredentialPattern = /^fixture-[a-z0-9-]+$/
const coreStrategyGroups = new Map([
  ['Snapshot Auto', 'url-test, HK Snapshot A, HK Snapshot B, interval=300, tolerance=50'],
  ['Manual Select', 'select, Manual HTTPS Egress, Fallback Egress'],
  ['Fallback', 'fallback, Fallback Egress, Manual HTTPS Egress, interval=300'],
  ['Manual Fixed', 'select, Manual HTTPS Egress'],
  ['Release Chain', 'select, Manual HTTPS Egress, underlying-proxy=Snapshot Auto'],
  ['Native Smart', 'smart, Manual HTTPS Egress, Fallback Egress'],
  ['Native Subnet', 'subnet, default = Native Smart, SSID:Home-WiFi = DIRECT, TYPE:CELLULAR = Native Smart'],
])

const update = process.argv.includes('--update')

async function loadCompilerModules() {
  const server = await createServer({
    root,
    configFile: false,
    envFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false },
  })
  try {
    const graph = await server.ssrLoadModule('/src/core/graphCompiler/index.ts')
    const subscription = await server.ssrLoadModule('/src/core/subscription/index.ts')
    const fixtures = await server.ssrLoadModule('/src/core/__fixtures__/subscriptionFixtures.ts')
    const surge = await server.ssrLoadModule('/src/targets/surge/compiler.ts')
    return { graph, subscription, fixtures, surge }
  } finally {
    await server.close()
  }
}

function outputNode(project) {
  const outputs = project.graph.nodes.filter((node) => (
    !node.data.disabled && node.data.blockType === 'output' && node.data.client === 'surge'
  ))
  if (outputs.length !== 1) throw new Error(`SURGE_ACCEPTANCE_OUTPUT_OWNER_INVALID ${project.id}`)
  return outputs[0]
}

function subscriptionSnapshots(project, subscription, fixtures) {
  const snapshots = {}
  for (const node of project.graph.nodes) {
    if (node.data.disabled || node.data.blockType !== 'subscription') continue
    const content = node.data.subscriptionContent
    if (typeof content !== 'string' || !content.trim()) continue
    const parsed = subscription.parseSubscription(content, {
      sourceId: node.id,
      sourceName: node.data.title,
    })
    snapshots[node.id] = fixtures.subscriptionSnapshotFixture(
      node.id,
      parsed,
      '2026-08-29T00:00:00.000Z',
      node.data.subscriptionInputKind ?? 'paste',
    )
  }
  return snapshots
}

function compileProject(project, modules) {
  const output = outputNode(project)
  const graph = modules.graph.compileGraph(project, {
    validationTarget: 'surge',
    subscriptionSnapshots: subscriptionSnapshots(project, modules.subscription, modules.fixtures),
  })
  if (!graph.success || !graph.ir) {
    throw new Error(`SURGE_ACCEPTANCE_GRAPH_BLOCKED ${project.id} ${formatIssues(graph.issues)}`)
  }
  assertMaterializedProxySafety(graph.ir.sources, project.id)
  const result = modules.surge.compileSurge(graph.ir, {
    now: fixedNow,
    outputNodeId: output.id,
    nativeStrategies: graph.nativeStrategies,
    nativeRoutes: graph.nativeRoutes,
    nativeFinalRoute: graph.nativeFinalRoute,
    effectiveFinalNodeId: graph.effectiveFinalNodeId,
    targetNativeFinalOptions: graph.targetNativeFinalOptions,
    targetNativeRouteOptions: graph.targetNativeRouteOptions,
    targetNativeRuleSetSources: graph.targetNativeRuleSetSources,
    targetNativeSurgeGeneralNetwork: graph.targetNativeSurgeGeneralNetwork,
    targetNativeSurgeGeneralConnectivity: graph.targetNativeSurgeGeneralConnectivity,
    targetNativeSurgeGeneralProxyBypass: graph.targetNativeSurgeGeneralProxyBypass,
    targetNativeSurgeDnsBehavior: graph.targetNativeSurgeDnsBehavior,
    effectiveDnsNodeId: graph.effectiveDnsNodeId,
  })
  if (!result.success) throw new Error(`SURGE_ACCEPTANCE_COMPILE_BLOCKED ${project.id} ${formatIssues(result.issues)}`)
  return result
}

function formatIssues(issues = []) {
  return [...new Set(issues.map((issue) => issue.code))].sort().join(',') || 'UNKNOWN'
}

function generalKeys(content) {
  const block = content.split('[General]\n')[1]?.split('\n\n[Proxy]')[0] ?? ''
  return block.split('\n').filter(Boolean).map((line) => line.split(' = ', 1)[0])
}

function sectionNames(content) {
  return [...content.matchAll(/^\[([^\]]+)\]$/gm)].map((match) => match[1])
}

function sectionLines(content, name, nextName) {
  const start = `[${name}]\n`
  const end = nextName ? `\n\n[${nextName}]` : undefined
  const block = content.split(start)[1]?.split(end)[0] ?? ''
  return block.split('\n').filter(Boolean)
}

function proxyGroups(content) {
  return new Map(sectionLines(content, 'Proxy Group', 'Rule').map((line) => {
    const separator = line.indexOf(' = ')
    return separator === -1 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 3)]
  }))
}

export function assertCoreStrategySurface(content) {
  const actual = proxyGroups(content)
  if (actual.size !== coreStrategyGroups.size) throw new Error('SURGE_ACCEPTANCE_CORE_STRATEGY_SURFACE_INVALID')
  for (const [name, definition] of coreStrategyGroups) {
    if (actual.get(name) !== definition) throw new Error('SURGE_ACCEPTANCE_CORE_STRATEGY_SURFACE_INVALID')
  }
}

function assertCoreProjectSemantics(project) {
  const blockTypeByTitle = new Map(project.graph.nodes.map((node) => [node.data.title, node.data.blockType]))
  if (blockTypeByTitle.get('Manual Select') !== 'manual-select'
    || blockTypeByTitle.get('Manual Fixed') !== 'fixed-proxy') {
    throw new Error('SURGE_ACCEPTANCE_CORE_STRATEGY_SEMANTICS_INVALID')
  }
}

function isFixtureProxyHost(server) {
  return typeof server === 'string' && server.endsWith('.example.invalid')
}

export function assertMaterializedProxySafety(sources, scenarioId = 'unknown') {
  for (const source of sources) {
    if (source.kind !== 'manual-proxy' && source.kind !== 'subscription') continue
    for (const proxy of source.proxies ?? []) {
      if (proxy.protocol === 'unmodeled') continue
      if (!isFixtureProxyHost(proxy.server)) {
        throw new Error(`SURGE_ACCEPTANCE_PROXY_HOST_NOT_FIXTURE ${scenarioId}`)
      }
      const credentials = [proxy.username, proxy.password, proxy.uuid, proxy.obfs?.password]
      if (credentials.some((credential) => (
        credential !== undefined
        && (typeof credential !== 'string' || !fixtureCredentialPattern.test(credential))
      ))) {
        throw new Error(`SURGE_ACCEPTANCE_PROXY_CREDENTIAL_NOT_FIXTURE ${scenarioId}`)
      }
    }
  }
}

export function assertGeneratedProxyHostSafety(content, scenarioId = 'unknown') {
  for (const line of sectionLines(content, 'Proxy', 'Proxy Group')) {
    const separator = line.indexOf(' = ')
    const fields = separator === -1 ? [] : line.slice(separator + 3).split(',').map((field) => field.trim())
    if (fields.length < 3 || !isFixtureProxyHost(fields[1])) {
      throw new Error(`SURGE_ACCEPTANCE_GENERATED_PROXY_HOST_NOT_FIXTURE ${scenarioId}`)
    }
  }
}

function assertProfile(project, scenario, content) {
  if (scenario.safeToImport !== true) throw new Error(`SURGE_ACCEPTANCE_IMPORT_SAFETY_UNDECLARED ${scenario.id}`)
  if (content.includes('\r') || !content.endsWith('\n') || content.endsWith('\n\n')) {
    throw new Error(`SURGE_ACCEPTANCE_NON_DETERMINISTIC_NEWLINE ${scenario.id}`)
  }
  if (content.includes(root) || /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(content)) {
    throw new Error(`SURGE_ACCEPTANCE_ARTIFACT_CONTAINS_RUNTIME_DATA ${scenario.id}`)
  }
  if (project.primaryTarget !== 'surge' || !project.graph.nodes.some((node) => node.data.client === 'surge')) {
    throw new Error(`SURGE_ACCEPTANCE_TARGET_INVALID ${scenario.id}`)
  }
  const actualSections = sectionNames(content)
  if (JSON.stringify(actualSections) !== JSON.stringify(scenario.expectedSections)) {
    throw new Error(`SURGE_ACCEPTANCE_SECTIONS_INVALID ${scenario.id}`)
  }
  const actualKeys = generalKeys(content)
  const expectedKeys = scenario.expectedGeneralKeys
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`SURGE_ACCEPTANCE_GENERAL_KEYS_INVALID ${scenario.id} expected=${expectedKeys.join(',')} actual=${actualKeys.join(',')}`)
  }
  for (const key of deferredGeneralKeys) {
    if (actualKeys.includes(key)) throw new Error(`SURGE_ACCEPTANCE_DEFERRED_KEY_EMITTED ${scenario.id} ${key}`)
  }
  if (actualKeys.filter((key) => key === 'always-real-ip').length > 1) {
    throw new Error(`SURGE_ACCEPTANCE_DNS_OWNER_DUPLICATE ${scenario.id}`)
  }
  if (scenario.id === '02-general-connectivity' && actualKeys.filter((key) => key === 'proxy-test-url').length !== 1) {
    throw new Error('SURGE_ACCEPTANCE_PROXY_TEST_URL_MISSING')
  }
  if (scenario.id !== '02-general-connectivity' && scenario.id !== '01-core'
    && actualKeys.filter((key) => key === 'proxy-test-url').length !== 1) {
    throw new Error(`SURGE_ACCEPTANCE_PROXY_TEST_URL_MISSING ${scenario.id}`)
  }
  assertGeneratedProxyHostSafety(content, scenario.id)
  if (scenario.id === '01-core') {
    assertCoreProjectSemantics(project)
    assertCoreStrategySurface(content)
  }
}

function assertPublicFixtureSafety(project, scenario) {
  const serialized = JSON.stringify(project)
  if (/\b(?:10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)\b/.test(serialized)) {
    throw new Error(`SURGE_ACCEPTANCE_PRIVATE_LAN_ADDRESS ${scenario.id}`)
  }
  if (scenario.classification === 'LOCAL-NETWORK-SIDE-EFFECT'
    && !serialized.includes('192.0.2.0/24')) throw new Error(`SURGE_ACCEPTANCE_TEST_NET_MISSING ${scenario.id}`)
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.scenarios) || manifest.scenarios.length !== 5) {
    throw new Error('SURGE_ACCEPTANCE_MANIFEST_INVALID')
  }
  const modules = await loadCompilerModules()
  const seenGeneralKeys = new Map()
  const results = []
  for (const scenario of manifest.scenarios) {
    const projectPath = path.join(fixtureRoot, scenario.project)
    const expectedPath = path.join(fixtureRoot, scenario.expected)
    const project = JSON.parse(await readFile(projectPath, 'utf8'))
    assertPublicFixtureSafety(project, scenario)
    const result = compileProject(project, modules)
    assertProfile(project, scenario, result.content)
    for (const key of generalKeys(result.content)) seenGeneralKeys.set(key, [...(seenGeneralKeys.get(key) ?? []), scenario.id])
    if (update) await writeFile(expectedPath, result.content, 'utf8')
    else {
      let expected
      try { expected = await readFile(expectedPath, 'utf8') } catch { throw new Error(`SURGE_ACCEPTANCE_FIXTURE_MISSING ${scenario.id}`) }
      if (expected !== result.content) throw new Error(`SURGE_ACCEPTANCE_FIXTURE_DRIFT ${scenario.id}`)
    }
    results.push({ scenario, result, keys: generalKeys(result.content) })
  }
  if (JSON.stringify(seenGeneralKeys.get('proxy-test-url')) !== JSON.stringify(['02-general-connectivity', '03-dns-behavior', '04-vif-routes', '05-proxy-bypass'])) {
    throw new Error('SURGE_ACCEPTANCE_PROXY_TEST_URL_OWNERSHIP_INVALID')
  }
  if (JSON.stringify(seenGeneralKeys.get('internet-test-url')) !== JSON.stringify(['02-general-connectivity'])) {
    throw new Error('SURGE_ACCEPTANCE_INTERNET_TEST_URL_SCOPE_INVALID')
  }
  process.stdout.write(`SURGE_ACCEPTANCE_${update ? 'UPDATED' : 'VERIFIED'} scenarioCount=${results.length}\n`)
  for (const { scenario, result, keys } of results) {
    process.stdout.write(`scenario=${scenario.id} status=PASS classification=${scenario.classification} generalKeys=${keys.join(',') || 'none'} proxyCount=${result.stats?.proxyCount ?? 0}\n`)
  }
  process.stdout.write(`fixtureDir=${path.relative(root, fixtureRoot)}\n`)
}

const invokedDirectly = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'SURGE_ACCEPTANCE_FAILED'}\n`)
    process.exitCode = 1
  })
}
