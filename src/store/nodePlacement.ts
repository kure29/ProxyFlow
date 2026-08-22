import type { XYPosition } from '@xyflow/react'

export const DEFAULT_FLOW_NODE_SIZE = { width: 236, height: 220 }
export const FLOW_NODE_GAP = 24

interface PositionedNode {
  position: XYPosition
  width?: number | null
  height?: number | null
  measured?: { width?: number; height?: number }
}

interface NodeSize {
  width: number
  height: number
}

export function findAvailableNodePosition(
  ideal: XYPosition,
  nodes: readonly PositionedNode[],
  size: NodeSize = DEFAULT_FLOW_NODE_SIZE,
) {
  const columns = 3
  const stepX = size.width + FLOW_NODE_GAP
  const stepY = size.height + FLOW_NODE_GAP
  const maxCandidates = Math.max(60, nodes.length * 6 + 12)

  for (let index = 0; index < maxCandidates; index += 1) {
    const row = Math.floor(index / columns)
    const columnInRow = index % columns
    const column = row % 2 === 0 ? columnInRow : columns - 1 - columnInRow
    const candidate = { x: ideal.x + column * stepX, y: ideal.y + row * stepY }
    if (nodes.every((node) => !boundsOverlap(candidate, size, nodeBounds(node), FLOW_NODE_GAP))) return candidate
  }

  return { x: ideal.x, y: ideal.y + maxCandidates * stepY }
}

function nodeBounds(node: PositionedNode) {
  return {
    position: node.position,
    width: node.measured?.width ?? node.width ?? DEFAULT_FLOW_NODE_SIZE.width,
    height: node.measured?.height ?? node.height ?? DEFAULT_FLOW_NODE_SIZE.height,
  }
}

function boundsOverlap(
  leftPosition: XYPosition,
  leftSize: NodeSize,
  right: { position: XYPosition; width: number; height: number },
  gap: number,
) {
  return leftPosition.x < right.position.x + right.width + gap
    && leftPosition.x + leftSize.width + gap > right.position.x
    && leftPosition.y < right.position.y + right.height + gap
    && leftPosition.y + leftSize.height + gap > right.position.y
}
