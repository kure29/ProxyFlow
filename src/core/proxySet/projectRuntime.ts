import type { ProxyFlowProject } from '../../types/project'
import { compileGraph } from '../graphCompiler'
import type { ProxySetRef } from '../ir'
import type { SubscriptionSnapshot } from '../subscription'
import { createMaterializationContext, materializeProxySet, type MaterializationIssue } from './materialize'

export interface PipelineNodeRuntime {
  status: 'ready' | 'stale' | 'error' | 'unavailable'
  inputCount: number
  outputCount: number
  removedCount: number
  protocolCount?: number
  issues: MaterializationIssue[]
}

export function deriveProjectRuntime(project: ProxyFlowProject, subscriptionSnapshots: Record<string, SubscriptionSnapshot>) {
  const graph = compileGraph(project, { subscriptionSnapshots })
  const runtime = new Map<string, PipelineNodeRuntime>()
  if (!graph.ir) return runtime
  const context = createMaterializationContext()

  for (const source of graph.ir.sources) {
    if (source.kind !== 'manual-proxy' && source.kind !== 'subscription') continue
    const result = materializeProxySet(graph.ir, { kind: 'source', id: source.id }, context)
    const snapshot = subscriptionSnapshots[source.id]
    runtime.set(source.id, {
      status: snapshot?.stale ? 'stale' : result.status === 'error' ? source.kind === 'subscription' && !snapshot ? 'unavailable' : 'error' : 'ready',
      inputCount: result.inputCount, outputCount: result.outputCount, removedCount: result.removedCount,
      protocolCount: new Set(result.proxies.map((proxy) => proxy.protocol)).size,
      issues: result.issues,
    })
  }

  for (const transform of graph.ir.transforms) {
    const result = materializeProxySet(graph.ir, { kind: 'transform', id: transform.id }, context)
    runtime.set(transform.id, {
      status: result.status === 'error' ? 'error' : 'ready', inputCount: result.inputCount,
      outputCount: result.outputCount, removedCount: result.removedCount, issues: result.issues,
    })
  }

  for (const strategy of graph.ir.strategies) {
    if (strategy.kind === 'chain') continue
    const refs: ProxySetRef[] = strategy.kind === 'auto-select' || strategy.kind === 'load-balance'
      ? [strategy.source]
      : strategy.kind === 'fixed' ? [] : strategy.candidates.filter((candidate): candidate is ProxySetRef => candidate.kind !== 'strategy')
    const results = refs.map((ref) => materializeProxySet(graph.ir!, ref, context))
    const outputCount = strategy.kind === 'fixed' ? (strategy.proxyId ? 1 : 0) : results.reduce((sum, result) => sum + result.outputCount, 0)
    runtime.set(strategy.id, {
      status: results.some((result) => result.status === 'error') ? 'error' : 'ready', inputCount: outputCount,
      outputCount, removedCount: 0, issues: results.flatMap((result) => result.issues),
    })
  }
  return runtime
}
