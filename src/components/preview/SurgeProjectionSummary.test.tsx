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
})
