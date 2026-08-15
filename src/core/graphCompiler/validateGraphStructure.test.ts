import { describe, expect, it } from 'vitest'
import { subscriptionFilterAutoFixture } from '../__fixtures__/graphFixtures'
import { validateGraphStructure } from './validateGraphStructure'

describe('validateGraphStructure', () => {
  it('reports broken edges and self connections with stable codes', () => {
    const project = structuredClone(subscriptionFilterAutoFixture)
    project.graph.edges.push({ id: 'broken', source: 'missing', target: 'filter', type: 'smoothstep', data: { semantic: 'data' } })
    project.graph.edges.push({ id: 'self', source: 'filter', target: 'filter', type: 'smoothstep', data: { semantic: 'data' } })
    expect(validateGraphStructure(project).map((issue) => issue.code)).toEqual(expect.arrayContaining(['GRAPH_BROKEN_EDGE', 'GRAPH_SELF_CONNECTION', 'GRAPH_DATA_CYCLE']))
  })

  it('does not use canvas position as semantic input', () => {
    const moved = structuredClone(subscriptionFilterAutoFixture)
    moved.graph.nodes.forEach((node, index) => { node.position = { x: index * -999, y: index * 777 } })
    expect(validateGraphStructure(moved)).toEqual([])
  })
})
