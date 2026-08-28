import { describe, expect, it } from 'vitest'
import { compileGraph } from './compileGraph'
import { createBlankProject } from '../../data/newProject'

function project() {
  const value = createBlankProject('surge')
  value.id = 'g2-project'
  const output = value.graph.nodes.find((node) => node.id === 'output')!
  output.data.client = 'surge'
  output.data.targetNativeSurgeGeneralConnectivity = { target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://example.test/ping' }
  return value
}

describe('Graph Compiler Surge General Connectivity extraction', () => {
  it('lifts valid Output config and binds compiler-owned outputNodeId outside Universal IR', () => {
    const result = compileGraph(project(), { validationTarget: 'surge' })
    expect(result.success).toBe(true)
    expect(result.targetNativeSurgeGeneralConnectivityRecords).toEqual([{ target: 'surge', kind: 'general-connectivity', internetTestUrl: 'https://example.test/ping', outputNodeId: 'output' }])
    expect(result.ir?.outputs[0]).not.toHaveProperty('targetNativeSurgeGeneralConnectivity')
  })

  it('fails closed for non-Output placement and malformed config', () => {
    const value = project()
    const output = value.graph.nodes.find((node) => node.id === 'output')!
    output.data.blockType = 'final'
    expect(compileGraph(value).issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_INVALID', severity: 'error' }))
    const malformed = project()
    malformed.graph.nodes.find((node) => node.id === 'output')!.data.targetNativeSurgeGeneralConnectivity = { target: 'surge', kind: 'general-connectivity' } as never
    expect(compileGraph(malformed).issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_INVALID', severity: 'error' }))
  })

  it('retains disabled intent without lifting it', () => {
    const value = project()
    const output = value.graph.nodes.find((node) => node.id === 'output')!
    output.data.disabled = true
    value.graph.nodes.push({ ...output, id: 'output-b', data: { ...output.data, disabled: false, targetNativeSurgeGeneralConnectivity: undefined } })
    const result = compileGraph(value, { validationTarget: 'surge' })
    expect(result.success).toBe(true)
    expect(result.targetNativeSurgeGeneralConnectivityRecords).toEqual([])
    expect(output.data.targetNativeSurgeGeneralConnectivity).toBeDefined()
  })

  it('blocks ambiguous enabled Surge Output ownership', () => {
    const value = project()
    const output = value.graph.nodes.find((node) => node.id === 'output')!
    value.graph.nodes.push({ ...output, id: 'output-b', data: { ...output.data, title: 'Second Surge' } })
    const result = compileGraph(value, { validationTarget: 'surge' })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_GENERAL_AMBIGUOUS', severity: 'error' }))
  })
})
