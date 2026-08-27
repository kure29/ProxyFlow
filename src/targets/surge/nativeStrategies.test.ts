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
const nativeFinal = () => compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' }).nativeFinalRoute

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
    expect(result.content).toContain('Hong Kong = subnet, default = Hong Kong Smart, SSID:Home-WiFi = DIRECT, TYPE:CELLULAR = Hong Kong Smart')
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
    const result = compileSurge(ir(), { nativeStrategies: malformed, nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.issues.filter((issue) => issue.code === 'SURGE_SMART_MEMBER_UNSUPPORTED')).toHaveLength(2)
  })

  it('rejects an empty Smart member list', () => {
    const smart = natives().find((strategy) => strategy.kind === 'smart')!
    const result = compileSurge(ir(), { nativeStrategies: [{ ...smart, members: [] }], nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_SMART_MEMBERS_EMPTY', severity: 'error' })]))
  })

  it('rejects a Subnet without an explicit default or with an empty matcher value', () => {
    const malformed = natives().map((strategy) => strategy.kind === 'subnet' ? {
      ...strategy,
      defaultPolicy: undefined as never,
      conditions: [{ matcher: { kind: 'ssid', value: '' }, policy: { kind: 'builtin', id: 'DIRECT' } }],
    } : strategy) as TargetNativeStrategyIR[]
    const result = compileSurge(ir(), { nativeStrategies: malformed, nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['SURGE_SUBNET_DEFAULT_REQUIRED', 'SURGE_SUBNET_MATCHER_INVALID']))
  })

  it('rejects control characters in Subnet matcher values', () => {
    const malformed = natives().map((strategy) => strategy.kind === 'subnet' ? {
      ...strategy,
      conditions: [{ matcher: { kind: 'ssid' as const, value: 'Home-WiFi\nFINAL,DIRECT' }, policy: { kind: 'builtin' as const, id: 'DIRECT' as const } }],
    } : strategy) as TargetNativeStrategyIR[]
    const result = compileSurge(ir(), { nativeStrategies: malformed, nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_SUBNET_MATCHER_INVALID', severity: 'error' })]))
  })

  it.each([
    { kind: 'bssid' as const, value: 'AA:BB:CC:DD:EE' },
    { kind: 'router' as const, value: '999.1.1.1' },
  ])('rejects malformed %s matcher values', (matcher) => {
    const subnet = natives().find((strategy) => strategy.kind === 'subnet')!
    const result = compileSurge(ir(), { nativeStrategies: [{ ...subnet, conditions: [{ matcher, policy: { kind: 'builtin', id: 'DIRECT' } }] }], nativeFinalRoute: nativeFinal() })
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
      { kind: 'mccmnc', value: '310260' },
    ] as const
    const malformed = [natives().find((strategy) => strategy.kind === 'smart')!, { ...subnet, conditions: allMatchers.map((matcher) => ({ matcher, policy: { kind: 'builtin' as const, id: 'DIRECT' as const } })) }]
    const graph = compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' })
    const result = compileSurge(ir(), { nativeStrategies: malformed, nativeFinalRoute: graph.nativeFinalRoute })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Hong Kong = subnet, default = Hong Kong Smart, SSID:Home-WiFi = DIRECT, BSSID:AA:BB:CC:DD:EE:FF = DIRECT, ROUTER:192.168.1.1 = DIRECT, TYPE:WIFI = DIRECT, TYPE:WIRED = DIRECT, TYPE:CELLULAR = DIRECT, MCCMNC:310260 = DIRECT')
  })

  it('compiles native references independent of array order', () => {
    const graph = compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' })
    const compile = (nativeStrategies: TargetNativeStrategyIR[]) => compileSurge(ir(), { now: () => new Date(0), nativeStrategies, nativeRoutes: graph.nativeRoutes, nativeFinalRoute: graph.nativeFinalRoute })
    const smartFirst = compile(natives())
    const subnetFirst = compile([...natives()].reverse())
    expect(smartFirst.success).toBe(true)
    expect(subnetFirst.success).toBe(true)
    expect(subnetFirst.content).toBe(smartFirst.content)
  })

  it('serializes Smart policy-priority and evaluate-before-use from typed fields', () => {
    const smart = natives().find((strategy) => strategy.kind === 'smart')!
    const graph = compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' })
    const result = compileSurge(ir(), {
      nativeStrategies: [{ ...smart, policyPriority: [{ pattern: 'Premium', factor: 0.9 }, { pattern: 'Backup', factor: 1.3 }], evaluateBeforeUse: true }, natives().find((strategy) => strategy.kind === 'subnet')!],
      nativeRoutes: graph.nativeRoutes,
      nativeFinalRoute: graph.nativeFinalRoute,
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Hong Kong Smart = smart, HK-01, HK-02, HK-03, policy-priority="Premium:0.9;Backup:1.3", evaluate-before-use=true')
  })

  it.each([
    { pattern: 'Premium', factor: 0 },
    { pattern: '[', factor: 1 },
    { pattern: 'Premium\nInjected', factor: 1 },
  ])('rejects malformed Smart policy-priority rules (%j)', (rule) => {
    const smart = natives().find((strategy) => strategy.kind === 'smart')!
    const result = compileSurge(ir(), { nativeStrategies: [{ ...smart, policyPriority: [rule] }], nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_SMART_POLICY_PRIORITY_INVALID', severity: 'error' })]))
  })

  it.each(['1234', '1234567', '31A260', ''])('rejects malformed MCCMNC matcher values (%s)', (value) => {
    const subnet = natives().find((strategy) => strategy.kind === 'subnet')!
    const result = compileSurge(ir(), { nativeStrategies: [...natives().filter((strategy) => strategy.kind !== 'subnet'), { ...subnet, conditions: [{ matcher: { kind: 'mccmnc', value }, policy: { kind: 'builtin', id: 'DIRECT' } }] }], nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_SUBNET_MATCHER_INVALID', severity: 'error' })]))
  })

  it.each(['31026', '310260'])('accepts official five- or six-digit MCCMNC matcher values (%s)', (value) => {
    const subnet = natives().find((strategy) => strategy.kind === 'subnet')!
    const graph = compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' })
    const result = compileSurge(ir(), { nativeStrategies: [...natives().filter((strategy) => strategy.kind !== 'subnet'), { ...subnet, conditions: [{ matcher: { kind: 'mccmnc', value }, policy: { kind: 'builtin', id: 'DIRECT' } }] }], nativeFinalRoute: graph.nativeFinalRoute })
    expect(result.success).toBe(true)
    expect(result.content).toContain(`MCCMNC:${value} = DIRECT`)
  })

  it('supports every allowed Subnet policy reference type', () => {
    const subnet = natives().find((strategy) => strategy.kind === 'subnet')!
    const references = [
      { reference: { kind: 'proxy', id: 'HK-01' } as const, expected: 'HK-01' },
      { reference: { kind: 'strategy', id: 'hk-smart' } as const, expected: 'Hong Kong Smart' },
      { reference: { kind: 'builtin', id: 'DIRECT' } as const, expected: 'DIRECT' },
      { reference: { kind: 'builtin', id: 'REJECT' } as const, expected: 'REJECT' },
    ]
    const graph = compileGraph(surgeNativeAcceptanceProject, { validationTarget: 'surge' })
    for (const { reference, expected } of references) {
      const result = compileSurge(ir(), { nativeStrategies: [...natives().filter((strategy) => strategy.kind !== 'subnet'), { ...subnet, defaultPolicy: reference }], nativeFinalRoute: graph.nativeFinalRoute })
      expect(result.success).toBe(true)
      expect(result.content).toContain(`default = ${expected}`)
    }
  })

  it('rejects Surge built-ins outside the intentionally supported DIRECT/REJECT set', () => {
    const subnet = natives().find((strategy) => strategy.kind === 'subnet')!
    const result = compileSurge(ir(), { nativeStrategies: [...natives().filter((strategy) => strategy.kind !== 'subnet'), { ...subnet, defaultPolicy: { kind: 'builtin', id: 'CELLULAR' } as never }], nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_SUBNET_BUILTIN_UNSUPPORTED', severity: 'error' })]))
  })

  it('rejects cycles between native Subnet strategy references', () => {
    const cycle: TargetNativeStrategyIR[] = [
      { id: 'a', name: 'A', target: 'surge', kind: 'subnet', conditions: [], defaultPolicy: { kind: 'strategy', id: 'b' } },
      { id: 'b', name: 'B', target: 'surge', kind: 'subnet', conditions: [], defaultPolicy: { kind: 'strategy', id: 'a' } },
    ]
    const result = compileSurge(ir(), { nativeStrategies: cycle, nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_NATIVE_STRATEGY_CYCLE', severity: 'error' })]))
  })

  it('fails closed for malformed Smart member references instead of throwing', () => {
    const malformed = natives()
    malformed[0] = { ...malformed[0]!, kind: 'smart', members: [null as never] }
    const result = compileSurge(ir(), { nativeStrategies: malformed, nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SURGE_SMART_MEMBER_UNSUPPORTED', severity: 'error' })]))
  })

  it('rejects duplicate native strategy ids instead of selecting one', () => {
    const [smart, subnet] = natives()
    const result = compileSurge(ir(), { nativeStrategies: [{ ...smart, id: 'duplicate' }, { ...subnet, id: 'duplicate' }], nativeFinalRoute: nativeFinal() })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_NATIVE_STRATEGY_ID_DUPLICATE', severity: 'error', entityId: 'duplicate' }))
  })

  it('rejects native strategy ids that collide with Universal strategy ids', () => {
    const smart = natives().find((strategy) => strategy.kind === 'smart')!
    const collisionIR = ir()
    collisionIR.strategies.push({ kind: 'select', id: 'proxy-group', name: 'Universal', candidates: [] })
    const result = compileSurge(collisionIR, {
      nativeStrategies: natives().map((strategy) => strategy.kind === 'smart'
        ? { ...smart, id: 'proxy-group' }
        : { ...strategy, defaultPolicy: { kind: 'strategy' as const, id: 'proxy-group' }, conditions: strategy.conditions.map((condition) => ({ ...condition, policy: condition.policy.kind === 'strategy' ? { kind: 'strategy' as const, id: 'proxy-group' } : condition.policy })) }),
      nativeFinalRoute: nativeFinal(),
    })
    expect(result.success).toBe(false)
    expect(result.content).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SURGE_NATIVE_STRATEGY_ID_COLLISION', severity: 'error', entityId: 'proxy-group' }))
  })

  it('rejects malformed persisted strategy config at the Project graph boundary', () => {
    const project = structuredClone(surgeNativeAcceptanceProject)
    const node = project.graph.nodes.find((candidate) => candidate.id === 'hk-smart')!
    node.data.targetNativeStrategy = { ...node.data.targetNativeStrategy!, extendedMatching: true } as never
    const result = compileGraph(project, { validationTarget: 'surge' })
    expect(result.success).toBe(false)
    expect(result.nativeStrategies?.some((strategy) => strategy.id === 'hk-smart')).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_NATIVE_STRATEGY_INVALID', nodeId: 'hk-smart', severity: 'error' }))
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
