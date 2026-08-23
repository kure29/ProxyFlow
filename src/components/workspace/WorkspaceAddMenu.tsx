import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { blockByType } from '../../data/blockLibrary'
import { blockDescriptionKey, blockTitleKey, useI18n } from '../../i18n'
import type { BlockNodeData, BlockType } from '../../types/project'
import { BlockIcon } from '../icons/BlockIcon'
import type { WorkspaceCreationOption } from './workspaceCreation'

interface WorkspaceAddMenuProps {
  label: string
  options: WorkspaceCreationOption[]
  onCreate: (type: BlockType, data?: Partial<BlockNodeData>) => void
}

export function activateWorkspaceCreationOption(
  option: WorkspaceCreationOption,
  onCreate: WorkspaceAddMenuProps['onCreate'],
  onClose: () => void,
) {
  onCreate(option.blockType, option.data)
  onClose()
}

export function WorkspaceAddOptions({ options, onActivate }: {
  options: WorkspaceCreationOption[]
  onActivate: (option: WorkspaceCreationOption) => void
}) {
  const { t } = useI18n()
  const basicOptions = options.filter(({ advanced }) => !advanced)
  const advancedOptions = options.filter(({ advanced }) => advanced)
  const renderOption = (option: WorkspaceCreationOption) => {
    const item = blockByType.get(option.blockType)
    const optionLabel = t(blockTitleKey(option.blockType))
    const status = option.status ? t(`workspace.compatibility.${option.status === 'target-native' ? 'targetNative' : option.status}`)
      : t(blockDescriptionKey(option.blockType))
    return <button type="button" role="menuitem" disabled={option.disabled} key={option.id} onClick={() => onActivate(option)}>
      <BlockIcon name={item?.icon ?? 'plus'} size={17} />
      <span><strong>{optionLabel}</strong><small>{status}</small></span>
    </button>
  }
  return <>
    {basicOptions.map(renderOption)}
    {basicOptions.length > 0 && advancedOptions.length > 0 && <div className="workspace-add-separator" role="separator" />}
    {advancedOptions.map(renderOption)}
  </>
}

export function WorkspaceAddMenu({ label, options, onCreate }: WorkspaceAddMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const closeMenu = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return
    const focusFrame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus())
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu(true)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMenu(true)
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  const navigateMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
    if (!items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowUp' ? (current <= 0 ? items.length - 1 : current - 1)
          : (current + 1) % items.length
    items[next]?.focus()
  }
  return <div className="workspace-add-menu" ref={rootRef}>
    <button ref={triggerRef} type="button" className="primary-action" aria-haspopup="menu" aria-controls={open ? menuId : undefined} aria-expanded={open} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true) }
    }} onClick={() => open ? closeMenu(true) : setOpen(true)}><Plus size={15} />{label}<ChevronDown size={14} /></button>
    {open && <div className="workspace-add-sheet-backdrop" onPointerDown={() => closeMenu(true)} />}
    {open && <div ref={menuRef} id={menuId} className="workspace-add-options" role="menu" aria-label={label} onKeyDown={navigateMenu}>
      <WorkspaceAddOptions options={options} onActivate={(option) => activateWorkspaceCreationOption(option, onCreate, () => closeMenu(false))} />
    </div>}
  </div>
}
