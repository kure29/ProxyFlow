import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'

export function SubscriptionEmptyConfirmation() {
  const { t } = useI18n()
  const pending = useBuilderStore((state) => Object.values(state.subscriptionRuntimes).find((runtime) => runtime.pendingEmptySnapshot))
  const keep = useBuilderStore((state) => state.keepCurrentSubscription)
  const apply = useBuilderStore((state) => state.applyEmptySubscription)
  const safeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { safeButton.current?.focus() }, [pending?.sourceId])
  if (!pending?.pendingEmptySnapshot) return null
  const currentCount = pending.activeSnapshot?.result.detectedCount ?? 0
  return <div className="subscription-dialog-backdrop" role="presentation" onMouseDown={() => keep(pending.sourceId)}>
    <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="empty-confirmation-title" onMouseDown={(event) => event.stopPropagation()}>
      <span className="confirmation-icon is-warning"><AlertTriangle size={20} /></span>
      <h2 id="empty-confirmation-title">{t('subscription.empty.title')}</h2>
      <p>{t('subscription.empty.description')}</p>
      <p>{t('subscription.empty.current', { count: currentCount })}</p>
      <footer><button ref={safeButton} className="secondary-action" onClick={() => keep(pending.sourceId)}>{t('subscription.empty.keep')}</button><button className="danger-action" onClick={() => void apply(pending.sourceId)}>{t('subscription.empty.apply')}</button></footer>
    </section>
  </div>
}
