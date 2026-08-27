import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CompileResult } from '../../core/compiler'
import { I18nProvider } from '../../i18n'
import { SurgeProjectionSummary } from './SurgeProjectionSummary'

function render(result: CompileResult) {
  return renderToStaticMarkup(createElement(
    I18nProvider,
    null,
    createElement(SurgeProjectionSummary, { result }),
  ))
}

describe('SurgeProjectionSummary', () => {
  it('renders compatible, skipped, and blocking totals with expandable warnings', () => {
    const html = render({
      success: true,
      content: '[General]\n',
      generatedAt: '2026-08-23T00:00:00.000Z',
      mock: false,
      stats: {
        proxyCount: 18,
        endpointCount: 18,
        candidateCount: 30,
        compatibleEndpointCount: 18,
        skippedEndpointCount: 12,
        blockingIssueCount: 0,
      },
      issues: [{
        target: 'surge',
        code: 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED',
        severity: 'warning',
        feature: 'proxy',
        message: 'Surge can use 18 of 30 candidates. 12 endpoints were skipped.',
      }],
    })

    expect(html).toContain('aria-label="Surge endpoint projection"')
    expect(html).toContain('<dt>Compatible</dt><dd>18 <span>/ 30</span></dd>')
    expect(html).toContain('<dt>Skipped</dt><dd>12</dd>')
    expect(html).toContain('<dt>Blocking</dt><dd>0</dd>')
    expect(html).toContain('<details class="diagnostic-technical">')
    expect(html).toContain('Skipped 12 incompatible nodes')
    expect(html).toContain('The current configuration can still be exported.')
    expect(html).toContain('Technical details · 1')
    expect(html).toContain('SURGE_PROXY_SET_ENDPOINTS_SKIPPED')
  })

  it('omits the projection band until target projection stats are available', () => {
    const html = render({
      success: true,
      content: '',
      generatedAt: '2026-08-23T00:00:00.000Z',
      mock: false,
      stats: { proxyCount: 5, endpointCount: 5 },
      issues: [],
    })

    expect(html).toBe('')
  })

  it('does not label unrelated compatibility warnings as skipped endpoints', () => {
    const html = render({
      success: true,
      content: '',
      generatedAt: '2026-08-23T00:00:00.000Z',
      mock: false,
      stats: {
        proxyCount: 2, endpointCount: 2, candidateCount: 2, compatibleEndpointCount: 2,
        skippedEndpointCount: 0, blockingIssueCount: 0,
      },
      issues: [{
        target: 'surge', code: 'SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED', severity: 'warning',
        feature: 'remote-source', message: 'The remote source was materialized.',
      }],
    })

    expect(html).toContain('<dt>Skipped</dt><dd>0</dd>')
    expect(html).not.toContain('<details>')
    expect(html).not.toContain('SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED')
  })

  it('renders every structured reason and the blocked 0/N projection state', () => {
    const html = render({
      success: false,
      content: '',
      generatedAt: '2026-08-26T00:00:00.000Z',
      mock: false,
      stats: {
        proxyCount: 0,
        endpointCount: 0,
        candidateCount: 13,
        compatibleEndpointCount: 0,
        skippedEndpointCount: 13,
        blockingIssueCount: 1,
      },
      targetProjection: {
        target: 'surge', candidateCount: 13, compatibleCount: 0, skippedCount: 13,
        blockingCount: 1, status: 'blocked',
        reasons: [
          { code: 'SURGE_TLS_CLIENT_FINGERPRINT_UNSUPPORTED', label: 'TLS client fingerprint unsupported', endpointCount: 13 },
          { code: 'SURGE_ANYTLS_SESSION_PARAMETERS_UNSUPPORTED', label: 'AnyTLS session parameters unsupported', endpointCount: 13 },
        ],
        strategies: [{
          target: 'surge', strategyId: 'auto', candidateCount: 13, compatibleCount: 0,
          skippedCount: 13, blockingCount: 1, status: 'blocked',
          reasons: [
            { code: 'SURGE_TLS_CLIENT_FINGERPRINT_UNSUPPORTED', label: 'TLS client fingerprint unsupported', endpointCount: 13 },
            { code: 'SURGE_ANYTLS_SESSION_PARAMETERS_UNSUPPORTED', label: 'AnyTLS session parameters unsupported', endpointCount: 13 },
          ],
        }],
      },
      issues: [{
        target: 'surge', code: 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED', severity: 'warning', feature: 'strategy', entityId: 'auto',
        message: 'A compiler message with an intentionally different shape.',
      }, {
        target: 'surge', code: 'SURGE_STRATEGY_NO_COMPATIBLE_MEMBERS', severity: 'error', feature: 'strategy', entityId: 'auto',
        message: 'Strategy “Hong Kong Auto” has 13 materialized candidates, but none can be represented by Surge.',
      }],
    })

    expect(html).toContain('<dt>Compatible</dt><dd>0 <span>/ 13</span></dd>')
    expect(html).toContain('<dt>Skipped</dt><dd>13</dd>')
    expect(html).toContain('<dt>Blocking</dt><dd>1</dd>')
    expect(html).toContain('13 nodes use TLS client fingerprint settings that Surge cannot represent')
    expect(html).toContain('13 nodes use AnyTLS session parameters that Surge cannot represent')
    expect(html).toContain('SURGE_TLS_CLIENT_FINGERPRINT_UNSUPPORTED')
    expect(html).toContain('SURGE_ANYTLS_SESSION_PARAMETERS_UNSUPPORTED')
  })
})
