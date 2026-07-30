import { useEffect, useRef, useState } from 'react'

/**
 * Measures a container so charts can be drawn in real pixel space.
 * Scaling an SVG via viewBox instead would distort stroke widths and text.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}
