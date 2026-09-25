import { useEffect, useRef } from 'react'

interface CelebrationBannerProps {
  /** Rendered only while non-null; unmounts immediately when it goes null,
   *  same as Toast — nothing here is worth animating out, only in. */
  message: string | null
  onDismiss: () => void
  /** Ms before auto-dismiss. Longer than Toast's: this is a moment worth a
   *  beat, not a quick "undo available" reminder. */
  duration?: number
}

/**
 * The visual payoff for a PR or a milestone (first time doing an exercise,
 * a round-number workout count) — everything the small gold `.badge-pr`
 * pill and the haptic buzz don't cover on their own. Sits apart from Toast
 * on purpose: Toast is a utilitarian snackbar for "Undo", low-key by design,
 * and stretching it to also carry "you just hit a PR" would undersell the
 * moment. This instead borrows `.finish-celebrate`'s gold-on-dark, peak-end
 * treatment and gives it its own fixed slot at the top of the screen, so it
 * can appear mid-set without disturbing the table underneath.
 *
 * One banner at a time — the caller (ActiveWorkout.tsx) queues messages and
 * only ever passes the head of the queue, so a weight PR and a volume PR on
 * the same set already arrive pre-joined into one message rather than firing
 * this twice back to back.
 */
export function CelebrationBanner({ message, onDismiss, duration = 3600 }: CelebrationBannerProps) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (message === null) return
    const id = window.setTimeout(() => onDismissRef.current(), duration)
    return () => window.clearTimeout(id)
  }, [message, duration])

  if (message === null) return null

  return (
    <div
      className="celebration-banner"
      role="status"
      onClick={onDismiss}
      // Decorative on top of the aria-live PR announcement already spoken by
      // SetRow; this is the same information restated visually; role="status"
      // is enough to have it picked up without doubling the assertive alert.
    >
      <span className="celebration-banner-text">{message}</span>
    </div>
  )
}
