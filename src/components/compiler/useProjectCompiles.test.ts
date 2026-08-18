import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../data/newProject'
import { resolveMihomoProfileOutput } from './useProjectCompiles'

describe('Project target compile selection', () => {
  it('keeps using a preserved Mihomo profile after Primary Target changes', () => {
    const project = createBlankProject('mihomo')
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')!
    output.data.client = 'sing-box'

    expect(resolveMihomoProfileOutput(project.graph.nodes, null)?.data.mihomoProfile).toBeDefined()
  })
})
