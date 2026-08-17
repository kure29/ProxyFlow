import type { ResolvedProxyEndpointIR, TransformIR } from '../ir'

export type ProcessingExplanation =
  | { kind: 'filter'; mode: 'criterion' | 'conditions'; inputCount: number; outputCount: number; removedCount: number }
  | { kind: 'rename'; mode: 'simple' | 'regex'; changedCount: number }
  | { kind: 'sort'; by: NonNullable<Extract<TransformIR, { kind: 'sort' }>['by']>; direction: NonNullable<Extract<TransformIR, { kind: 'sort' }>['direction']>; reorderedCount: number }
  | { kind: 'deduplicate'; removedCount: number }
  | { kind: 'merge'; sourceCount: number; outputCount: number }
  | { kind: 'limit'; max: number | undefined; inputCount: number; outputCount: number; removedCount: number }

export function explainProcessing(
  transform: TransformIR | undefined,
  input: ResolvedProxyEndpointIR[],
  output: ResolvedProxyEndpointIR[],
): ProcessingExplanation | undefined {
  if (!transform) return undefined
  if (transform.kind === 'filter') return {
    kind: 'filter',
    mode: transform.criterion ? 'criterion' : 'conditions',
    inputCount: input.length,
    outputCount: output.length,
    removedCount: input.length - output.length,
  }
  if (transform.kind === 'rename') return {
    kind: 'rename',
    mode: transform.mode ?? 'regex',
    changedCount: input.reduce((count, proxy, index) => count + (proxy.name !== output[index]?.name ? 1 : 0), 0),
  }
  if (transform.kind === 'sort') return {
    kind: 'sort',
    by: transform.by ?? 'name',
    direction: transform.direction ?? 'ascending',
    reorderedCount: input.reduce((count, proxy, index) => count + (proxy.id !== output[index]?.id ? 1 : 0), 0),
  }
  if (transform.kind === 'deduplicate') return { kind: 'deduplicate', removedCount: input.length - output.length }
  if (transform.kind === 'merge') return { kind: 'merge', sourceCount: transform.inputs.length, outputCount: output.length }
  return {
    kind: 'limit',
    max: transform.max,
    inputCount: input.length,
    outputCount: output.length,
    removedCount: input.length - output.length,
  }
}
