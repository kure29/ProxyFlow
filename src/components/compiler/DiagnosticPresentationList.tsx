import { ArrowRight, CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { diagnosticNodeId, type StructuredDiagnostic, type TargetProjectionSummary } from '../../core/compiler'
import { useI18n } from '../../i18n'
import { presentDiagnostics } from './diagnosticPresentation'

export function DiagnosticPresentationList({
  issues,
  exportable,
  entityNames,
  availableNodeIds,
  onLocate,
  compact = false,
  targetProjection,
}: {
  issues: readonly StructuredDiagnostic[]
  exportable?: boolean
  entityNames?: ReadonlyMap<string, string>
  availableNodeIds?: ReadonlySet<string>
  onLocate?: (issue: StructuredDiagnostic) => void
  compact?: boolean
  targetProjection?: TargetProjectionSummary
}) {
  const { locale, t } = useI18n()
  const presentations = presentDiagnostics(issues, { locale, t, exportable, entityNames, targetProjection })
  if (!presentations.length) return null

  return <div className={`diagnostic-presentations${compact ? ' is-compact' : ''}`} role="list" aria-label={t('diagnostic.listLabel')}>
    {presentations.map((presentation) => {
      const Icon = presentation.severity === 'error'
        ? CircleAlert
        : presentation.severity === 'warning' ? TriangleAlert : Info
      const locatable = presentation.locationIssue && availableNodeIds
        ? Boolean(diagnosticNodeId(presentation.locationIssue, availableNodeIds))
        : false
      const technicalCount = presentation.technicalDetails.reduce((count, detail) => count + detail.count, 0)
      return <article data-severity={presentation.severity} key={presentation.key} role="listitem">
        <Icon className="diagnostic-presentation-icon" size={17} aria-hidden="true" />
        <div>
          <span className="diagnostic-presentation-severity">
            {t(`issue.severity.${presentation.severity}`)}
            {presentation.occurrenceCount > 1 && <em>× {presentation.occurrenceCount}</em>}
          </span>
          <h3>{presentation.title}</h3>
          <p>{presentation.description}</p>
          {presentation.reasonSummaries.length > 0 && <ul>{presentation.reasonSummaries.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          <p className="diagnostic-presentation-impact">{presentation.impact}</p>
          {presentation.action && <p className="diagnostic-presentation-action">{presentation.action}</p>}
          <details className="diagnostic-technical">
            <summary>{t('diagnostic.technicalDetails', { count: technicalCount })}</summary>
            <div>{presentation.technicalDetails.map(({ issue, count }, index) => <div key={`${issue.code}-${issue.entityId ?? issue.nodeId ?? 'none'}-${index}`}>
              <span><code>{issue.code}</code>{count > 1 && <em>× {count}</em>}</span>
              <p>{issue.message}</p>
            </div>)}{presentation.projectionReasons?.map((reason) => <div key={`projection-${reason.code}-${reason.label}`}>
              <span><code>{reason.code}</code><em>× {reason.endpointCount}</em></span>
              <p>{reason.label}</p>
            </div>)}</div>
          </details>
          {locatable && onLocate && <button type="button" className="diagnostic-locate" onClick={() => onLocate(presentation.locationIssue!)}>{t('preview.locateNode')}<ArrowRight size={14} /></button>}
        </div>
      </article>
    })}
  </div>
}
