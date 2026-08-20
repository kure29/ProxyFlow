import type { BlockNodeData } from '../../types/project'

export function isStarterProject(nodes: Array<{ data: Pick<BlockNodeData, 'blockType'> }>) {
  return !nodes.some((node) => !['final', 'output'].includes(node.data.blockType))
}
