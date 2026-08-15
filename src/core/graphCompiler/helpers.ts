import type { GraphNode } from '../../types/project'
import type { HealthCheckIR, ProxySetRef, StrategyCandidateRef } from '../ir'
import { semanticIssue } from '../ir'
import type { GraphCompileContext } from './context'

const sourceTypes = new Set(['subscription', 'manual-proxy', 'provider', 'import-config'])
const transformTypes = new Set(['filter', 'rename', 'sort', 'deduplicate', 'merge', 'limit'])
const strategyTypes = new Set(['fixed-proxy', 'manual-select', 'auto-select', 'fallback', 'load-balance', 'proxy-chain'])

export const isSourceNode = (node: GraphNode) => sourceTypes.has(node.data.blockType)
export const isTransformNode = (node: GraphNode) => transformTypes.has(node.data.blockType)
export const isStrategyNode = (node: GraphNode) => strategyTypes.has(node.data.blockType)

export function proxySetRefForNode(node: GraphNode): ProxySetRef | undefined {
  if (isSourceNode(node)) return { kind: 'source', id: node.id }
  if (isTransformNode(node)) return { kind: 'transform', id: node.id }
  return undefined
}

export function strategyCandidateRefForNode(node: GraphNode): StrategyCandidateRef | undefined {
  const proxySet = proxySetRefForNode(node)
  if (proxySet) return proxySet
  if (isStrategyNode(node)) return { kind: 'strategy', id: node.id }
  return undefined
}

export function incomingProxySetRefs(node: GraphNode, context: GraphCompileContext): ProxySetRef[] {
  const refs: ProxySetRef[] = []
  for (const edge of context.incomingEdges.get(node.id) ?? []) {
    if (edge.data?.semantic !== 'data') continue
    const source = context.nodesById.get(edge.source)
    const ref = source && proxySetRefForNode(source)
    if (ref) refs.push(ref)
    else context.addIssue(semanticIssue(
      'PROXY_SET_INPUT_INVALID',
      'error',
      'compile',
      `Node "${node.data.title}" has a data input that is not a source or transform.`,
      { nodeId: node.id, entity: { type: 'node', id: node.id } },
    ))
  }
  return refs
}

export function incomingCandidateRefs(node: GraphNode, context: GraphCompileContext): StrategyCandidateRef[] {
  const refs: StrategyCandidateRef[] = []
  for (const edge of context.incomingEdges.get(node.id) ?? []) {
    if (!['data', 'strategy'].includes(String(edge.data?.semantic))) continue
    const source = context.nodesById.get(edge.source)
    const ref = source && strategyCandidateRefForNode(source)
    if (ref) refs.push(ref)
  }
  return refs
}

export function firstProxySetInput(
  node: GraphNode,
  context: GraphCompileContext,
  missingCode: string,
): ProxySetRef | undefined {
  const inputs = incomingProxySetRefs(node, context)
  if (inputs.length === 0) {
    context.addIssue(semanticIssue(
      missingCode,
      'error',
      'compile',
      `Node "${node.data.title}" requires a proxy-set input.`,
      { nodeId: node.id, entity: { type: node.data.blockType, id: node.id } },
    ))
    return undefined
  }
  if (inputs.length > 1) {
    context.addIssue(semanticIssue(
      'MULTIPLE_INPUTS_USE_FIRST',
      'warning',
      'compile',
      `Node "${node.data.title}" has multiple inputs; deterministic edge order selects the first one.`,
      { nodeId: node.id, entity: { type: node.data.blockType, id: node.id } },
    ))
  }
  return inputs[0]
}

export function healthCheckForNode(node: GraphNode): HealthCheckIR | undefined {
  const healthCheck: HealthCheckIR = {
    url: node.data.testUrl,
    intervalSeconds: node.data.interval,
    toleranceMs: node.data.tolerance,
  }
  return Object.values(healthCheck).some((value) => value !== undefined) ? healthCheck : undefined
}
