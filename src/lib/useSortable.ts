import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Pointer-driven list reordering, hand-rolled because the app carries no
 * drag-and-drop dependency and the lists are short.
 *
 * The dragged row follows the pointer; every row it passes shifts by one slot
 * so the gap under the finger is always where the drop will land. Rows are
 * measured once on drag start, which is safe because nothing else moves while
 * a drag is in flight.
 */

export interface SortableState {
  /** Id being dragged, or null when idle. */
  draggingId: string | null
  /** Pixels to shift a given row by, for the live preview. */
  offsetFor: (id: string) => number
  /** Attach to each row so it can be measured. */
  registerRef: (id: string) => (el: HTMLElement | null) => void
  /** Put on the drag handle, not the whole row. */
  handleProps: (id: string) => {
    onPointerDown: (e: ReactPointerEvent) => void
    style: { touchAction: 'none' }
  }
}

interface DragState {
  id: string
  fromIndex: number
  startY: number
  /** Page scroll at drag start, so autoscroll counts toward the drag distance. */
  startScroll: number
  /** Row tops and heights at drag start, in document order. */
  rows: { id: string; top: number; height: number }[]
}

export function useSortable(
  ids: string[],
  onReorder: (orderedIds: string[]) => void,
  /** Fires once per slot change during a drag, not continuously — a haptic
   * tick is the caller's business, this hook only knows when a swap happens. */
  onSwap?: () => void,
): SortableState {
  const refs = useRef(new Map<string, HTMLElement>())
  const drag = useRef<DragState | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Where the dragged row currently wants to sit, so the preview and the drop
  // agree without recomputing at pointerup.
  const [targetIndex, setTargetIndex] = useState<number | null>(null)
  const [dy, setDy] = useState(0)

  // The pointerup listener is registered once per drag and would otherwise
  // close over the index as it stood when the drag began.
  const targetIndexRef = useRef<number | null>(null)
  targetIndexRef.current = targetIndex

  // Tracks the slot as of the last move(), updated synchronously within the
  // handler itself — targetIndexRef only catches up on the next render, which
  // lags behind pointermove's own firing rate.
  const lastSwapIndexRef = useRef<number | null>(null)
  const lastClientY = useRef(0)

  const registerRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) refs.current.set(id, el)
      else refs.current.delete(id)
    },
    [],
  )

  const onPointerDown = useCallback(
    (id: string, e: ReactPointerEvent) => {
      // Ignore secondary buttons so a right-click never starts a drag.
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const fromIndex = ids.indexOf(id)
      if (fromIndex < 0) return

      const rows = ids.flatMap((rowId) => {
        const el = refs.current.get(rowId)
        if (!el) return []
        const r = el.getBoundingClientRect()
        return [{ id: rowId, top: r.top, height: r.height }]
      })
      if (rows.length !== ids.length) return

      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { id, fromIndex, startY: e.clientY, startScroll: window.scrollY, rows }
      lastClientY.current = e.clientY
      lastSwapIndexRef.current = fromIndex
      setDraggingId(id)
      setTargetIndex(fromIndex)
      setDy(0)
    },
    [ids],
  )

  useEffect(() => {
    if (!draggingId) return

    function update() {
      const d = drag.current
      if (!d) return
      const delta = lastClientY.current - d.startY + (window.scrollY - d.startScroll)
      setDy(delta)

      // The slot is simply how many other rows the dragged row's centre now
      // sits below.
      const self = d.rows[d.fromIndex]
      const centre = self.top + self.height / 2 + delta
      let next = 0
      for (let i = 0; i < d.rows.length; i++) {
        if (i === d.fromIndex) continue
        const r = d.rows[i]
        if (centre > r.top + r.height / 2) next++
      }
      if (next !== lastSwapIndexRef.current) {
        lastSwapIndexRef.current = next
        onSwap?.()
      }
      setTargetIndex(next)
    }

    function move(e: PointerEvent) {
      lastClientY.current = e.clientY
      update()
    }

    // Dragging near the top or bottom edge scrolls the page, faster the closer
    // the finger gets, so a card can be carried the whole way to either end.
    const EDGE = 110
    const MAX_SPEED = 18
    let raf = 0
    function autoscroll() {
      const y = lastClientY.current
      const h = window.innerHeight
      let speed = 0
      if (y < EDGE) speed = -MAX_SPEED * Math.min(1, (EDGE - y) / EDGE)
      else if (y > h - EDGE) speed = MAX_SPEED * Math.min(1, (y - (h - EDGE)) / EDGE)
      if (speed !== 0) {
        const before = window.scrollY
        window.scrollBy(0, speed)
        if (window.scrollY !== before) update()
      }
      raf = requestAnimationFrame(autoscroll)
    }
    raf = requestAnimationFrame(autoscroll)

    function end() {
      const d = drag.current
      const to = targetIndexRef.current
      drag.current = null
      setDraggingId(null)
      setDy(0)
      setTargetIndex(null)
      if (!d || to === null || to === d.fromIndex) return
      const next = [...ids]
      const [moved] = next.splice(d.fromIndex, 1)
      next.splice(to, 0, moved)
      onReorder(next)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [draggingId, ids, onReorder, onSwap])

  const offsetFor = useCallback(
    (id: string) => {
      const d = drag.current
      if (!d || targetIndex === null) return 0
      if (id === d.id) return dy

      const i = d.rows.findIndex((r) => r.id === id)
      if (i < 0) return 0
      // The slot vacated is the row plus the margin between cards, which
      // getBoundingClientRect does not include.
      const gap = d.rows.length > 1 ? d.rows[1].top - (d.rows[0].top + d.rows[0].height) : 0
      const slot = d.rows[d.fromIndex].height + gap
      // Rows between the origin and the target close the gap it left behind.
      if (targetIndex > d.fromIndex && i > d.fromIndex && i <= targetIndex) return -slot
      if (targetIndex < d.fromIndex && i >= targetIndex && i < d.fromIndex) return slot
      return 0
    },
    [dy, targetIndex],
  )

  const handleProps = useCallback(
    (id: string) => ({
      onPointerDown: (e: ReactPointerEvent) => onPointerDown(id, e),
      style: { touchAction: 'none' as const },
    }),
    [onPointerDown],
  )

  return { draggingId, offsetFor, registerRef, handleProps }
}
