import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { StructuredDiagnostic } from '../../core/compiler'
import { I18nProvider, setCurrentLocale, translate } from '../../i18n'
import { DiagnosticPresentationList } from './DiagnosticPresentationList'
import { mergeProjectHealthDiagnostics, presentDiagnostics, summarizeDiagnosticCounts } from './diagnosticPresentation'

const surgeSkipped: StructuredDiagnostic = {
  code: 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED',
  severity: 'warning',
  entityId: 'auto',
  message: 'Surge can use 15 of 23 candidates in strategy “Auto Select”. 8 incompatible endpoints were skipped (endpoint variant: 6, VLESS: 2).',
}

const surgeMaterialized: StructuredDiagnostic = {
  code: 'SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED',
  severity: 'info',
  entityId: 'source',
  message: 'Source “Subscription” is materialized from its validated snapshot because its remote format cannot be proven for Surge.',
}

const loonRemoteProxySourceMaterialized: StructuredDiagnostic = {
  code: 'LOON_REMOTE_PROXY_SOURCE_MATERIALIZED',
  severity: 'info',
  entityId: 'loon-source',
  message: 'Source “Subscription” is materialized from its validated snapshot because its remote format cannot be proven for Loon.',
}

const loonProxySetEndpointsSkipped: StructuredDiagnostic = {
  code: 'LOON_PROXY_SET_ENDPOINTS_SKIPPED',
  severity: 'warning',
  entityId: 'loon-strategy',
  message: 'Loon can use 2 of 3 candidates. 1 incompatible endpoint was skipped.',
}

