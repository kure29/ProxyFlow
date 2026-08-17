import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { compileGraph } from './graphCompiler'
import { v08BasicRoutingFixture, v08FailoverFixture } from './__fixtures__/v08Acceptance'
import { compileMihomo } from '../targets/mihomo/compiler'
import type { MihomoConfig } from '../targets/mihomo/model'
import { compileSingBox } from '../targets/singbox/compiler'
import type { SingBoxConfig } from '../targets/singbox/model'

const fixedNow = () => new Date('2026-08-17T00:00:00.000Z')

describe('V0.8 acceptance pipeline', () => {
  it('compiles strategy, DIRECT, REJECT and Default Route semantics to both targets', () => {
    const graph = compileGraph(v08BasicRoutingFixture)
    expect(graph.success, graph.issues.map((issue) => issue.message).join('\n')).toBe(true)
    expect(graph.ir?.finalRoute).toEqual({ target: { kind: 'strategy', id: 'auto' } })
    expect(graph.ir?.routes.map((route) => [route.id, route.priority])).toEqual([
      ['openai', 10], ['local', 20], ['ads', 30],
    ])

    const mihomoResult = compileMihomo(graph.ir!, { now: fixedNow })
    expect(mihomoResult.success, mihomoResult.issues.map((issue) => issue.message).join('\n')).toBe(true)
    const mihomo = parseYaml(mihomoResult.content) as MihomoConfig
    expect(mihomo.rules).toEqual([
      'DOMAIN,api.openai.com,US Auto',
      'DOMAIN-SUFFIX,lan,DIRECT',
      'DOMAIN-KEYWORD,ads,REJECT',
      'MATCH,US Auto',
    ])

    const singBoxResult = compileSingBox(graph.ir!, { now: fixedNow })
    expect(singBoxResult.success, singBoxResult.issues.map((issue) => issue.message).join('\n')).toBe(true)
    const singBox = JSON.parse(singBoxResult.content) as SingBoxConfig
    expect(singBox.route.rules).toEqual([
      { domain: ['api.openai.com'], action: 'route', outbound: 'US Auto' },
      { domain_suffix: ['lan'], action: 'route', outbound: 'direct' },
      { domain_keyword: ['ads'], action: 'reject' },
    ])
    expect(singBox.route.final).toBe('US Auto')
  })

  it('keeps target-specific Failover semantics explicit and fail-closed', () => {
    const graph = compileGraph(v08FailoverFixture)
    expect(graph.success, graph.issues.map((issue) => issue.message).join('\n')).toBe(true)

    const mihomo = compileMihomo(graph.ir!, { now: fixedNow })
    expect(mihomo.success).toBe(true)
    expect(mihomo.content).toContain('type: fallback')

    const singBox = compileSingBox(graph.ir!, { now: fixedNow })
    expect(singBox.success).toBe(false)
    expect(singBox.content).toBe('')
    expect(singBox.issues.map((issue) => issue.code)).toContain('SINGBOX_STRATEGY_FALLBACK_UNSUPPORTED')
  })
})
