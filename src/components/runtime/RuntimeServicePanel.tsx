import { Check, CloudOff, Link2, Unlink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ServerRuntimeProvider } from '../../core/runtime'
import { useBuilderStore } from '../../store/useBuilderStore'
import { useI18n } from '../../i18n'

export function RuntimeServicePanel() {
  const { t } = useI18n()
  const config = useBuilderStore((state) => state.runtimeService)
  const setConfig = useBuilderStore((state) => state.setRuntimeServiceConfig)
  const disconnect = useBuilderStore((state) => state.disconnectRuntimeService)
  const [open, setOpen] = useState(false)
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? '')
  const [token, setToken] = useState(config?.token ?? '')
  const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>(config ? 'connected' : 'idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!config) { setBaseUrl(''); setToken(''); setStatus('idle') }
    else { setBaseUrl(config.baseUrl); setToken(config.token); setStatus('connected') }
  }, [config])

  const connect = async () => {
    const next = { baseUrl: baseUrl.trim().replace(/\/+$/, ''), token: token.trim() }
    if (!next.baseUrl || next.token.length < 16) { setStatus('error'); setError(t('runtime.invalidConfig')); return }
    setStatus('checking'); setError(null)
    try {
      await new ServerRuntimeProvider(next, { projectId: 'health-check', sourceId: 'health-check', sourceName: 'health-check' }).health()
      setConfig(next); setStatus('connected')
    } catch { setStatus('error'); setError(t('runtime.unavailable')) }
  }

  const close = () => setOpen(false)

  return <div className="runtime-service-wrap">
    <button className={`runtime-service-trigger${config ? ' is-connected' : ''}`} aria-label={t('runtime.open')} title={t('runtime.open')} onClick={() => setOpen((value) => !value)}>
      {config ? <Link2 size={14} /> : <CloudOff size={14} />}<span>{config ? t('runtime.connected') : t('runtime.localMode')}</span>
    </button>
    {open && <div className="runtime-service-popover" role="dialog" aria-label={t('runtime.title')} onClick={(event) => event.stopPropagation()}>
      <div className="runtime-service-heading"><div><span>{t('runtime.kicker')}</span><strong>{t('runtime.title')}</strong></div><button className="icon-button" aria-label={t('runtime.close')} title={t('runtime.close')} onClick={close}>×</button></div>
      <p>{t('runtime.description')}</p>
      <label>{t('runtime.url')}<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://127.0.0.1:8787" autoComplete="url" /></label>
      <label>{t('runtime.token')}<input value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="off" /></label>
      {error && <div className="runtime-service-error" role="alert">{error}</div>}
      {status === 'connected' && <div className="runtime-service-status"><Check size={13} />{t('runtime.connected')}</div>}
      <div className="runtime-service-actions">
        <button className="secondary-action" disabled={status === 'checking'} onClick={() => void connect()}><Link2 size={14} />{status === 'checking' ? t('runtime.checking') : t('runtime.connect')}</button>
        {config && <button className="danger-button secondary-action" onClick={() => { disconnect(); close() }}><Unlink size={14} />{t('runtime.disconnect')}</button>}
      </div>
      <small>{t('runtime.privacy')}</small>
    </div>}
  </div>
}
