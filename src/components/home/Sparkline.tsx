interface Props {
  /** Oldest first. */
  values: number[]
}

/** Unit space the line is drawn in; CSS decides the real size. */
const VB_W = 100
const VB_H = 30
/** Room for the stroke, so a peak or a trough is never sliced flat. */
const PAD_Y = 3

/**
 * A line and nothing else: no axes, no ticks, no gridlines, no tooltip.
 *
 * `LineChart` cannot simply be shrunk into this slot. Its 44px left gutter and
 * 40px of vertical padding are fixed, so at row height the plot area collapses
 * to zero and the line disappears. This draws into a unit viewBox and lets the
 * row size it, with a non-scaling stroke so the line stays the same weight
 * however wide the card turns out to be.
 */
export function Sparkline({ values }: Props) {
  if (values.length === 0) return null

  const max = Math.max(...values)
  const min = Math.min(...values)
  // A series with no range has nothing to divide by, and one point has no
  // segment to draw. Both are honestly a flat line down the middle: the number
  // did not move. Anything else here would be a divide by zero or an empty box.
  const flat = values.length < 2 || max === min
  const points = flat
    ? `0,${VB_H / 2} ${VB_W},${VB_H / 2}`
    : values
        .map((v, i) => {
          const x = (i / (values.length - 1)) * VB_W
          const y = PAD_Y + (VB_H - PAD_Y * 2) * (1 - (v - min) / (max - min))
          return `${x.toFixed(2)},${y.toFixed(2)}`
        })
        .join(' ')

  return (
    <svg
      className="home-spark"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
