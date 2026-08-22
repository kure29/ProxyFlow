import type { ProxyFlowIR, ProxySetRef, RemoteProxySourceIR, TransformIR } from '../ir'

export interface ProxySetLineageOperation {
  id: string
  kind: TransformIR['kind']
}

export interface ProxySetLineage {
  sourceIds: string[]
  remoteSources: RemoteProxySourceIR[]
  operations: ProxySetLineageOperation[]
  mixed: boolean
  cycle: boolean
}

/** Analyze semantic ancestry without inspecting target syntax or endpoint display metadata. */
export function analyzeProxySetLineage(ir: ProxyFlowIR, ref: ProxySetRef): ProxySetLineage {
  return visit(ir, ref, new Set())
}

function visit(ir: ProxyFlowIR, ref: ProxySetRef, stack: Set<string>): ProxySetLineage {
  const key = `${ref.kind}:${ref.id}`
  if (stack.has(key)) return empty(true)
  if (ref.kind === 'source') {
    const source = ir.sources.find((item) => item.id === ref.id)
    if (!source) return empty()
    return {
      sourceIds: [source.id],
      remoteSources: source.kind === 'subscription' && source.remote ? [source.remote] : [],
      operations: [],
      mixed: false,
      cycle: false,
    }
  }

  const transform = ir.transforms.find((item) => item.id === ref.id)
  if (!transform) return empty()
  const next = new Set(stack).add(key)
  const upstream = transform.kind === 'merge'
    ? combine(transform.inputs.map((input) => visit(ir, input, next)))
    : visit(ir, transform.input, next)
  return {
    ...upstream,
    operations: [...upstream.operations, { id: transform.id, kind: transform.kind }],
  }
}

function combine(lineages: ProxySetLineage[]): ProxySetLineage {
  const sourceIds = unique(lineages.flatMap((lineage) => lineage.sourceIds))
  const remoteSources = uniqueById(lineages.flatMap((lineage) => lineage.remoteSources))
  return {
    sourceIds,
    remoteSources,
    operations: lineages.flatMap((lineage) => lineage.operations),
    mixed: sourceIds.length > 1 || lineages.some((lineage) => lineage.mixed),
    cycle: lineages.some((lineage) => lineage.cycle),
  }
}

function empty(cycle = false): ProxySetLineage {
  return { sourceIds: [], remoteSources: [], operations: [], mixed: false, cycle }
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function uniqueById(values: RemoteProxySourceIR[]) {
  return [...new Map(values.map((value) => [value.id, value])).values()]
}
