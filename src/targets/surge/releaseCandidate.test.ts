import { describe, expect, it } from 'vitest'
import releaseCandidateProfile from '../../../fixtures/surge/release-candidate.conf?raw'
import releaseCandidateProjectText from '../../../fixtures/surge/release-candidate.project.json?raw'
import { compileGraph } from '../../core/graphCompiler'
import { parseSubscription } from '../../core/subscription'
import { subscriptionSnapshotFixture } from '../../core/__fixtures__/subscriptionFixtures'
import type { ProxyFlowProject } from '../../types/project'
import { compileSurge } from './compiler'

const fixedNow = () => new Date('2026-08-23T00:00:00.000Z')

describe('Surge release-candidate fixture', () => {
  it('compiles the complete Project fixture to the independently checked profile', () => {
    const project = JSON.parse(releaseCandidateProjectText) as ProxyFlowProject
    const source = project.graph.nodes.find((node) => node.id === 'snapshot-source')!
    const parsed = parseSubscription(String(source.data.subscriptionContent), {
      sourceId: source.id,
      sourceName: source.data.title,
    })
    const graph = compileGraph(project, {
      validationTarget: 'surge',
      subscriptionSnapshots: {
        [source.id]: subscriptionSnapshotFixture(source.id, parsed, '2026-08-23T00:00:00.000Z', 'paste'),
      },
    })

    expect(graph.success, graph.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(graph.ir).toEqual(expect.objectContaining({
      strategies: expect.arrayContaining([
        expect.objectContaining({ id: 'snapshot-auto', kind: 'auto-select' }),
        expect.objectContaining({ id: 'manual-fixed', kind: 'fixed' }),
        expect.objectContaining({ id: 'release-chain', kind: 'chain' }),
      ]),
      routes: expect.arrayContaining([
        expect.objectContaining({ id: 'openai-route', matcher: expect.objectContaining({ kind: 'service' }) }),
        expect.objectContaining({ id: 'ordinary-domain-route', matcher: expect.objectContaining({ kind: 'domain-suffix', value: 'example.org' }) }),
      ]),
      dns: expect.objectContaining({ enabled: true, mode: 'custom' }),
      finalRoute: { target: { kind: 'strategy', id: 'release-chain' } },
    }))

    const result = compileSurge(graph.ir!, { now: fixedNow })
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(result.mock).toBe(false)
    expect(result.content).toBe(releaseCandidateProfile)
    expect(result.content).not.toMatch(/\r/)
    expect(result.content.match(/^\[(?:General|Proxy|Proxy Group|Rule)\]$/gm)).toHaveLength(4)
  })
})
