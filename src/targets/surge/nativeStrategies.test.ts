import { describe, expect, it } from 'vitest'
import { compileGraph } from '../../core/graphCompiler'
import { surgeNativeAcceptanceProject } from '../../core/__fixtures__/surgeNativeStrategies'
import { compileSurge } from './compiler'
import { targetNativeUnsupportedIssues } from '../../core/targetNative'
import type { ProxyFlowIR } from '../../core/ir'
import type { TargetNativeStrategyIR } from '../../core/targetNative'
import { migrateProject } from '../../core/project/version'
import { compileMihomo } from '../mihomo/compiler'
import { compileLoon } from '../loon/compiler'
import { compileShadowrocket } from '../shadowrocket/compiler'
import { compileSingBox } from '../singbox/compiler'

const ir = (): ProxyFlowIR => compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' }).ir!
const natives = (): TargetNativeStrategyIR[] => compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' }).nativeStrategies!

describe('Surge target-native Smart and Subnet strategies', () => {
  it('extracts native semantics without adding Surge kinds to Universal StrategyIR', () => {
    const graph = compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' })
    expect(graph.success).toBe(true)
    expect(graph.ir?.strategies).toEqual([])
    expect(graph.nativeStrategies?.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'hk-smart', kind: 'smart' }, { id: 'hk-subnet', kind: 'subnet' },
    ])
  })

  it('preserves native graph intent while blocking a non-Surge authoring target', () => {
    const blocked = compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'mihomo' })
    expect(blocked.success).toBe(false)
    expect(blocked.issues.filter((issue) => issue.code === 'TARGET_NATIVE_STRATEGY_UNSUPPORTED')).toHaveLength(2)
    expect(blocked.nativeStrategies).toEqual([])
    expect(surgeNativeAcceptanceProject.graph.nodes.find((node) => node.id === 'hk-smart')?.data.targetNativeStrategy?.kind).toBe('smart')
  })

  it('round-trips the typed native graph through current Project Schema without migration', () => {
    const migrated = migrateProject(structuredClone(surgeNativeAcceptanceProject))
    expect(migrated.success).toBe(true)
    expect(migrated.migrated).toBe(false)
    expect(migrated.project?.graph.nodes.find((node) => node.id === 'hk-subnet')?.data.targetNativeStrategy).toEqual(
      surgeNativeAcceptanceProject.graph.nodes.find((node) => node.id === 'hk-subnet')?.data.targetNativeStrategy,
    )
  })

  it('serializes Smart candidates and ordered Subnet conditions deterministically', () => {
    const graph = compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' })
    const result = compileSurge(ir(), { now: () => new Date(0), nativeStrategies: natives(), nativeRoutes: graph.nativeRoutes, nativeFinalRoute: graph.nativeFinalRoute })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Hong Kong Smart = smart, HK-01, HK-02, HK-03')
    expect(result.content).toContain('Hong Kong = subnet, SSID:Home-WiFi, DIRECT, TYPE:CELLULAR, Hong Kong Smart, default, Hong Kong Smart')
  })

  it.each(['mihomo', 'loon', 'shadowrocket'] as const)('fails closed when Surge-native semantics are sent to %s', (target) => {
    const issues = targetNativeUnsupportedIssues(target, natives())
    expect(issues).toHaveLength(2)
    expect(issues.every((issue) => issue.code === 'TARGET_NATIVE_STRATEGY_UNSUPPORTED' && issue.severity === 'error')).toBe(true)
    expect(issues[0].message).toContain('Surge-specific')
  })

  it('rejects Smart built-in and nested strategy members', () => {
    const malformed = natives()
    malformed[0] = { ...malformed[0]!, kind: 'smart', members: [
      { kind: 'builtin', id: 'DIRECT' } as never,
      { kind: 'strategy', id: 'hk-subnet' } as never,
    ] }
    const result = compileSurge(ir(), { nativeStrategies: malformed })
    expect(result.success).toBe(false)
    expect(result.issues.filter((issue) => issue.code === 'SURGE_SMART_MEMBER_UNSUPPORTED')).toHaveLength(2)
  })

  it('rejects a Subnet without an explicit default or with an empty matcher value', () => {
    const malformed = natives().map((strategy) => strategy.kind === 'subnet' ? {
      ...strategy,
      defaultPolicy: undefined as never,
      conditions: [{ matcher: { kind: 'ssid', value: '' }, policy: { kind: 'builtin', id: 'DIRECT' } }],
    } : strategy) as TargetNativeStrategyIR[]
    const result = compileSurge(ir(), { nativeStrategies: malformed })
    expect(result.success).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['SURGE_SUBNET_DEFAULT_REQUIRED', 'SURGE_SUBNET_MATCHER_INVALID']))
  })

  it('rejects control characters in Subnet matcher values', () => {
    const malformed = natives().map((strategy) => strategy.kind === 'subnet' ? {
      ...strategy,
      conditions: [{ matcher: { kind: 'ssid' as const, value: 'Home-WiFi\nFINAL,DIRECT' }, policy: { kind: 'builtin' as const, id: 'DIRECT' as const } }],
    } : strategy) as TargetNativeStrategyIR[]
    const result = compileSurge(ir(), { nativeStrategies: malformed })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_SUBNET_MATCHER_INVALID', severity: 'error' })]))
  })

  it('lowers every supported Subnet matcher without changing condition order', () => {
    const subnet = natives().find((strategy) => strategy.kind === 'subnet')!
    const allMatchers = [
      { kind: 'ssid', value: 'Home-WiFi' },
      { kind: 'bssid', value: 'AA:BB:CC:DD:EE:FF' },
      { kind: 'router', value: '192.168.1.1' },
      { kind: 'network-type', value: 'WIFI' },
      { kind: 'network-type', value: 'WIRED' },
      { kind: 'network-type', value: 'CELLULAR' },
    ] as const
    const malformed = [natives().find((strategy) => strategy.kind === 'smart')!, { ...subnet, conditions: allMatchers.map((matcher) => ({ matcher, policy: { kind: 'builtin' as const, id: 'DIRECT' as const } })) }]
    const graph = compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' })
    const result = compileSurge(ir(), { nativeStrategies: malformed, nativeFinalRoute: graph.nativeFinalRoute })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Hong Kong = subnet, SSID:Home-WiFi, DIRECT, BSSID:AA:BB:CC:DD:EE:FF, DIRECT, ROUTER:192.168.1.1, DIRECT, TYPE:WIFI, DIRECT, TYPE:WIRED, DIRECT, TYPE:CELLULAR, DIRECT, default, Hong Kong Smart')
  })

  it('rejects cycles between native Subnet strategy references', () => {
    const cycle: TargetNativeStrategyIR[] = [
      { id: 'a', name: 'A', target: 'surge', kind: 'subnet', conditions: [], defaultPolicy: { kind: 'strategy', id: 'b' } },
      { id: 'b', name: 'B', target: 'surge', kind: 'subnet', conditions: [], defaultPolicy: { kind: 'strategy', id: 'a' } },
    ]
    const result = compileSurge(ir(), { nativeStrategies: cycle })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_NATIVE_STRATEGY_CYCLE', severity: 'error' })]))
  })

  it('fails closed for malformed Smart member references instead of throwing', () => {
    const malformed = natives()
    malformed[0] = { ...malformed[0]!, kind: 'smart', members: [null as never] }
    const result = compileSurge(ir(), { nativeStrategies: malformed })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_SMART_MEMBER_UNSUPPORTED', severity: 'error' })]))
  })

  it.each([
    ['mihomo', compileMihomo],
    ['loon', compileLoon],
    ['shadowrocket', compileShadowrocket],
    ['sing-box', compileSingBox],
  ] as const)('fails closed in the %s compiler when a Surge-native extension is supplied', (target, compiler) => {
    const result = compiler(ir(), { nativeStrategies: natives(), nativeFinalRoute: compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' }).nativeFinalRoute })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TARGET_NATIVE_STRATEGY_UNSUPPORTED', severity: 'error', target })]))
  })
})
