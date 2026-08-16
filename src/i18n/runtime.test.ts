import { describe, expect, it } from 'vitest'
import { demoProject } from '../data/demoProject'
import { hktDemoSubscription } from '../data/demoSubscriptions'
import { parseSubscription } from '../core/subscription'
import {
  localizeDiagnosticMessage, localizeKnownSystemText, localizeProject, localizeSubscriptionSnapshots, translate,
} from './runtime'

describe('i18n runtime', () => {
  it('translates interface copy without mixed-language fallback', () => {
    expect(translate('en-US', 'inspector.includeRegion')).toBe('Include region')
    expect(translate('zh-CN', 'inspector.includeRegion')).toBe('包含地区')
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

  it('localizes dynamic system copy in both directions', () => {
    expect(localizeKnownSystemText('检测到 6 个 · 可用 5 个', 'en-US')).toBe('6 detected · 5 usable')
    expect(localizeKnownSystemText('Mihomo Output', 'zh-CN')).toBe('Mihomo 输出')
    expect(localizeKnownSystemText('官网', 'en-US')).toBe('official')
  })

  it('never leaks a Chinese core diagnostic into the English interface', () => {
    const localized = localizeDiagnosticMessage('UNMAPPED_TEST_CODE', '这是底层中文错误', 'en-US')
    expect(localized).toBe('Configuration issue detected (UNMAPPED_TEST_CODE).')
    expect(localized).not.toMatch(/[\u3400-\u9fff]/u)
  })

  it('localizes built-in subscription metadata without changing user subscriptions', () => {
    const demoResult = parseSubscription(hktDemoSubscription, { sourceId: 'hkt-subscription', sourceName: 'HKT 订阅源' })
    demoResult.proxies[0].name = '🇭🇰 香港 SS 01'
    const localized = localizeSubscriptionSnapshots({ 'hkt-subscription': { inputKind: 'paste', fetchStatus: 'ready', result: demoResult } }, 'en-US')
    expect(localized['hkt-subscription'].result?.proxies[0].name).toBe('🇭🇰 HK SS 01')
    expect(localized['hkt-subscription'].result?.proxies[0].metadata?.sourceName).toBe('HKT subscription')

    const userResult = structuredClone(demoResult)
    userResult.proxies[0].name = '用户自定义节点'
    const user = localizeSubscriptionSnapshots({ custom: { inputKind: 'paste', fetchStatus: 'ready', result: userResult } }, 'en-US')
    expect(user.custom.result?.proxies[0].name).toBe('用户自定义节点')
  })
})
