import { useEffect, useRef } from 'react'

interface ToastProps {
  /** Rendered only while non-null; going null unmounts it immediately. Every
   *  call site here replaces one toast with the next rather than stacking
   *  them, so there's nothing worth animating out. */
  message: string | null
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  /** Ms before auto-dismiss. */
  duration?: number
}

/**
 * Minimal auto-dismissing snackbar for the swipe-to-delete Undo affordance.
 * The app has no other toast pattern (UpdatePrompt.tsx's ".update-toast" is
 * a one-off, single-purpose bar, not a reusable component) — this stays
 * scoped to the one job it has rather than growing into a general
 * notification system.
 */
export function Toast({ message, actionLabel, onAction, onDismiss, duration = 4000 }: ToastProps) {
  // Callers pass an inline `() => setX(null)`, a fresh reference every
  // render — reading it through a ref (rather than putting it in the effect's
  // deps) keeps the timer from being restarted by unrelated re-renders of the
  // parent page while the toast is showing.
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (message === null) return
    const id = window.setTimeout(() => onDismissRef.current(), duration)
    return () => window.clearTimeout(id)
  }, [message, duration])

  if (message === null) return null

  return (
    <div className="toast" role="status">
      <span className="grow">{message}</span>
      {actionLabel && onAction && (
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            onAction()
            onDismiss()
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
