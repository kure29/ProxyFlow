import type { GraphNode } from '../../types/project'
import type { TransformIR } from '../ir'
import type { GraphCompileContext } from './context'
import { firstProxySetInput, incomingProxySetRefs } from './helpers'

export function compileTransforms(context: GraphCompileContext): TransformIR[] {
  return context.project.graph.nodes.flatMap((node): TransformIR[] => {
    if (node.data.disabled) return []
    const base = { id: node.id, name: node.data.title }
    if (node.data.blockType === 'merge') return [{ ...base, kind: 'merge', inputs: incomingProxySetRefs(node, context) }]
    if (!['filter', 'rename', 'sort', 'deduplicate', 'limit'].includes(node.data.blockType)) return []

    const input = firstProxySetInput(node, context, 'TRANSFORM_MISSING_INPUT')
    if (!input) return []
    const transform = compileSingleInputTransform(node, base, input)
    return transform ? [transform] : []
  })
}

function compileSingleInputTransform(
  node: GraphNode,
  base: { id: string; name: string },
  input: Extract<TransformIR, { kind: 'filter' }>['input'],
): Exclude<TransformIR, { kind: 'merge' }> | undefined {
  switch (node.data.blockType) {
    case 'filter':
      return {
        ...base, kind: 'filter', input, include: node.data.include ?? [], exclude: node.data.exclude ?? [],
        ...(node.data.filterMode ? { criterion: filterCriterion(node) } : {}),
        includeRegex: node.data.includeRegex, excludeRegex: node.data.excludeRegex,
        includeRegions: node.data.includeRegions, excludeRegions: node.data.excludeRegions,
        includeProtocols: node.data.includeProtocols, excludeProtocols: node.data.excludeProtocols,
      }
    case 'rename':
      return {
        ...base, kind: 'rename', input, mode: node.data.renameMode ?? 'regex', pattern: node.data.renamePattern,
        replacement: node.data.renameReplacement, ignoreCase: node.data.renameIgnoreCase ?? false, global: node.data.renameGlobal ?? true,
      }
    case 'sort':
      return { ...base, kind: 'sort', input, by: node.data.sortBy, direction: node.data.sortDirection }
    case 'deduplicate':
      return { ...base, kind: 'deduplicate', input, by: 'identity' }
    case 'limit':
      return { ...base, kind: 'limit', input, max: node.data.limit }
    default:
      return undefined
  }
}

function filterCriterion(node: GraphNode): Extract<TransformIR, { kind: 'filter' }>['criterion'] {
  const operation = node.data.filterOperation === 'exclude' ? 'exclude' : 'include'
  if (node.data.filterMode === 'region') return { mode: 'region', operation, regions: node.data.filterRegions ?? [] }
  if (node.data.filterMode === 'regex') return {
    mode: 'regex', operation, pattern: node.data.filterRegexPattern ?? '', ignoreCase: node.data.filterRegexIgnoreCase ?? true,
  }
  return { mode: 'keyword', operation, keyword: node.data.filterKeyword ?? '' }
}
