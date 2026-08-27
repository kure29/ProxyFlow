import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { surgeNativeAcceptanceProject } from '../__fixtures__/surgeNativeStrategies'
import type { ProxyFlowProject } from '../../types/project'
import { compileGraph } from './compileGraph'

const enabledOptions = { target: 'surge' as const, kind: 'final-options' as const, dnsFailed: true as const }

function universalProject(targetKind: 'strategy' | 'direct' | 'reject' = 'strategy') {
  const project = structuredClone(demoProject)
  project.primaryTarget = 'surge'
  const final = project.graph.nodes.find((node) => node.id === 'final-route')!
  final.data.targetNativeFinalOptions = enabledOptions
  final.data.targetKind = targetKind
  if (targetKind !== 'strategy') {
    final.data.targetId = undefined
    final.data.targetLabel = targetKind.toUpperCase()
  }
  return project
}

describe('compileTargetNativeFinalOptions', () => {
  it.each(['strategy', 'reject', 'direct'] as const)('keeps %s Final ownership separate from the modifier', (targetKind) => {
    const result = compileGraph(universalProject(targetKind), { validationTarget: 'surge' })
    expect(result.success).toBe(true)
    expect(result.ir?.finalRoute?.target.kind).toBe(targetKind)
    expect(result.targetNativeFinalOptions).toEqual({ finalNodeId: 'final-route', ...enabledOptions })
    expect(result.ir?.finalRoute).not.toHaveProperty('dnsFailed')
  })

  it('keeps a native strategy target in nativeFinalRoute and its modifier separate', () => {
    const project = structuredClone(surgeNativeAcceptanceProject)
    project.graph.nodes.find((node) => node.id === 'final-route')!.data.targetNativeFinalOptions = enabledOptions
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success).toBe(true)
    expect(result.ir?.finalRoute).toBeUndefined()
    expect(result.nativeFinalRoute).toEqual(expect.objectContaining({ id: 'final-route', target: { kind: 'strategy', id: 'hk-subnet' } }))
    expect(result.targetNativeFinalOptions).toEqual({ finalNodeId: 'final-route', ...enabledOptions })
  })

  it('blocks active options on a non-effective enabled Final without transferring them', () => {
    const project = universalProject()
    const first = project.graph.nodes.find((node) => node.id === 'final-route')!
    first.data.targetNativeFinalOptions = undefined
    project.graph.nodes.push({ ...structuredClone(first), id: 'final-second', data: { ...structuredClone(first.data), targetNativeFinalOptions: enabledOptions } })
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success).toBe(false)
    expect(result.targetNativeFinalOptions).toBeUndefined()
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FINAL_MULTIPLE', severity: 'warning', nodeId: 'final-route' }),
      expect.objectContaining({ code: 'TARGET_NATIVE_FINAL_OPTIONS_NON_EFFECTIVE', severity: 'error', nodeId: 'final-second' }),
    ]))
  })

  it('uses options from the selected Final when another enabled Final has none', () => {
    const project = universalProject()
    const first = project.graph.nodes.find((node) => node.id === 'final-route')!
    project.graph.nodes.push({ ...structuredClone(first), id: 'final-second', data: { ...structuredClone(first.data), targetNativeFinalOptions: undefined } })
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success).toBe(true)
    expect(result.targetNativeFinalOptions).toEqual({ finalNodeId: 'final-route', ...enabledOptions })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'FINAL_MULTIPLE', severity: 'warning', nodeId: 'final-route' }))
  })

  it('ignores a disabled Final modifier and preserves ordinary Final compilation', () => {
    const project = universalProject()
    const first = project.graph.nodes.find((node) => node.id === 'final-route')!
    first.data.targetNativeFinalOptions = undefined
    project.graph.nodes.push({ ...structuredClone(first), id: 'final-disabled', data: { ...structuredClone(first.data), disabled: true, targetNativeFinalOptions: enabledOptions } })
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success).toBe(true)
    expect(result.targetNativeFinalOptions).toBeUndefined()
    expect(result.issues.some((issue) => issue.code === 'FINAL_MULTIPLE')).toBe(false)
  })

  it('fails closed for a non-Surge validation target without deleting project intent', () => {
    const project = universalProject()
    const result = compileGraph(project, { validationTarget: 'mihomo' })
    expect(result.success).toBe(false)
    expect(result.targetNativeFinalOptions).toBeUndefined()
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_FINAL_OPTIONS_UNSUPPORTED', severity: 'error' }))
    expect(project.graph.nodes.find((node) => node.id === 'final-route')?.data.targetNativeFinalOptions).toEqual(enabledOptions)
  })

  it('retains effective Final provenance when its target is invalid', () => {
    const project = universalProject()
    const final = project.graph.nodes.find((node) => node.id === 'final-route')!
    final.data.targetKind = 'strategy'
    final.data.targetId = 'missing-strategy'
    final.data.targetLabel = 'Missing'
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success).toBe(false)
    expect(result.targetNativeFinalOptions).toEqual({ finalNodeId: 'final-route', ...enabledOptions })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'FINAL_TARGET_MISSING', severity: 'error', nodeId: 'final-route' }))
  })

  it('rejects active Final options attached to a non-Final node', () => {
    const project = universalProject()
    project.graph.nodes.find((node) => node.data.blockType === 'service-rule')!.data.targetNativeFinalOptions = enabledOptions
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_FINAL_OPTIONS_INVALID', severity: 'error' }))
  })

  it('keeps FINAL_MISSING unchanged', () => {
    const project: ProxyFlowProject = structuredClone(universalProject())
    project.graph.nodes = project.graph.nodes.filter((node) => node.data.blockType !== 'final')
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success).toBe(false)
    expect(result.targetNativeFinalOptions).toBeUndefined()
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'FINAL_MISSING', severity: 'error' }))
  })
})
