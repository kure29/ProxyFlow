import type { CompileResult } from '../../core/compiler'
import { useI18n } from '../../i18n'
import { DiagnosticPresentationList } from '../compiler/DiagnosticPresentationList'

export function SurgeProjectionSummary({ result, entityNames }: { result?: CompileResult; entityNames?: ReadonlyMap<string, string> }) {
  const { t } = useI18n()
  if (!result) return null
  const stats = result?.stats
  const projection = result?.targetProjection?.target === 'surge' ? result.targetProjection : undefined
  const candidateCount = projection?.candidateCount ?? stats?.candidateCount
  if (candidateCount === undefined) return null

  const compatible = projection?.compatibleCount ?? stats?.compatibleEndpointCount ?? stats?.endpointCount ?? stats?.proxyCount ?? 0
  const skipped = projection?.skippedCount ?? stats?.skippedEndpointCount ?? 0
  const blocking = projection?.blockingCount ?? stats?.blockingIssueCount
    ?? result.issues.filter((issue) => issue.severity === 'error').length
  const warnings = result.issues.filter((issue) => (
    issue.severity === 'warning' && issue.code === 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED'
  ))

  return <section className="surge-projection-summary" data-status={projection?.status} aria-label={t('preview.surgeProjection.title')}>
    <dl>
      <div>
        <dt>{t('preview.surgeProjection.compatible')}</dt>
        <dd>{compatible} <span>/ {candidateCount}</span></dd>
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
    {warnings.length > 0 && <DiagnosticPresentationList
      issues={warnings}
      exportable={result.success}
      entityNames={entityNames}
      targetProjection={result.targetProjection}
      compact
    />}
  </section>
}
