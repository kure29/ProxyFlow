import {
  useEffect, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import {
  firstEnabledIndex, lastEnabledIndex, moveEnabledIndex, type WebSelectOption,
} from './webSelectModel'

export interface WebSelectProps {
  value?: string
  defaultValue?: string
  options: readonly WebSelectOption[]
  onChange?: (value: string) => void
  label: string
  disabled?: boolean
  invalid?: boolean
  className?: string
}

interface MenuPosition {
  left: number
  top?: number
  bottom?: number
  width: number
  maxHeight: number
}

const VIEWPORT_MARGIN = 8
const MENU_GAP = 5
const PREFERRED_MENU_HEIGHT = 280

export function WebSelect({
  value,
  defaultValue = '',
  options,
  onChange,
  label,
  disabled = false,
  invalid = false,
  className,
}: WebSelectProps) {
  const listboxId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [internalValue, setInternalValue] = useState(defaultValue)
  const selectedValue = value ?? internalValue
  const selectedIndex = options.findIndex((option) => option.value === selectedValue)
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined
  const [activeIndex, setActiveIndex] = useState(() => selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options))
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN
    const above = rect.top - MENU_GAP - VIEWPORT_MARGIN
    const opensUp = below < Math.min(PREFERRED_MENU_HEIGHT, 180) && above > below
    const maxHeight = Math.max(96, Math.min(PREFERRED_MENU_HEIGHT, opensUp ? above : below))
    const width = Math.min(rect.width, window.innerWidth - VIEWPORT_MARGIN * 2)
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - width),
    )
    setPosition(opensUp
      ? { left, bottom: window.innerHeight - rect.top + MENU_GAP, width, maxHeight }
      : { left, top: rect.bottom + MENU_GAP, width, maxHeight })
  }

  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const openMenu = (preferredIndex = selectedIndex) => {
    if (disabled || options.every((option) => option.disabled)) return
    const nextIndex = preferredIndex >= 0 && !options[preferredIndex]?.disabled
      ? preferredIndex
      : firstEnabledIndex(options)
    setActiveIndex(nextIndex)
    setOpen(true)
  }

  const choose = (option: WebSelectOption) => {
    if (option.disabled) return
    if (value === undefined) setInternalValue(option.value)
    onChange?.(option.value)
    close(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const frame = window.requestAnimationFrame(() => listboxRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !listboxRef.current?.contains(target)) close(false)
    }
    const onViewportChange = () => updatePosition()
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open])

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      openMenu(event.key === 'ArrowDown' && selectedIndex < 0 ? firstEnabledIndex(options) : selectedIndex)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(selectedIndex >= 0 ? selectedIndex : lastEnabledIndex(options))
    } else if (event.key === 'Home') {
      event.preventDefault()
      openMenu(firstEnabledIndex(options))
    } else if (event.key === 'End') {
      event.preventDefault()
      openMenu(lastEnabledIndex(options))
    }
  }

  const onListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === 'Tab') {
      close(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => moveEnabledIndex(options, index, event.key === 'ArrowDown' ? 1 : -1))
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? firstEnabledIndex(options) : lastEnabledIndex(options))
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && options[activeIndex]) {
      event.preventDefault()
      choose(options[activeIndex])
    }
  }

  const menuStyle: CSSProperties | undefined = position ? {
    left: position.left,
    top: position.top,
    bottom: position.bottom,
    width: position.width,
    maxHeight: position.maxHeight,
  } : undefined

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={['web-select-trigger', open ? 'is-open' : '', className ?? ''].filter(Boolean).join(' ')}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-invalid={invalid || undefined}
      aria-controls={open ? listboxId : undefined}
      disabled={disabled}
      onClick={() => open ? close(false) : openMenu()}
      onKeyDown={onTriggerKeyDown}
    >
      <span title={selectedOption?.label ?? label}>{selectedOption?.label ?? label}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && position && createPortal(<div
      ref={listboxRef}
      id={listboxId}
      className="web-select-popover"
      style={menuStyle}
      role="listbox"
      aria-label={label}
      aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
      tabIndex={-1}
      onKeyDown={onListboxKeyDown}
    >
      {options.map((option, index) => <button
        type="button"
        id={`${listboxId}-${index}`}
        role="option"
        aria-selected={option.value === selectedValue}
        className={`${option.value === selectedValue ? 'is-selected' : ''}${index === activeIndex ? ' is-active' : ''}`}
        disabled={option.disabled}
        key={option.value}
        onPointerMove={() => !option.disabled && setActiveIndex(index)}
        onClick={() => choose(option)}
      >
        <span>{option.label}</span>
        {option.value === selectedValue && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>, document.body)}
  </>
}
