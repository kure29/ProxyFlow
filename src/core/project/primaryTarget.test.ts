import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../data/newProject'
import type { ProxyFlowProject } from '../../types/project'
import { resolveProjectPrimaryTarget } from './primaryTarget'

describe('project primary target resolution', () => {
  it('prefers valid explicit metadata', () => {
    const project = createBlankProject('sing-box')
    expect(resolveProjectPrimaryTarget(project)).toEqual({
      target: 'sing-box', reason: 'explicit', requiresSelection: false,
    })
  })

  it('infers a legacy project with one production output without mutating it', () => {
    const project = createBlankProject('mihomo')
    delete project.primaryTarget
    const before = structuredClone(project)
    expect(resolveProjectPrimaryTarget(project)).toEqual({
      target: 'mihomo', reason: 'single-output', requiresSelection: false,
    })
    expect(project).toEqual(before)
  })

  it('requires a choice for missing or multiple outputs without deleting graph data', () => {
    const missing = createBlankProject('mihomo')
    delete missing.primaryTarget
    missing.graph.nodes = missing.graph.nodes.filter((node) => node.data.blockType !== 'output')
    expect(resolveProjectPrimaryTarget(missing)).toEqual({
      target: null, reason: 'missing-output', requiresSelection: true,
    })

    const multiple = createBlankProject('mihomo')
    delete multiple.primaryTarget
    multiple.graph.nodes.push({
      ...structuredClone(multiple.graph.nodes.find((node) => node.data.blockType === 'output')!),
      id: 'secondary-output',
      data: { ...structuredClone(multiple.graph.nodes.find((node) => node.data.blockType === 'output')!.data), client: 'sing-box' },
    })
    const before = structuredClone(multiple)
    expect(resolveProjectPrimaryTarget(multiple)).toEqual({
      target: null, reason: 'multiple-outputs', requiresSelection: true,
    })
    expect(multiple).toEqual(before)
  })

  it('accepts Surge metadata and fails closed for corrupted metadata and unsupported legacy outputs', () => {
    const surge = createBlankProject('surge')
    expect(resolveProjectPrimaryTarget(surge)).toEqual({
      target: 'surge', reason: 'explicit', requiresSelection: false,
    })

    const corrupted = createBlankProject('mihomo') as unknown as Record<string, unknown>
    corrupted.primaryTarget = 'loon'
    expect(resolveProjectPrimaryTarget(corrupted as unknown as ProxyFlowProject)).toEqual({
      target: null, reason: 'invalid-metadata', requiresSelection: true,
    })

    const unsupported = createBlankProject('mihomo')
    delete unsupported.primaryTarget
    unsupported.graph.nodes.find((node) => node.data.blockType === 'output')!.data.client = 'loon'
    expect(resolveProjectPrimaryTarget(unsupported)).toEqual({
      target: null, reason: 'unsupported-output', requiresSelection: true,
    })
  })
})
