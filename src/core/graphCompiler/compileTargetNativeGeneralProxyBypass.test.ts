import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../data/newProject'
import { compileGraph } from './compileGraph'

function project() {
  const value = createBlankProject('surge')
  value.id = 'g3c-project'
  const output = value.graph.nodes.find((node) => node.id === 'output')!
  output.data.client = 'surge'
  output.data.targetNativeSurgeGeneralProxyBypass = { target: 'surge', kind: 'general-proxy-bypass', skipProxy: ['localhost'], excludeSimpleHostnames: false }
  return value
}

describe('Graph Compiler Surge General Proxy Bypass extraction', () => {
  it('lifts valid Output-owned intent and binds compiler provenance outside Universal IR', () => {
    const result = compileGraph(project(), { validationTarget: 'surge' })
    expect(result.success).toBe(true)
    expect(result.targetNativeSurgeGeneralProxyBypasses).toEqual([{ target: 'surge', kind: 'general-proxy-bypass', skipProxy: ['localhost'], excludeSimpleHostnames: false, outputNodeId: 'output' }])
    expect(result.ir?.outputs[0]).not.toHaveProperty('targetNativeSurgeGeneralProxyBypass')
    expect(result.ir?.routes).not.toContainEqual(expect.objectContaining({ skipProxy: expect.anything() }))
  })

  it('keeps disabled intent inert and catches malformed siblings regardless of order', () => {
    const disabled = project()
    disabled.graph.nodes.find((node) => node.id === 'output')!.data.disabled = true
    expect(compileGraph(disabled, { validationTarget: 'surge' }).targetNativeSurgeGeneralProxyBypasses).toEqual([])

    const malformed = project()
    malformed.graph.nodes.push({ ...malformed.graph.nodes.find((node) => node.id === 'output')!, id: 'bad', data: { ...malformed.graph.nodes.find((node) => node.id === 'output')!.data, title: 'Bad', targetNativeSurgeGeneralProxyBypass: { target: 'surge', kind: 'general-proxy-bypass', skipProxy: ['bad value'] } as never } })
    const result = compileGraph(malformed, { validationTarget: 'surge' })
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_PROXY_BYPASS_HOST_INVALID', severity: 'error' }))
  })

  it('blocks ambiguous enabled Surge Output ownership', () => {
    const value = project()
    const output = value.graph.nodes.find((node) => node.id === 'output')!
    value.graph.nodes.push({ ...output, id: 'output-b', data: { ...output.data, title: 'Second Surge' } })
    const result = compileGraph(value, { validationTarget: 'surge' })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_PROXY_BYPASS_AMBIGUOUS', severity: 'error' }))
  })
})
