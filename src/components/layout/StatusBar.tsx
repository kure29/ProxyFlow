import { CheckCircle2, CircleAlert, Focus, MousePointer2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useMemo } from 'react'
import { useBuilderStore } from '../../store/useBuilderStore'
import { validateGraph } from '../../core/validation/validateProject'
import { localizeDiagnosticMessage, useI18n } from '../../i18n'

export function StatusBar() {
  const { locale, t } = useI18n()
  const { fitView, getZoom } = useReactFlow()
  const nodes = useBuilderStore((state) => state.nodes)
  const edges = useBuilderStore((state) => state.edges)
  const issues = useMemo(() => validateGraph(nodes, edges), [nodes, edges])
  const zoom = Math.round(getZoom() * 100)

  return (
    <footer className="statusbar">
      <button className={issues.length ? 'status-issues' : 'status-ok'} title={issues.map((issue) => localizeDiagnosticMessage(issue.code, issue.message, locale)).join('\n')}>
        {issues.length ? <CircleAlert size={13} /> : <CheckCircle2 size={13} />}
        {issues.length ? t('status.issueCount', { count: issues.length }) : t('status.ok')}
      </button>
      <span className="status-separator" />
      <span>{t('status.nodes', { count: nodes.length })}</span><span>{t('status.connections', { count: edges.length })}</span>
      <span className="status-spacer" />
      <span className="status-hint"><MousePointer2 size={12} /> {t('status.hint')}</span>
      <span className="status-separator" />
      <span className="zoom-value">{zoom}%</span>
      <button className="status-fit" onClick={() => fitView({ padding: 0.15, duration: 400 })}><Focus size={13} /> {t('status.fit')}</button>
    </footer>
  )
}
