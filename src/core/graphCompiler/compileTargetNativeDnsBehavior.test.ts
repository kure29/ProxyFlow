import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { compileGraph } from './compileGraph'

describe('Graph Compiler Surge DNS-native behavior ownership', () => {
  it('binds intent to the effective DNS owner independently of Universal DNS mode', () => {
    const project = structuredClone(demoProject)
    const dns = project.graph.nodes.find((node) => node.data.blockType === 'dns')!
    dns.data.universalDnsMode = 'none'
    dns.data.targetNativeSurgeDnsBehavior = {
      target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['example.com', '*.example.com', 'example.com'],
    }
    const result = compileGraph(project)
    expect(result.success).toBe(true)
    expect(result.effectiveDnsNodeId).toBe(dns.id)
    expect(result.ir?.dns).toBeUndefined()
    expect(result.targetNativeSurgeDnsBehavior).toEqual({
      target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['example.com', '*.example.com'], dnsNodeId: dns.id,
    })
  })

  it('retains disabled intent without producing an active IR record and fails misplaced fields closed', () => {
    const disabled = structuredClone(demoProject)
    const dns = disabled.graph.nodes.find((node) => node.data.blockType === 'dns')!
    dns.data.disabled = true
    dns.data.targetNativeSurgeDnsBehavior = { target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['example.com'] }
    const inert = compileGraph(disabled)
    expect(inert.success).toBe(true)
    expect(inert.targetNativeSurgeDnsBehavior).toBeUndefined()

    const misplaced = structuredClone(demoProject)
    const output = misplaced.graph.nodes.find((node) => node.data.blockType === 'output')!
    output.data.targetNativeSurgeDnsBehavior = { target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['example.com'] }
    const blocked = compileGraph(misplaced)
    expect(blocked.success).toBe(false)
    expect(blocked.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_DNS_INVALID', nodeId: output.id, severity: 'error' }))
  })

  it('does not invent a parallel owner when multiple DNS nodes are enabled', () => {
    const project = structuredClone(demoProject)
    const dns = project.graph.nodes.find((node) => node.data.blockType === 'dns')!
    dns.data.targetNativeSurgeDnsBehavior = { target: 'surge', kind: 'dns-behavior', alwaysRealIp: ['example.com'] }
    project.graph.nodes.push({ ...structuredClone(dns), id: 'dns-second' })
    const result = compileGraph(project)
    expect(result.success).toBe(false)
    expect(result.effectiveDnsNodeId).toBeUndefined()
    expect(result.targetNativeSurgeDnsBehavior).toBeUndefined()
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'DNS_MULTIPLE', severity: 'error' }))
  })
})
