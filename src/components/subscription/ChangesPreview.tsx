import { GitCompareArrows, X } from 'lucide-react'
import type { SubscriptionChangeType, SubscriptionDiff, SubscriptionDiffEntry } from '../../core/subscription'
import { useI18n } from '../../i18n'

export function ChangesPreview({ diff, nodeCount, onClose }: { diff: SubscriptionDiff; nodeCount: number; onClose: () => void }) {
  const { t } = useI18n()
  const groups = [
    ['added', t('subscription.diff.added')],
    ['removed', t('subscription.diff.removed')],
    ['changed', t('subscription.diff.changed')],
  ] as const
  return <div className="subscription-dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="changes-preview" role="dialog" aria-modal="true" aria-labelledby="changes-preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><span><GitCompareArrows size={18} /></span><div><h2 id="changes-preview-title">{t('subscription.diff.title')}</h2><p>{diff.isInitialBaseline ? t('subscription.diff.initial', { count: nodeCount }) : `+${diff.added}  -${diff.removed}  ~${diff.changed}  =${diff.unchanged}`}</p></div><button onClick={onClose} aria-label={t('nodesPreview.closeAria')}><X size={18} /></button></header>
      <div className="changes-summary"><Metric symbol="+" label={t('subscription.diff.added')} value={diff.added} /><Metric symbol="-" label={t('subscription.diff.removed')} value={diff.removed} /><Metric symbol="~" label={t('subscription.diff.changed')} value={diff.changed} /><Metric symbol="=" label={t('subscription.diff.unchanged')} value={diff.unchanged} /></div>
      <div className="changes-list">
        {diff.isInitialBaseline || diff.entries.every((entry) => entry.kind === 'unchanged') ? <p className="changes-empty">{diff.isInitialBaseline ? t('subscription.diff.initial', { count: nodeCount }) : t('subscription.diff.empty')}</p> : groups.map(([kind, label]) => {
          const entries = diff.entries.filter((entry) => entry.kind === kind)
          return entries.length ? <section key={kind}><h3>{label}<span>{entries.length}</span></h3>{entries.map((entry) => <ChangeRow key={`${entry.kind}-${entry.identity}`} entry={entry} />)}</section> : null
        })}
      </div>
      <footer><button className="secondary-action" onClick={onClose}>{t('nodesPreview.close')}</button></footer>
    </section>
  </div>
}

function Metric({ symbol, label, value }: { symbol: string; label: string; value: number }) {
  return <div><span>{symbol}</span><small>{label}</small><strong>{value}</strong></div>
}

function ChangeRow({ entry }: { entry: SubscriptionDiffEntry }) {
  const { t } = useI18n()
  return <article><div><strong>{entry.name}</strong>{entry.previousName && entry.previousName !== entry.name && <small>{entry.previousName}</small>}</div>{entry.changeTypes.length > 0 && <ul>{entry.changeTypes.map((type) => <li key={type}>{changeLabel(type, t)}</li>)}</ul>}</article>
}

function changeLabel(type: SubscriptionChangeType, t: ReturnType<typeof useI18n>['t']) {
  return t(`subscription.diff.${type}`)
}
