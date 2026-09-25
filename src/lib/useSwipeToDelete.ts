import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Pointer-driven swipe-to-delete for list rows, hand-rolled in the same style
 * as useSortable.ts (no gesture library in this app).
 *
 * A row only starts translating once horizontal drag intent is clear — a few
 * px more sideways movement than vertical — so an ordinary vertical scroll
 * that happens to start on a swipeable row is never hijacked; until that
 * point nothing here calls preventDefault or captures the pointer, and
 * `rowProps().style.touchAction` is 'pan-y' so a touch scroll is free to
 * proceed natively the moment the browser recognises it as one (the same
 * "declare intent in CSS, then confirm in JS" split useSortable's handle
 * uses with touch-action: none, just permissive on the vertical axis instead
 * of blocking every axis).
 *
 * Past `threshold` px (or 30% of the row's own width, whichever is smaller —
 * a fixed 80px would be nearly the whole row on a narrow screen) releasing
 * calls `onDelete` immediately; short of it, the row springs back. Both the
 * live drag and the spring-back are plain CSS transform/transition, so the
 * app's global prefers-reduced-motion switch (index.css) already flattens
 * the spring-back to an instant snap without any extra handling here.
 *
 * This hook only tracks the gesture and reports it — it does not remove
 * anything from a list itself, so callers are free to pair the delete with
 * an Undo toast rather than a confirmation dialog.
 */

export interface SwipeToDeleteState {
  /** True while `id`'s row has committed to a horizontal drag. A long-press
   *  hook sharing the same row should treat this as "cancel my timer". */
  isSwiping: (id: string) => boolean
  /** True once a swipe has been pulled past the delete threshold — the point
   *  at which releasing now would delete the row. Purely a visual cue. */
  isArmed: (id: string) => boolean
  /** Current horizontal offset (<= 0) to render as translateX for this id. */
  offsetFor: (id: string) => number
  /** Spread onto the row's outermost element. */
  rowProps: (id: string) => {
    onPointerDown: (e: ReactPointerEvent) => void
    style: CSSProperties
  }
}

interface Track {
  id: string
  pointerId: number
  startX: number
  startY: number
  width: number
  /** Set once horizontal intent is confirmed; before that this is just a
   *  candidate that might turn out to be a scroll. */
  committed: boolean
  dx: number
}

interface ActiveDrag {
  id: string
  dx: number
  width: number
}

/** Movement, in either axis, before a candidate gesture declares itself. */
const INTENT_PX = 8

export function useSwipeToDelete(onDelete: (id: string) => void, threshold = 80): SwipeToDeleteState {
  const track = useRef<Track | null>(null)
  const [active, setActive] = useState<ActiveDrag | null>(null)

  // Read through refs so the window listeners below — added once per drag
  // and never re-subscribed mid-drag — always see the latest callback and
  // threshold rather than whatever the component passed in when the drag
  // started.
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete
  const thresholdRef = useRef(threshold)
  thresholdRef.current = threshold

  // Empty deps: these three need a stable identity across renders so the
  // function reference removeEventListener is given always matches the one
  // addEventListener was given.
  const removeListeners = useCallback(() => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleEnd)
    window.removeEventListener('pointercancel', handleEnd)
  }, [])

  const handleMove = useCallback((e: PointerEvent) => {
    const t = track.current
    if (!t || e.pointerId !== t.pointerId) return
    const dx = e.clientX - t.startX
    const dy = e.clientY - t.startY

    if (!t.committed) {
      if (Math.abs(dx) < INTENT_PX && Math.abs(dy) < INTENT_PX) return
      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical intent wins — this was a scroll, not a swipe. Bail out
        // entirely and let the page's native scrolling (already under way)
        // carry on unimpeded.
        track.current = null
        removeListeners()
        return
      }
      t.committed = true
    }

    const clamped = Math.min(0, Math.max(-t.width, dx))
    t.dx = clamped
    setActive({ id: t.id, dx: clamped, width: t.width })
  }, [removeListeners])

  const handleEnd = useCallback(() => {
    const t = track.current
    track.current = null
    removeListeners()
    if (!t || !t.committed) {
      setActive(null)
      return
    }
    const effectiveThreshold = Math.min(thresholdRef.current, t.width * 0.3)
    // Cleared unconditionally: on delete the row is about to unmount anyway,
    // and short of the threshold this is what drives the spring-back — with
    // `active` gone, isSwiping(id) is false, so the row's own transition
    // (enabled whenever a drag isn't live) animates offsetFor(id) back to 0.
    setActive(null)
    if (t.dx <= -effectiveThreshold) onDeleteRef.current(t.id)
  }, [removeListeners])

  const onPointerDown = useCallback(
    (id: string, e: ReactPointerEvent) => {
      // Ignore secondary mouse buttons so a right-click never starts a drag.
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const width = e.currentTarget.getBoundingClientRect().width
      if (width <= 0) return
      track.current = {
        id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        width,
        committed: false,
        dx: 0,
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleEnd)
      window.addEventListener('pointercancel', handleEnd)
    },
    [handleMove, handleEnd],
  )

  const isSwiping = useCallback((id: string) => active?.id === id, [active])

  const isArmed = useCallback(
    (id: string) => {
      if (active?.id !== id) return false
      const effectiveThreshold = Math.min(threshold, active.width * 0.3)
      return active.dx <= -effectiveThreshold
    },
    [active, threshold],
  )

  const offsetFor = useCallback((id: string) => (active?.id === id ? active.dx : 0), [active])

  const rowProps = useCallback(
    (id: string) => ({
      onPointerDown: (e: ReactPointerEvent) => onPointerDown(id, e),
      style: {
        transform: `translateX(${offsetFor(id)}px)`,
        transition: isSwiping(id) ? 'none' : 'transform 200ms ease',
        touchAction: 'pan-y' as const,
      },
    }),
    [onPointerDown, offsetFor, isSwiping],
  )

  return { isSwiping, isArmed, offsetFor, rowProps }
}
