import { describe, expect, it } from 'vitest'
import type { GraphNode, ProxyFlowProject } from '../../types/project'
import projectText from '../../../fixtures/loon/service-rules-project.json?raw'
import { compileLoonAcceptanceProject } from './acceptance'

const baseProject = JSON.parse(projectText) as ProxyFlowProject

function precedenceProject(servicePriority: number, localPriority: number) {
  const project = structuredClone(baseProject)
  const serviceRoute = project.graph.nodes.find((node) => node.id === 'openai-route')
  if (!serviceRoute) throw new Error('service route fixture missing')
  serviceRoute.data.routePriority = servicePriority

  const localRoute: GraphNode = {
    id: 'local-route',
    type: 'block',
    position: { x: 640, y: 360 },
    data: {
      blockType: 'custom-rule',
      category: 'routing',
      title: 'Local',
      subtitle: 'Local domain matcher',
      icon: 'route',
      routeMatcherKind: 'domain',
      routeMatcherValue: 'local.example.invalid',
      targetKind: 'direct',
      targetId: 'DIRECT',
      targetLabel: 'DIRECT',
      routePriority: localPriority,
    },
  }
  project.graph.nodes.push(localRoute)
  project.graph.edges.push({
    id: 'local-route-output',
    source: localRoute.id,
    target: 'loon-output',
    type: 'smoothstep',
    data: { semantic: 'route' },
  })
  return project
}

describe('Loon local/Remote precedence graph-to-target boundary', () => {
  it('accepts a Project → Graph/IR → Loon local-before-Remote profile', () => {
    const result = compileLoonAcceptanceProject(precedenceProject(20, 10))

    expect(result.graph.success).toBe(true)
    expect(result.graph.ir?.routes.map((route) => [route.id, route.priority])).toEqual([
      ['local-route', 10], ['openai-route', 20],
    ])
    expect(result.loon?.success).toBe(true)
    expect(result.loon?.content).toContain('[Rule]\nDOMAIN,local.example.invalid,DIRECT\nfinal,DIRECT')
    expect(result.loon?.content).toContain('[Remote Rule]\nhttps://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/OpenAI.list,policy=Service Proxy,enabled=true')
    expect(result.loon?.issues).not.toContainEqual(expect.objectContaining({ code: 'LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN' }))
    expect(result.loon?.issues).not.toContainEqual(expect.objectContaining({ code: 'LOON_REMOTE_RULE_ORDER_SEMANTICS_UNSUPPORTED' }))
  })

  it('rejects a Project → Graph/IR → Loon Remote-before-local profile', () => {
    const result = compileLoonAcceptanceProject(precedenceProject(10, 20))

    expect(result.graph.success).toBe(true)
    expect(result.loon?.success).toBe(false)
    expect(result.loon?.content).toBe('')
    expect(result.loon?.issues).toContainEqual(expect.objectContaining({
      code: 'LOON_REMOTE_RULE_ORDER_SEMANTICS_UNSUPPORTED', severity: 'error', entityId: 'openai-route',
    }))
    expect(result.loon?.issues).not.toContainEqual(expect.objectContaining({ code: 'LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN' }))
  })

  it('does not let a disabled Remote route manufacture a precedence blocker', () => {
    const project = precedenceProject(10, 20)
    project.graph.nodes.find((node) => node.id === 'openai-route')!.data.disabled = true

    const result = compileLoonAcceptanceProject(project)
    expect(result.graph.success).toBe(true)
    expect(result.graph.ir?.routes.map((route) => route.id)).toEqual(['local-route'])
    expect(result.loon?.success).toBe(true)
    expect(result.loon?.issues).not.toContainEqual(expect.objectContaining({
      code: 'LOON_REMOTE_RULE_ORDER_SEMANTICS_UNSUPPORTED',
    }))
  })
})
