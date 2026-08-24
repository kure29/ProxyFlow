import { compileGraph, type GraphCompileResult } from '../../core/graphCompiler'
import { stableOpaqueHash } from '../../core/proxy'
import { parseSubscription, type SubscriptionSnapshot } from '../../core/subscription'
import type { ProxyFlowProject } from '../../types/project'
import { compileLoon } from './compiler'
import { checkLoonProxy } from './proxies'
import type { CompileResult } from '../../core/compiler/compilerTypes'
import type { ProxyFlowIR } from '../../core/ir'

/** A small, deterministic wrapper used only by the developer acceptance tools. */
export interface LoonAcceptanceCompilation {
  project: ProxyFlowProject
  parsed: ReturnType<typeof parseSubscription>
  graph: GraphCompileResult
  loon?: CompileResult
}

export interface LoonAcceptanceCompileOptions {
  /** Keep an explicitly incompatible first endpoint when testing Fixed behavior. */
  fixedProxyMode?: 'first-compatible' | 'first' | 'preserve'
}

export function compileLoonAcceptanceProject(
  input: ProxyFlowProject,
  contentOverride?: string,
  options: LoonAcceptanceCompileOptions = {},
): LoonAcceptanceCompilation {
  const project = structuredClone(input)
  const source = project.graph.nodes.find((node) => node.data.blockType === 'subscription')
  const content = contentOverride ?? String(source?.data.subscriptionContent ?? '')
  if (!source) throw new Error('LOON_ACCEPTANCE_SOURCE_MISSING')

  const parsed = parseSubscription(content, {
    sourceId: source.id,
    sourceName: source.data.title,
    filename: 'loon-acceptance.fixture',
  })
  const snapshot = acceptanceSnapshot(source.id, content, parsed)
  const fixed = project.graph.nodes.find((node) => node.data.blockType === 'fixed-proxy')
  const fixedProxyMode = options.fixedProxyMode ?? 'first-compatible'
  if (fixed && fixedProxyMode !== 'preserve') {
    const candidate = fixedProxyMode === 'first'
      ? parsed.proxies[0]
      : parsed.proxies.find((endpoint) => !checkLoonProxy(endpoint).some((issue) => issue.severity === 'error')) ?? parsed.proxies[0]
    fixed.data.proxyId = candidate?.id ?? '__NO_COMPATIBLE_PROXY__'
  }

  const graph = compileGraph(project, { subscriptionSnapshots: { [source.id]: snapshot } })
  if (!graph.success || !graph.ir) return { project, parsed, graph }
  return { project, parsed, graph, loon: compileLoon(graph.ir, { now: fixedNow }) }
}

/** Build the same shape the runtime snapshot path supplies, without I/O or time. */
function acceptanceSnapshot(
  sourceId: string,
  content: string,
  result: ReturnType<typeof parseSubscription>,
): SubscriptionSnapshot {
  // This snapshot is an in-memory acceptance adapter only; it is never
  // committed to the runtime cache. The opaque identity keeps fixture runs
  // deterministic without introducing I/O or a network-backed hash step.
  const contentHash = stableOpaqueHash(content)
  const timestamp = '2026-01-01T00:00:00.000Z'
  return {
    snapshotId: `acceptance-${contentHash}`,
    sourceId,
    snapshotSchemaVersion: 1,
    identityAlgorithmVersion: 1,
    inputKind: 'paste',
    createdAt: timestamp,
    fetchedAt: timestamp,
    parsedAt: timestamp,
    committedAt: timestamp,
    contentHash,
    sourceConfigFingerprint: stableOpaqueHash(`${sourceId}\u0000${content}`),
    format: result.format,
    result,
    readyCount: result.readyCount,
    partialCount: result.partialCount,
    unsupportedCount: result.unsupportedCount,
    issues: result.issues,
    quality: result.readyCount + result.partialCount > 0 ? 'usable' : 'empty',
  }
}

export function acceptanceDiagnosticCounts(result: LoonAcceptanceCompilation) {
  const issues = [...result.graph.issues, ...(result.loon?.issues ?? [])]
  const stats = result.loon?.stats
  return {
    candidateCount: stats?.candidateCount ?? result.parsed.detectedCount,
    compatibleEndpointCount: stats?.compatibleEndpointCount ?? 0,
    skippedEndpointCount: stats?.skippedEndpointCount ?? 0,
    blockingIssueCount: stats?.blockingIssueCount ?? issues.filter((issue) => issue.severity === 'error').length,
    issueCodeCounts: countIssueCodes(issues),
  }
}

export function compileLoonAcceptanceIr(ir: ProxyFlowIR) {
  return compileLoon(ir, { now: fixedNow })
}

export function fixedNow() {
  return new Date('2026-01-01T00:00:00.000Z')
}

function countIssueCodes(issues: readonly { code: string }[]) {
  const counts: Record<string, number> = {}
  for (const issue of issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}
