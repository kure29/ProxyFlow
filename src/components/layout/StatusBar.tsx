import { CheckCircle2, CircleAlert, LoaderCircle, MousePointer2, TriangleAlert } from 'lucide-react'
import { useBuilderStore } from '../../store/useBuilderStore'
import { useI18n } from '../../i18n'
import type { ProductView } from '../workspace/types'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'
import { summarizeDiagnosticCounts } from '../compiler/diagnosticPresentation'

export function StatusBar({ view, health }: { view: ProductView; health: PrimaryTargetHealth }) {
  const { t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const issues = health.diagnostics
  const checking = health.status === 'checking'
  const summary = summarizeDiagnosticCounts(issues)
  const hasIssueBadge = summary.badgeKind !== 'none'
  const statusText = summary.badgeKind === 'error'
    ? t(summary.badgeCount === 1 ? 'status.oneBlocker' : 'status.blockers', { count: summary.badgeCount ?? 0 })
    : summary.badgeKind === 'warning'
      ? t(summary.badgeCount === 1 ? 'status.oneWarning' : 'status.warnings', { count: summary.badgeCount ?? 0 })
      : t('status.ok')

  return (
    <footer className="statusbar" data-view={view}>
      <span className={hasIssueBadge ? 'status-issues' : 'status-ok'} title={checking ? t('workspace.targetChecking') : statusText} role="status">
        {checking ? <LoaderCircle className="spin" size={13} /> : summary.badgeKind === 'error' ? <CircleAlert size={13} /> : summary.badgeKind === 'warning' ? <TriangleAlert size={13} /> : <CheckCircle2 size={13} />}
        {checking ? t('workspace.targetChecking') : statusText}
      </span>
      {view === 'visual-flow' && <><span className="status-separator" />
        <span>{t('status.nodes', { count: nodes.length })}</span><span>{t('status.connections', { count: edges.length })}</span>
        <span className="status-spacer" />
        <span className="status-hint"><MousePointer2 size={12} /> {t('status.hint')}</span></>}
      {view === 'workspace' && <span className="status-spacer" />}
    </footer>
  )
}
