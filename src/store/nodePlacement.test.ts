import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOW_NODE_SIZE, findAvailableNodePosition, FLOW_NODE_GAP } from './nodePlacement'

const ideal = { x: 80, y: 90 }

describe('findAvailableNodePosition', () => {
  it('uses the ideal position on an empty canvas', () => {
    expect(findAvailableNodePosition(ideal, [])).toEqual(ideal)
  })

  it('moves only the new node when the ideal position is occupied', () => {
    const existing = [{ position: { ...ideal } }]
    const before = structuredClone(existing)
    const position = findAvailableNodePosition(ideal, existing)
    expect(position).not.toEqual(ideal)
    expect(existing).toEqual(before)
    expect(overlaps(position, existing[0].position)).toBe(false)
  })

  it('places five consecutively-created nodes without overlap', () => {
    const nodes: Array<{ position: { x: number; y: number } }> = []
    for (let index = 0; index < 5; index += 1) {
      nodes.push({ position: findAvailableNodePosition(ideal, nodes) })
    }
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        expect(overlaps(nodes[left].position, nodes[right].position)).toBe(false)
      }
    }
  })

  it('keeps mixed Strategy, Routing, DNS, and Processing additions separate', () => {
    const nodes: Array<{ type: string; position: { x: number; y: number } }> = []
    for (const type of ['strategy', 'routing', 'dns', 'processing']) {
      nodes.push({ type, position: findAvailableNodePosition(ideal, nodes) })
    }
    expect(new Set(nodes.map((node) => `${node.position.x}:${node.position.y}`)).size).toBe(4)
  })

  it('respects measured bounds from an existing user layout', () => {
    const position = findAvailableNodePosition(ideal, [{ position: ideal, measured: { width: 500, height: 400 } }])
    expect(position.x >= ideal.x + 500 + FLOW_NODE_GAP || position.y >= ideal.y + 400 + FLOW_NODE_GAP).toBe(true)
  })
})

function overlaps(left: { x: number; y: number }, right: { x: number; y: number }) {
  return left.x < right.x + DEFAULT_FLOW_NODE_SIZE.width + FLOW_NODE_GAP
    && left.x + DEFAULT_FLOW_NODE_SIZE.width + FLOW_NODE_GAP > right.x
    && left.y < right.y + DEFAULT_FLOW_NODE_SIZE.height + FLOW_NODE_GAP
    && left.y + DEFAULT_FLOW_NODE_SIZE.height + FLOW_NODE_GAP > right.y
}
