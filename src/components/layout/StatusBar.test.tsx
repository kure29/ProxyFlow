import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { StructuredDiagnostic } from '../../core/compiler'
import { I18nProvider, setCurrentLocale } from '../../i18n'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'
import { StatusBar } from './StatusBar'

function render(diagnostics: StructuredDiagnostic[]) {
  const health: PrimaryTargetHealth = { status: 'ready', diagnostics }
  return renderToStaticMarkup(createElement(I18nProvider, null, createElement(StatusBar, { view: 'workspace', health })))
}

describe('StatusBar diagnostic counts', () => {
  beforeEach(() => setCurrentLocale('en-US'))

  it('shows one warning group instead of repeated endpoint rows', () => {
    const warnings = Array.from({ length: 88 }, (_, index): StructuredDiagnostic => ({
      code: 'MIHOMO_PROXY_VARIANT_UNSUPPORTED', severity: 'warning', message: `Variant ${index}`,
    }))
    const html = render([...warnings, {
      code: 'SURGE_REMOTE_PROXY_SOURCE_MATERIALIZED', severity: 'info', message: 'Snapshot used.',
    }])
    expect(html).toContain('1 warning')
    expect(html).not.toContain('89 configuration issues')
    expect(html).not.toContain('Variant 0')
    expect(html).not.toContain('MIHOMO_PROXY_VARIANT_UNSUPPORTED')
  })

  it('prioritizes blocking errors and treats info-only diagnostics as healthy', () => {
    const blocked = render([
      { code: 'BLOCK_A', severity: 'error', message: 'A' },
      { code: 'BLOCK_B', severity: 'error', message: 'B' },
      { code: 'LIMIT', severity: 'warning', message: 'Warning.' },
    ])
    expect(blocked).toContain('2 blockers')

    const info = render([{ code: 'NOTE', severity: 'info', message: 'No action.' }])
    expect(info).toContain('Configuration is valid')
  })
})
