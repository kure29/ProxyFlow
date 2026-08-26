import { describe, expect, it } from 'vitest'
import { demoProject } from '../data/demoProject'
import { hktDemoSubscription } from '../data/demoSubscriptions'
import { parseSubscription } from '../core/subscription'
import { subscriptionSnapshotFixture } from '../core/__fixtures__/subscriptionFixtures'
import {
  localizeDiagnosticMessage, localizeKnownSystemText, localizeProject, localizeSubscriptionSnapshots, translate,
} from './runtime'

describe('i18n runtime', () => {
  it('translates interface copy without mixed-language fallback', () => {
    expect(translate('en-US', 'inspector.includeRegion')).toBe('Include region')
    expect(translate('zh-CN', 'inspector.includeRegion')).toBe('包含地区')
  })

  it('localizes paused target diagnostics without hardcoding a product name', () => {
    expect(translate('en-US', 'compiler.targetPaused', { target: 'Shadowrocket' })).toContain('Shadowrocket official export is paused')
    expect(translate('zh-CN', 'compiler.targetPaused', { target: 'Shadowrocket' })).toContain('Shadowrocket 正式导出已暂停')
  })

  it('labels the Shadowrocket evidence build as a tested baseline in both locales', () => {
    expect(translate('en-US', 'workspace.export.testedClientBaseline', { version: '2.2.65 build 2615' }))
      .toBe('Tested client baseline: 2.2.65 build 2615.')
    expect(translate('zh-CN', 'workspace.export.testedClientBaseline', { version: '2.2.65 build 2615' }))
      .toBe('已验证客户端基线：2.2.65 build 2615。')
  })

  it('localizes keyed demo content while preserving user-authored content', () => {
    const project = structuredClone(demoProject)
    project.graph.nodes[0].data.title = 'My custom 香港 node'
    project.graph.nodes[0].data.titleKey = undefined
    const localized = localizeProject(project, 'en-US')
    expect(localized.name).toBe('My proxy configuration')
    expect(localized.graph.nodes[0].data.title).toBe('My custom 香港 node')
    expect(localized.graph.nodes.find((node) => node.id === 'hk-filter')?.data.title).toBe('Hong Kong filter')
  })

  it('does not translate or mutate stored Filter region codes', () => {
    const project = structuredClone(demoProject)
    const filter = project.graph.nodes.find((node) => node.id === 'hk-filter')!
    filter.data.filterMode = 'region'
    filter.data.filterRegions = ['HK', 'SG', 'GB']
    expect(localizeProject(project, 'zh-CN').graph.nodes.find((node) => node.id === 'hk-filter')?.data.filterRegions).toEqual(['HK', 'SG', 'GB'])
    expect(localizeProject(project, 'en-US').graph.nodes.find((node) => node.id === 'hk-filter')?.data.filterRegions).toEqual(['HK', 'SG', 'GB'])
  })

  it('localizes dynamic system copy in both directions', () => {
    expect(localizeKnownSystemText('检测到 6 个 · 可用 5 个', 'en-US')).toBe('6 detected · 5 usable')
    expect(localizeKnownSystemText('Mihomo Output', 'zh-CN')).toBe('Mihomo 输出')
    expect(localizeKnownSystemText('官网', 'en-US')).toBe('official')
    expect(localizeKnownSystemText('China Mainland', 'zh-CN')).toBe('中国大陆')
  })

  it('never leaks a Chinese core diagnostic into the English interface', () => {
    const localized = localizeDiagnosticMessage('UNMAPPED_TEST_CODE', '这是底层中文错误', 'en-US')
    expect(localized).toBe('Configuration issue detected (UNMAPPED_TEST_CODE).')
    expect(localized).not.toMatch(/[\u3400-\u9fff]/u)
  })

  it('localizes Runtime policy blocks with stable redacted copy', () => {
    expect(localizeDiagnosticMessage('SUBSCRIPTION_RUNTIME_POLICY_BLOCKED', 'untrusted token=fictional-secret', 'en-US'))
      .toBe('The Runtime Service resolved the destination or redirect to a private or non-public address and blocked it.')
    expect(localizeDiagnosticMessage('SUBSCRIPTION_RUNTIME_POLICY_BLOCKED', 'untrusted token=fictional-secret', 'zh-CN'))
      .toBe('Runtime Service 将订阅目标或重定向解析为私有或非公网地址，因此已阻止请求。')
  })

  it('keeps known diagnostic codes in technical details instead of primary copy', () => {
    expect(localizeDiagnosticMessage('ROUTE_TARGET_MISSING', 'Route has no target.', 'zh-CN')).toBe('该分流规则尚未选择目标。')
    expect(localizeDiagnosticMessage('TRANSFORM_MISSING_INPUT', 'Processing input missing.', 'en-US')).toBe('This processing node has no valid proxy-set input.')
  })

  it('localizes built-in subscription metadata without changing user subscriptions', () => {
    const demoResult = parseSubscription(hktDemoSubscription, { sourceId: 'hkt-subscription', sourceName: 'HKT 订阅源' })
    demoResult.proxies[0].name = '🇭🇰 香港 SS 01'
    const localized = localizeSubscriptionSnapshots({ 'hkt-subscription': subscriptionSnapshotFixture('hkt-subscription', demoResult) }, 'en-US')
    expect(localized['hkt-subscription'].result?.proxies[0].name).toBe('🇭🇰 HK SS 01')
    expect(localized['hkt-subscription'].result?.proxies[0].metadata?.sourceName).toBe('HKT subscription')

    const userResult = structuredClone(demoResult)
    userResult.proxies[0].name = '用户自定义节点'
    const user = localizeSubscriptionSnapshots({ custom: subscriptionSnapshotFixture('custom', userResult) }, 'en-US')
    expect(user.custom.result?.proxies[0].name).toBe('用户自定义节点')
  })

  it('localizes exact legacy demo strings without translating arbitrary user copy', () => {
    expect(localizeKnownSystemText('基础 DNS · redir-host', 'en-US')).toBe('Basic DNS · redir-host')
    expect(localizeKnownSystemText('真实编译 · MVP', 'en-US')).toBe('Real compile · MVP')
    expect(localizeKnownSystemText('备用故障切换', 'en-US')).toBe('Fallback')
    expect(localizeKnownSystemText('匹配 8 / 24 个节点', 'en-US')).toBe('Matched 8 / 24 proxies')
    expect(localizeKnownSystemText('当前 HK-03 · 42 ms', 'en-US')).toBe('Current HK-03 · 42 ms')
    expect(localizeKnownSystemText('我的香港备用节点', 'en-US')).toBe('我的香港备用节点')
  })
})
