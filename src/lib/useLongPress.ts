import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Hand-rolled long-press, in the same pointer-events style as
 * useSortable.ts and useSwipeToDelete.ts.
 *
 * Fires once after `delay` ms of a held pointer that hasn't moved more than
 * `moveTolerance` px. Movement past that tolerance — in either axis — cancels
 * the timer outright, which is what keeps this from firing mid-scroll or
 * mid-swipe on its own; `disabled` additionally lets a caller cancel it from
 * the outside for a reason this hook can't see by itself, such as a sibling
 * useSwipeToDelete having already committed the same pointer to a horizontal
 * drag. It's checked both at pointerdown (don't start a timer over a row a
 * swipe is already dragging) and on every move (cancel a timer already
 * running the moment that becomes true).
 */

const DEFAULT_DELAY = 500
const MOVE_TOLERANCE = 10

export interface LongPressOptions {
  delay?: number
  moveTolerance?: number
  disabled?: (id: string) => boolean
}

export interface LongPressState {
  /** Spread onto the row's outermost element. */
  rowProps: (id: string) => {
    onPointerDown: (e: ReactPointerEvent) => void
  }
}

interface Press {
  id: string
  pointerId: number
  startX: number
  startY: number
  timer: number
}

export function useLongPress(onLongPress: (id: string) => void, options?: LongPressOptions): LongPressState {
  const press = useRef<Press | null>(null)

  const onLongPressRef = useRef(onLongPress)
  onLongPressRef.current = onLongPress
  const optionsRef = useRef(options)
  optionsRef.current = options

  const clear = useCallback(() => {
    const p = press.current
    if (!p) return
    window.clearTimeout(p.timer)
    press.current = null
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', clear)
    window.removeEventListener('pointercancel', clear)
  }, [])

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const p = press.current
      if (!p || p.pointerId !== e.pointerId) return
      const dx = e.clientX - p.startX
      const dy = e.clientY - p.startY
      const tolerance = optionsRef.current?.moveTolerance ?? MOVE_TOLERANCE
      if (Math.abs(dx) > tolerance || Math.abs(dy) > tolerance || optionsRef.current?.disabled?.(p.id)) {
        clear()
      }
    },
    [clear],
  )

  const onPointerDown = useCallback(
    (id: string, e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (optionsRef.current?.disabled?.(id)) return
      clear()
      const delay = optionsRef.current?.delay ?? DEFAULT_DELAY
      const pointerId = e.pointerId
      const timer = window.setTimeout(() => {
        // A row a swipe has since claimed doesn't get a long-press too, even
        // if the hold technically outlasted the delay before that happened.
        const stillPressed = press.current?.pointerId === pointerId
        const claimedElsewhere = optionsRef.current?.disabled?.(id) ?? false
        clear()
        if (stillPressed && !claimedElsewhere) onLongPressRef.current(id)
      }, delay)
      press.current = { id, pointerId, startX: e.clientX, startY: e.clientY, timer }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', clear)
      window.addEventListener('pointercancel', clear)
    },
    [clear, handleMove],
  )

  const rowProps = useCallback(
    (id: string) => ({
      onPointerDown: (e: ReactPointerEvent) => onPointerDown(id, e),
    }),
    [onPointerDown],
  )

  return { rowProps }
}
