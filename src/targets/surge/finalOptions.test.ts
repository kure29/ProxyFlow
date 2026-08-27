import { describe, expect, it } from 'vitest'
import { compileGraph } from '../../core/graphCompiler'
import { PROXYFLOW_IR_VERSION, type ProxyFlowIR } from '../../core/ir'
import type { TargetNativeFinalOptionsIR } from '../../core/targetNative'
import { surgeNativeAcceptanceProject } from '../../core/__fixtures__/surgeNativeStrategies'
import { compileMihomo } from '../mihomo/compiler'
import { compileSingBox } from '../singbox/compiler'
import { compileLoon } from '../loon/compiler'
import { compileShadowrocket } from '../shadowrocket/compiler'
import { compileSurge } from './compiler'
import { serializeSurgeFinalRule } from './serializer'

const finalOptions: TargetNativeFinalOptionsIR = {
  finalNodeId: 'final', target: 'surge', kind: 'final-options', dnsFailed: true,
}

function baseIR(finalTarget: NonNullable<ProxyFlowIR['finalRoute']>['target'] = { kind: 'strategy', id: 'proxy-group' }): ProxyFlowIR {
  return {
    version: PROXYFLOW_IR_VERSION,
    metadata: { projectId: 'final-options', projectName: 'Final options', projectSchemaVersion: 2 },
    sources: [{
      kind: 'manual-proxy', id: 'source', name: 'Source', proxies: [{
        kind: 'socks', protocol: 'socks5', version: '5', id: 'proxy', name: 'Proxy A', server: 'proxy.example.com', port: 1080,
      }],
    }],
    transforms: [],
    strategies: [{ kind: 'select', id: 'proxy-group', name: 'Proxy', candidates: [{ kind: 'source', id: 'source' }] }],
    services: [],
    routes: [{ id: 'domain', name: 'Domain', matcher: { kind: 'domain', value: 'example.com' }, target: { kind: 'direct' }, priority: 10 }],
    finalRoute: { target: finalTarget },
    outputs: [{ id: 'output', name: 'Output', target: 'surge', enabled: true }],
  }
}

function ruleLines(content: string) {
  const lines = content.split('\n')
  const start = lines.indexOf('[Rule]')
  return lines.slice(start + 1).filter(Boolean)
}

