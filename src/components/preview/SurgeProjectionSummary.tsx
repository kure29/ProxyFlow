import type { CompileResult } from '../../core/compiler'
import { groupDiagnostics } from '../../core/compiler'
import { useI18n } from '../../i18n'

export function SurgeProjectionSummary({ result }: { result?: CompileResult }) {
  const { t } = useI18n()
  const stats = result?.stats
  if (!stats || stats.candidateCount === undefined) return null

  const compatible = stats.compatibleEndpointCount ?? stats.endpointCount ?? stats.proxyCount
  const skipped = stats.skippedEndpointCount ?? 0
  const blocking = stats.blockingIssueCount
    ?? result.issues.filter((issue) => issue.severity === 'error').length
  const warnings = groupDiagnostics(result.issues.filter((issue) => (
    issue.severity === 'warning' && issue.code === 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED'
  )))

  return <section className="surge-projection-summary" aria-label={t('preview.surgeProjection.title')}>
    <dl>
      <div>
        <dt>{t('preview.surgeProjection.compatible')}</dt>
        <dd>{compatible} <span>/ {stats.candidateCount}</span></dd>
      </div>
      <div>
        <dt>{t('preview.surgeProjection.skipped')}</dt>
        <dd>{skipped}</dd>
      </div>
      <div className={blocking > 0 ? 'is-blocked' : ''}>
        <dt>{t('preview.surgeProjection.blocking')}</dt>
        <dd>{blocking}</dd>
      </div>
    </dl>
    {warnings.length > 0 && <details>
      <summary>{t(warnings.length === 1
        ? 'preview.surgeProjection.oneWarningDetail'
        : 'preview.surgeProjection.warningDetails', { count: warnings.length })}</summary>
      <div>
        {warnings.map(({ issue, count }) => <article key={`${issue.code}-${issue.entityId ?? ''}`}>
          <code>{issue.code}</code>
          {count > 1 && <span>× {count}</span>}
          <p>{issue.message}</p>
        </article>)}
      </div>
    </details>}
  </section>
}
