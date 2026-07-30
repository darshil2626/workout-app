import { useEffect, type ReactNode } from 'react'
import { IconClose } from './Icons'

interface SheetProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Hides the close button when the sheet must be resolved by its actions. */
  hideClose?: boolean
}

/** Bottom sheet used for pickers, menus and confirmations. */
export function Sheet({ open, title, onClose, children, footer, hideClose }: SheetProps) {
  // Lock the page behind the sheet so scrolling stays inside it.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        {(title || !hideClose) && (
          <div className="sheet-head">
            <div className="sheet-title">{title}</div>
            {!hideClose && (
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                <IconClose />
              </button>
            )}
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Replaces window.confirm, which iOS standalone PWAs render inconsistently. */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onCancel}
      hideClose
      footer={
        <>
          <button className="btn btn-ghost grow" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn grow ${destructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {message ? <p className="muted">{message}</p> : null}
    </Sheet>
  )
}