describe('Surge FINAL dns-failed', () => {
  it('serializes plain and dns-failed FINAL rules with exact token order and safety', () => {
    expect(serializeSurgeFinalRule('Proxy')).toBe('FINAL,Proxy')
    expect(serializeSurgeFinalRule('Proxy', { dnsFailed: true })).toBe('FINAL,Proxy,dns-failed')
    expect(serializeSurgeFinalRule('Proxy, A', { dnsFailed: true })).toBe('FINAL,"Proxy, A",dns-failed')
    expect(() => serializeSurgeFinalRule('Proxy\nFINAL,DIRECT', { dnsFailed: true })).toThrow('single-line')
    expect(() => serializeSurgeFinalRule('Proxy\rFINAL,DIRECT', { dnsFailed: true })).toThrow('single-line')
    expect(() => serializeSurgeFinalRule('Proxy\u0000', { dnsFailed: true })).toThrow('single-line')
    expect(() => serializeSurgeFinalRule('Proxy\u0001', { dnsFailed: true })).toThrow('single-line')
  })

  it('lowers a Universal strategy modifier and keeps FINAL last', () => {
    const result = compileSurge(baseIR(), { targetNativeFinalOptions: finalOptions })
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(ruleLines(result.content)).toEqual(['DOMAIN,example.com,DIRECT', 'FINAL,Proxy,dns-failed'])
  })

  it('allows REJECT and blocks DIRECT without silently dropping the modifier', () => {
    const rejected = compileSurge(baseIR({ kind: 'reject' }), { targetNativeFinalOptions: finalOptions })
    expect(rejected.success).toBe(true)
    expect(ruleLines(rejected.content).at(-1)).toBe('FINAL,REJECT,dns-failed')

    const direct = compileSurge(baseIR({ kind: 'direct' }), { targetNativeFinalOptions: finalOptions })
    expect(direct.success).toBe(false)
    expect(direct.content).toBe('')
    expect(direct.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_FINAL_DNS_FAILED_DIRECT_UNSUPPORTED', severity: 'error' }))
  })

  it('preserves the existing plain FINAL output when no modifier exists', () => {
    const result = compileSurge(baseIR())
    expect(result.success).toBe(true)
    expect(ruleLines(result.content).at(-1)).toBe('FINAL,Proxy')
  })

  it('blocks a malformed headless Universal + native Final combination without emitting either Final', () => {
    const result = compileSurge(baseIR(), {
      nativeStrategies: [{
        id: 'native', name: 'Native', target: 'surge', kind: 'smart', members: [{ kind: 'proxy', id: 'proxy' }],
      }],
      nativeFinalRoute: {
        id: 'native-final', name: 'Native Final', target: { kind: 'strategy', id: 'native' }, priority: Number.MAX_SAFE_INTEGER,
      },
      targetNativeFinalOptions: { ...finalOptions, finalNodeId: 'native-final' },
    })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_FINAL_ROUTE_AMBIGUOUS', severity: 'error' }))
    expect(result.content.match(/^FINAL,/gm) ?? []).toHaveLength(0)
  })

  it.each([
    ['hk-smart', 'Hong Kong Smart'],
    ['hk-subnet', 'Hong Kong'],
  ] as const)('combines a native %s Final target with dns-failed', (targetId, expectedName) => {
    const project = structuredClone(surgeNativeAcceptanceProject)
    const final = project.graph.nodes.find((node) => node.id === 'final-route')!
    final.data.targetId = targetId
    final.data.targetLabel = expectedName
    final.data.targetNativeFinalOptions = { target: 'surge', kind: 'final-options', dnsFailed: true }
    const graph = compileGraph(project, { validationTarget: 'surge' })
    expect(graph.success, graph.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    const result = compileSurge(graph.ir!, {
      nativeStrategies: graph.nativeStrategies,
      nativeRoutes: graph.nativeRoutes,
      nativeFinalRoute: graph.nativeFinalRoute,
      targetNativeFinalOptions: graph.targetNativeFinalOptions,
    })
    expect(result.success, result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n')).toBe(true)
    expect(ruleLines(result.content).at(-1)).toBe(`FINAL,${expectedName},dns-failed`)
  })

  it('fails closed for malformed, owner-mismatched and orphan runtime options', () => {
    const malformed = compileSurge(baseIR(), {
      targetNativeFinalOptions: { ...finalOptions, dnsFailed: false } as never,
    })
    expect(malformed.success).toBe(false)
    expect(malformed.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_FINAL_OPTIONS_INVALID', severity: 'error' }))

    const wrongTarget = compileSurge(baseIR(), {
      targetNativeFinalOptions: { ...finalOptions, target: 'mihomo' } as never,
    })
    expect(wrongTarget.success).toBe(false)
    expect(wrongTarget.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_FINAL_OPTIONS_INVALID', severity: 'error' }))

    const nativeProject = structuredClone(surgeNativeAcceptanceProject)
    const graph = compileGraph(nativeProject, { validationTarget: 'surge' })
    const mismatch = compileSurge(graph.ir!, {
      nativeStrategies: graph.nativeStrategies,
      nativeFinalRoute: graph.nativeFinalRoute,
      targetNativeFinalOptions: { ...finalOptions, finalNodeId: 'other-final' },
    })
    expect(mismatch.success).toBe(false)
    expect(mismatch.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_FINAL_OPTIONS_OWNER_MISMATCH', severity: 'error' }))

    const withoutFinal = baseIR()
    withoutFinal.finalRoute = undefined
    const orphan = compileSurge(withoutFinal, { targetNativeFinalOptions: finalOptions })
    expect(orphan.success).toBe(false)
    expect(orphan.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_TARGET_NATIVE_FINAL_OPTIONS_WITHOUT_FINAL', severity: 'error' }))
  })

  it.each([
    ['mihomo', compileMihomo],
    ['sing-box', compileSingBox],
    ['loon', compileLoon],
    ['shadowrocket', compileShadowrocket],
  ] as const)('fails closed instead of stripping dns-failed in %s', (_target, compiler) => {
    const result = compiler(baseIR(), { targetNativeFinalOptions: finalOptions })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_FINAL_OPTIONS_UNSUPPORTED', severity: 'error' }))
  })
})
