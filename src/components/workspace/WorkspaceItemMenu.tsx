import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, GitBranch, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'

export function WorkspaceItemMenu({
  title,
  protectedItem = false,
  onEdit,
  onShowFlow,
  onDuplicate,
  onDelete,
}: {
  title: string
  protectedItem?: boolean
  onEdit: () => void
  onShowFlow: () => void
  onDuplicate?: () => void
  onDelete?: () => void
}) {
  const { t } = useI18n()
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = 220
    const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12)
    const estimatedHeight = confirming ? 150 : onDuplicate ? 190 : 150
    const top = rect.bottom + estimatedHeight + 8 <= window.innerHeight
      ? rect.bottom + 6
      : Math.max(12, rect.top - estimatedHeight - 6)
    setPosition({ top, left })
    const frame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus())
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false)
    }
    window.addEventListener('pointerdown', outside)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', outside)
    }
  }, [confirming, onDuplicate, open])

  const run = (action: () => void) => { setOpen(false); setConfirming(false); action() }
  return <>
    <button ref={triggerRef} type="button" className="icon-button workspace-item-menu-trigger" aria-label={`${t('workspace.moreActions')}: ${title}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={(event) => { event.stopPropagation(); setConfirming(false); setOpen((value) => !value) }}><MoreHorizontal size={17} /></button>
    {open && createPortal(<div ref={menuRef} id={id} className="workspace-item-menu" role="menu" aria-label={`${t('workspace.moreActions')}: ${title}`} style={{ position: 'fixed', top: position.top, left: position.left }} onKeyDown={(event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }}>
      {confirming ? <div className="workspace-item-delete-confirm" role="alert"><strong>{t('workspace.deleteConfirmTitle')}</strong><p>{t('workspace.deleteConfirmDescription', { name: title })}</p><div><button type="button" onClick={() => setConfirming(false)}>{t('workspace.cancel')}</button><button type="button" className="danger" onClick={() => onDelete && run(onDelete)}>{t('workspace.delete')}</button></div></div>
        : <>
          <button type="button" role="menuitem" onClick={() => run(onEdit)}><Pencil size={16} />{t('workspace.edit')}</button>
          <button type="button" role="menuitem" onClick={() => run(onShowFlow)}><GitBranch size={16} />{t('workspace.showInFlow')}</button>
          {onDuplicate && <button type="button" role="menuitem" onClick={() => run(onDuplicate)}><Copy size={16} />{t('canvas.copyNode')}</button>}
          {onDelete && <button type="button" role="menuitem" className="danger" disabled={protectedItem} onClick={() => setConfirming(true)}><Trash2 size={16} />{t('workspace.delete')}</button>}
        </>}
    </div>, document.body)}
  </>
}