describe('human diagnostic presentation', () => {
  beforeEach(() => setCurrentLocale('en-US'))

  it('presents Surge skipped counts and reasons in user language while preserving raw details', () => {
    const en = presentDiagnostics([surgeSkipped], {
      locale: 'en-US', t: (key, values) => translate('en-US', key, values), exportable: true,
    })[0]
    expect(en.title).toBe('Skipped 8 incompatible nodes')
    expect(en.description).toContain('Strategy “Auto Select” has 23 candidate nodes')
    expect(en.description).toContain('15 can be used by Surge')
    expect(en.impact).toBe('The current configuration can still be exported.')
    expect(en.reasonSummaries).toEqual([
      '6 nodes include parameters that Surge cannot fully represent',
      '2 nodes use protocols that Surge does not support',
    ])
    expect(en.technicalDetails[0].issue).toBe(surgeSkipped)

    const zh = presentDiagnostics([surgeSkipped], {
      locale: 'zh-CN', t: (key, values) => translate('zh-CN', key, values), exportable: true,
    })[0]
    expect(zh.title).toBe('已跳过 8 个不兼容节点')
    expect(zh.description).toContain('策略「Auto Select」共有 23 个候选节点')
    expect(zh.impact).toBe('当前配置仍可正常导出。')
    expect(zh.reasonSummaries).toContain('2 个节点使用 Surge 不支持的协议')

    const blocked = presentDiagnostics([surgeSkipped], {
      locale: 'en-US', t: (key, values) => translate('en-US', key, values), exportable: false,
    })[0]
    expect(blocked.impact).toBe('These skipped nodes are not the blocker. Resolve the blocking items shown for this project before exporting.')
  })

  it('renders materialized snapshots as information and keeps code behind technical details', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(DiagnosticPresentationList, {
      issues: [surgeMaterialized], exportable: true,
    })))
    const titleIndex = html.indexOf('Using the current subscription snapshot')
    const detailsIndex = html.indexOf('<details')
    const codeIndex = html.indexOf('SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED')
    expect(html).toContain('data-severity="info"')
    expect(html).toContain('This does not affect export and requires no action.')
    expect(titleIndex).toBeGreaterThan(-1)
    expect(detailsIndex).toBeGreaterThan(titleIndex)
    expect(codeIndex).toBeGreaterThan(detailsIndex)
  })

  it('keeps Loon materialized-source information non-blocking and preserves its code and location', () => {
    const presented = presentDiagnostics([loonRemoteProxySourceMaterialized], {
      locale: 'en-US', t: (key, values) => translate('en-US', key, values), exportable: true,
    })[0]
    expect(presented.severity).toBe('info')
    expect(presented.title).toBe('Export information')
    expect(presented.impact).not.toContain('blocked')
    expect(presented.technicalDetails[0].issue.code).toBe('LOON_REMOTE_PROXY_SOURCE_MATERIALIZED')
    expect(presented.locationIssue?.entityId).toBe('loon-source')
  })

  it('keeps Loon skipped endpoints non-blocking while describing the compatibility limitation', () => {
    const presented = presentDiagnostics([loonProxySetEndpointsSkipped], {
      locale: 'en-US', t: (key, values) => translate('en-US', key, values), exportable: true,
    })[0]
    expect(presented.severity).toBe('warning')
    expect(presented.title).toBe('Compatibility limitation')
    expect(presented.description).toBe('The current target cannot preserve part of this configuration.')
    expect(presented.impact).toBe('This warning does not block export by itself.')
    expect(presented.impact).not.toContain('blocked')
    expect(presented.technicalDetails[0].issue.code).toBe('LOON_PROXY_SET_ENDPOINTS_SKIPPED')
    expect(presented.locationIssue?.entityId).toBe('loon-strategy')
  })

  it('presents paused Shadowrocket evidence blockers with product-facing copy', () => {
    const presented = presentDiagnostics([{
      code: 'SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN', severity: 'error', entityId: 'proxy',
      message: 'WebSocket transport has not been proven.',
    }], { locale: 'en-US', t: (key, values) => translate('en-US', key, values), exportable: false })[0]
    expect(presented.title).toBe('Shadowrocket behavior is not proven')
    expect(presented.impact).toContain('blocked')
    expect(presented.technicalDetails[0].issue.code).toBe('SHADOWROCKET_PROXY_TRANSPORT_UNPROVEN')
  })

  it('collapses many Mihomo variant rows into one user-meaning group', () => {
    const warnings: StructuredDiagnostic[] = Array.from({ length: 88 }, (_, index) => ({
      code: 'MIHOMO_PROXY_VARIANT_UNSUPPORTED',
      severity: 'warning',
      entityId: `source-${index % 2}`,
      message: `Proxy “Node ${index + 1}” contains unsupported feature-${index + 1}.`,
    }))
    const presented = presentDiagnostics(warnings, {
      locale: 'en-US', t: (key, values) => translate('en-US', key, values), exportable: true,
    })
    expect(presented).toHaveLength(1)
    expect(presented[0].title).toBe('88 nodes have compatibility limits')
    expect(presented[0].description).toContain('using fields Mihomo supports')
    expect(presented[0].description.toLowerCase()).not.toContain('skip')
    expect(presented[0].technicalDetails).toHaveLength(88)

    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(DiagnosticPresentationList, { issues: warnings })))
    expect(html).toContain('88 nodes have compatibility limits')
    expect(html).toContain('Technical details · 88')
  })

  it('counts blockers by occurrence, warnings by presentation group, and ignores info badges', () => {
    const warnings = Array.from({ length: 88 }, (_, index): StructuredDiagnostic => ({
      code: 'MIHOMO_PROXY_VARIANT_UNSUPPORTED', severity: 'warning', message: `Variant ${index}`,
    }))
    expect(summarizeDiagnosticCounts([...warnings, surgeMaterialized])).toEqual({
      blockerCount: 0, warningGroupCount: 1, infoGroupCount: 1, badgeKind: 'warning', badgeCount: 1,
    })
    expect(summarizeDiagnosticCounts([
      ...warnings,
      { code: 'BLOCK_A', severity: 'error', message: 'A' },
      { code: 'BLOCK_B', severity: 'error', message: 'B' },
    ])).toEqual(expect.objectContaining({ blockerCount: 2, warningGroupCount: 1, badgeKind: 'error', badgeCount: 2 }))
    expect(summarizeDiagnosticCounts([surgeMaterialized])).toEqual({
      blockerCount: 0, warningGroupCount: 0, infoGroupCount: 1, badgeKind: 'none',
    })
  })

  it('falls back to human copy when a known technical message cannot be parsed', () => {
    const malformed = { ...surgeSkipped, message: 'A future compiler message shape.' }
    const shown = presentDiagnostics([malformed], {
      locale: 'en-US', t: (key, values) => translate('en-US', key, values), exportable: true,
    })[0]
    expect(shown.title).toBe('Skipped incompatible nodes')
    expect(shown.description).not.toContain('future compiler')
    expect(shown.technicalDetails[0].issue.message).toBe('A future compiler message shape.')
  })

  it('keeps mapped human explanations even when the English compiler message already matches them', () => {
    const issue: StructuredDiagnostic = {
      code: 'UI_SOURCE_DISCONNECTED', severity: 'warning',
      message: 'This source is not connected to the processing flow.',
    }
    const shown = presentDiagnostics([issue], {
      locale: 'en-US', t: (key, values) => translate('en-US', key, values), exportable: true,
    })[0]
    expect(shown.description).toBe('This source is not connected to the processing flow.')
    expect(shown.description).not.toBe('The current target cannot preserve part of this configuration.')
    expect(shown.technicalDetails[0].issue).toBe(issue)
  })

  it('adds primary-health-only blockers without duplicating target compatibility rows', () => {
    const graphWarning: StructuredDiagnostic = { code: 'GRAPH_WARNING', severity: 'warning', message: 'Graph warning.' }
    const targetWarning: StructuredDiagnostic = { code: 'TARGET_WARNING', severity: 'warning', message: 'Target warning.' }
    const compilerUnavailable: StructuredDiagnostic = {
      code: 'TARGET_COMPILER_UNAVAILABLE', severity: 'error', message: 'The compiler could not be loaded.',
    }
    expect(mergeProjectHealthDiagnostics(
      [graphWarning],
      [graphWarning, targetWarning, compilerUnavailable],
      [targetWarning],
    )).toEqual([graphWarning, compilerUnavailable])
  })

  it('gives Loon blockers evidence-specific unsupported, unproven, routing, and policy copy', () => {
    const issues: StructuredDiagnostic[] = [
      { code: 'LOON_PROXY_PROTOCOL_UNSUPPORTED', severity: 'error', entityId: 'proxy-1', message: 'SOCKS5 is unsupported.' },
      { code: 'LOON_REMOTE_RULE_ORDER_SEMANTICS_UNPROVEN', severity: 'error', entityId: 'remote-rule', message: 'Remote order is unproven.' },
      { code: 'LOON_ROUTE_ORDER_SEMANTICS_UNSUPPORTED', severity: 'error', entityId: 'route-order', message: 'Mixed route families are unsupported.' },
      { code: 'LOON_SERVICE_RULE_POLICY_CONFLICT', severity: 'error', entityId: 'service-rule', message: 'Conflicting policies.' },
      { code: 'LOON_RULE_SOURCE_FORMAT_UNPROVEN', severity: 'error', entityId: 'rule-source', message: 'Rule source format is unproven.' },
      { code: 'LOON_REMOTE_PROXY_SOURCE_FORMAT_UNPROVEN', severity: 'error', entityId: 'proxy-source', message: 'Remote source format is unproven.' },
    ]
    const presented = presentDiagnostics(issues, {
      locale: 'en-US', t: (key, values) => translate('en-US', key, values), exportable: false,
    })
    expect(presented.map(({ title }) => title)).toEqual([
      'Loon cannot represent this setting',
      'Loon remote-rule order is unproven',
      'Loon routing order cannot be preserved',
      'Loon service policies conflict',
      'Loon rule-source format is unproven',
      'Loon remote proxy-source semantics are unproven',
    ])
    expect(presented.every(({ technicalDetails }) => technicalDetails[0].issue.code.startsWith('LOON_'))).toBe(true)
    expect(presented.find(({ title }) => title.includes('routing'))?.locationIssue?.entityId).toBe('route-order')
    expect(presented.find(({ title }) => title.includes('service'))?.impact).toContain('blocked')
  })
})
