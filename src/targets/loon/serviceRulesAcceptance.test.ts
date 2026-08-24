import { describe, expect, it } from 'vitest'
import projectText from '../../../fixtures/loon/service-rules-project.json?raw'
import expectedProfile from '../../../fixtures/loon/service-rules.expected.conf?raw'
import { acceptanceDiagnosticCounts, compileLoonAcceptanceProject } from './acceptance'

const project = JSON.parse(projectText)
const loonRuleUrl = 'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/loon/OpenAI.list'
const mihomoRuleUrl = 'https://raw.githubusercontent.com/kure29/proxyflow-rules/main/rules/mihomo/OpenAI.yaml'

describe('Loon Service Rules acceptance fixture', () => {
  it('compiles the sanitized project to the exact Remote Rule golden bytes', () => {
    const result = compileLoonAcceptanceProject(project)

    expect(result.graph.success).toBe(true)
    expect(result.loon?.success).toBe(true)
    expect(result.loon?.content).toBe(expectedProfile)
    expect(acceptanceDiagnosticCounts(result)).toEqual({
      candidateCount: 1,
      compatibleEndpointCount: 1,
      skippedEndpointCount: 0,
      blockingIssueCount: 0,
      issueCodeCounts: {},
    })
  })

  it('keeps the Project catalog target-isolated and emits the owned Loon asset', () => {
    const result = compileLoonAcceptanceProject(project)
    const fixed = result.project.graph.nodes.find((node) => node.id === 'service-proxy')

    expect(project.services[0].ruleSources).toEqual([
      expect.objectContaining({ url: mihomoRuleUrl, ruleCount: 20 }),
    ])
    expect(projectText).not.toContain('/rules/loon/')
    expect(result.loon?.content).toContain(`${loonRuleUrl},policy=Service Proxy,enabled=true`)
    expect(result.loon?.content).not.toContain('/rules/mihomo/')
    expect(fixed?.data.proxyId).not.toBe('__FIRST_COMPATIBLE__')
  })

  it('keeps section order, FINAL isolation, LF, and one trailing newline deterministic', () => {
    const first = compileLoonAcceptanceProject(project).loon?.content
    const second = compileLoonAcceptanceProject(project).loon?.content

    expect(first).toBe(second)
    expect(first).toBe(expectedProfile)
    expect(expectedProfile.indexOf('[Rule]')).toBeLessThan(expectedProfile.indexOf('[Remote Rule]'))
    expect(expectedProfile).toContain('[Rule]\nfinal,DIRECT\n\n[Remote Rule]\n')
    expect(expectedProfile).not.toContain('\r')
    expect(expectedProfile.endsWith('\n')).toBe(true)
    expect(expectedProfile.endsWith('\n\n')).toBe(false)
    expect(expectedProfile.match(/^https:\/\/raw\.githubusercontent\.com\/kure29\/proxyflow-rules\/main\/rules\/loon\/OpenAI\.list,/gm)).toHaveLength(1)
  })
})
