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

    const orderedProject = (malformedFirst: boolean) => {
      const value = project()
      const output = value.graph.nodes.find((node) => node.id === 'output')!
      const malformed = {
        ...output,
        id: 'bad',
        data: {
          ...output.data,
          title: 'Bad',
          targetNativeSurgeGeneralProxyBypass: {
            target: 'surge',
            kind: 'general-proxy-bypass',
            skipProxy: ['bad value'],
          } as never,
        },
      }
      const rest = value.graph.nodes.filter((node) => node.id !== 'output')
      value.graph.nodes = malformedFirst ? [malformed, output, ...rest] : [output, malformed, ...rest]
      return value
    }

    const malformedFirst = compileGraph(orderedProject(true), { validationTarget: 'surge' })
    const validFirst = compileGraph(orderedProject(false), { validationTarget: 'surge' })
    expect(malformedFirst.success).toBe(false)
    expect(validFirst.success).toBe(false)
    expect(malformedFirst.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_PROXY_BYPASS_HOST_INVALID', severity: 'error' }))
    expect(validFirst.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_PROXY_BYPASS_HOST_INVALID', severity: 'error' }))
    const issueCodes = (result: typeof malformedFirst) => new Set(result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code))
    expect(issueCodes(malformedFirst)).toEqual(issueCodes(validFirst))
  })

  it.each([null, 'bad', [], 42])('classifies generic malformed family data as TARGET_NATIVE_PROXY_BYPASS_INVALID (%j)', (malformed) => {
    const value = project()
    value.graph.nodes.find((node) => node.id === 'output')!.data.targetNativeSurgeGeneralProxyBypass = malformed as never
    const result = compileGraph(value, { validationTarget: 'surge' })
    expect(result.success).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_PROXY_BYPASS_INVALID', severity: 'error' }))
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'SURGE_PROXY_BYPASS_HOST_INVALID' }))
  })

  it('blocks ambiguous enabled Surge Output ownership', () => {
    const value = project()
    const output = value.graph.nodes.find((node) => node.id === 'output')!
    value.graph.nodes.push({ ...output, id: 'output-b', data: { ...output.data, title: 'Second Surge' } })
    const result = compileGraph(value, { validationTarget: 'surge' })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_PROXY_BYPASS_AMBIGUOUS', severity: 'error' }))
  })
})
