import { useEffect, useRef, useState, type AnimationEvent, type ReactNode } from 'react'
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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Bottom sheet used for pickers, menus and confirmations. */
export function Sheet({ open, title, onClose, children, footer, hideClose }: SheetProps) {
  // Stays mounted a beat after `open` goes false so the reverse animation
  // (see .sheet-backdrop.closing / .sheet.closing in src/styles) can play —
  // the backdrop's own animationend is what actually unmounts it, rather
  // than a setTimeout duplicating the CSS duration as a second number.
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
    } else if (rendered) {
      setClosing(true)
    }
  }, [open, rendered])

  // Safety net for the unmount below: a backgrounded/suspended tab pauses CSS
  // animations indefinitely, so `animationend` can simply never fire (a PWA
  // going to the background mid-tap is the common case) — without this, the
  // sheet is stuck fully open forever and its close button looks dead, since
  // tapping it again is a no-op (it already called onClose once).
  useEffect(() => {
    if (!closing) return
    const timeout = window.setTimeout(() => {
      setRendered(false)
      setClosing(false)
    }, 260)
    return () => window.clearTimeout(timeout)
  }, [closing])

  // Focus moves into the dialog when it opens, Tab stays inside it, and focus
  // goes back to whatever opened it on close. The dialog itself takes focus
  // rather than the first field, so a phone keyboard does not pop up unasked.
  useEffect(() => {
    if (!open || !rendered) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open, rendered])

  useEffect(() => {
    if (!open) return
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const active = document.activeElement
      // A sheet stacked on top owns the keys while focus is in it.
      if (active && active !== document.body && !dialog.contains(active)) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (active === first || active === dialog || active === document.body)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || active === document.body)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onTab)
    return () => document.removeEventListener('keydown', onTab)
  }, [open])

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

  if (!rendered) return null

  // The sheet's own slide (180ms) outlasts the backdrop's fade (140ms), so
  // the unmount waits on the sheet's animationend, not the backdrop's —
  // ending on the shorter one would cut the slide-down off early.
  function onSheetAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (closing && e.target === e.currentTarget) {
      setRendered(false)
      setClosing(false)
    }
  }

  return (
    <div
      className={`sheet-backdrop${closing ? ' closing' : ''}`}
      // Pointer shortcut only: keyboard users close with Escape (handled above)
      // or the Close button, so the backdrop is not itself a control.
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`sheet${closing ? ' closing' : ''}`}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onAnimationEnd={onSheetAnimationEnd}
      >
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
          <button className={`btn grow ${destructive ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {message ? <p className="muted">{message}</p> : null}
    </Sheet>
  )
}
