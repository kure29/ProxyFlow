import { describe, expect, it } from 'vitest'
import { PROJECT_SCHEMA_VERSION } from '../core/project/version'
import { createBlankProject } from './newProject'

describe('blank project creation', () => {
  it('creates a minimal internal Loon project without Mihomo-specific defaults', () => {
    const project = createBlankProject('loon')
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')

    expect(project.version).toBe(PROJECT_SCHEMA_VERSION)
    expect(project.primaryTarget).toBe('loon')
    expect(output?.data).toEqual(expect.objectContaining({
      client: 'loon', title: 'Loon Output', compatibility: 'Supported',
    }))
    expect(output?.data.mihomoProfile).toBeUndefined()
    expect(project.graph.nodes.some((node) => node.data.blockType === 'dns')).toBe(false)
    expect(project.graph.edges.some((edge) => edge.data?.semantic === 'dns')).toBe(false)
  })

  it('creates an exposed Shadowrocket project with supported output metadata', () => {
    const project = createBlankProject('shadowrocket')
    const output = project.graph.nodes.find((node) => node.data.blockType === 'output')

    expect(output?.data).toEqual(expect.objectContaining({ client: 'shadowrocket', compatibility: 'Supported' }))
  })
})
