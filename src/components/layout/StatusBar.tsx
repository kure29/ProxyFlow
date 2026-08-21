import { CheckCircle2, CircleAlert, LoaderCircle, MousePointer2 } from 'lucide-react'
import { useBuilderStore } from '../../store/useBuilderStore'
import { localizeDiagnosticMessage, useI18n } from '../../i18n'
import type { ProductView } from '../workspace/types'
import type { PrimaryTargetHealth } from '../compiler/useProjectCompiles'

export function StatusBar({ view, health }: { view: ProductView; health: PrimaryTargetHealth }) {
  const { locale, t } = useI18n()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const issues = health.diagnostics
  const issueTitle = issues.map((issue) => localizeDiagnosticMessage(issue.code, issue.message, locale)).join('\n')
  const checking = health.status === 'checking'

  return (
    <footer className="statusbar" data-view={view}>
      <span className={issues.length ? 'status-issues' : 'status-ok'} title={issueTitle} role="status">
        {checking ? <LoaderCircle className="spin" size={13} /> : issues.length ? <CircleAlert size={13} /> : <CheckCircle2 size={13} />}
        {checking ? t('workspace.targetChecking') : issues.length ? t('status.issueCount', { count: issues.length }) : t('status.ok')}
      </span>
      {view === 'visual-flow' && <><span className="status-separator" />
        <span>{t('status.nodes', { count: nodes.length })}</span><span>{t('status.connections', { count: edges.length })}</span>
        <span className="status-spacer" />
        <span className="status-hint"><MousePointer2 size={12} /> {t('status.hint')}</span></>}
      {view === 'workspace' && <span className="status-spacer" />}
    </footer>
  )
}
