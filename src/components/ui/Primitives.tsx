import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'secondary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={joinClasses('ui-button', `ui-button--${variant}`, className)} {...props} />
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  tooltip?: string
}

export function IconButton({ label, tooltip, className, type = 'button', ...props }: IconButtonProps) {
  return <button
    type={type}
    className={joinClasses('ui-icon-button', className)}
    aria-label={label}
    title={tooltip ?? label}
    {...props}
  />
}

export function SegmentedControl({ label, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { label: string; children: ReactNode }) {
  return <div className={joinClasses('ui-segmented-control', className)} role="group" aria-label={label} {...props}>{children}</div>
}

export function StatusBadge({ tone = 'neutral', className, children, ...props }: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  children: ReactNode
}) {
  return <span className={joinClasses('ui-status-badge', `is-${tone}`, className)} {...props}>{children}</span>
}

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}
