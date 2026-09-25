import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useElementWidth } from './useElementWidth'

export interface HeatCell {
  day: number
  value: number
  workouts: number
}

interface Props {
  cells: HeatCell[]
  firstDayOfWeek: 0 | 1
  formatValue: (v: number) => string
}

/**
 * Sequential ramp, dimmest → brightest as volume rises. Steps come from the
 * validated blue ramp (adjacent lightness gaps ≥ 0.06 on this surface), so the
 * bins stay distinguishable rather than blurring into each other.
 */
const RAMP = ['var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)']

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const DAY_MS = 86400000

// Cells are fixed-size by default, so a short window (Home's 70-day preview,
// or any calendar with only a few weeks of real history) leaves the flex row
// packed to the left with a wide blank strip after it — the box looks half
// empty even though it's rendering correctly. Growing cells to fill the
// measured container width fixes that; when there ARE enough weeks to need
// more room than the container has, the size clamps to MIN_CELL and the
// existing horizontal scroll (auto-scrolled to the most recent week) takes
// over exactly as before.
const MIN_CELL = 15
const MAX_CELL = 26
const GAP = 3
/** `.heatmap-day`'s 11px width plus `.heatmap-days`' 1px padding-right. */
const DAY_COL_WIDTH = 12

/**
 * A placeholder calendar for a chart's empty state: a regular, unmistakably
 * fake pattern rather than real dates the user might mistake for their own
 * training. Shared by every empty-state preview that wants "this is what the
 * activity calendar looks like filled in" without inventing its own fake
 * data shape.
 */
export function syntheticHeatCells(days: number, now = Date.now()): HeatCell[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = today.getTime() - (days - 1) * DAY_MS
  const cells: HeatCell[] = []
  for (let i = 0; i < days; i++) {
    const trains = i % 7 !== 0 && i % 7 !== 4
    cells.push({ day: start + i * DAY_MS, value: trains ? 10 + (i % 5) * 4 : 0, workouts: trains ? 1 : 0 })
  }
  return cells
}

export function Heatmap({ cells, firstDayOfWeek, formatValue }: Props) {
  const [active, setActive] = useState<HeatCell | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  // Measured on .heatmap-wrap rather than .heatmap-scroll itself: they share
  // the same content width (neither has horizontal padding), and it leaves
  // `scroller` free for scrollLeft management below without juggling two
  // refs on one element.
  const { ref: measureRef, width: containerWidth } = useElementWidth<HTMLDivElement>()

  // Open on the most recent weeks — that is what the user came to look at.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [cells.length])

  const trained = cells.filter((c) => c.value > 0).map((c) => c.value)
  // Quartile thresholds over trained days only: including rest days would push
  // every real session into the top bin.
  const sorted = [...trained].sort((a, b) => a - b)
  const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))] ?? 0
  const thresholds = [q(0.25), q(0.5), q(0.75)]

  function binOf(value: number): number {
    if (value <= 0) return -1
    if (value <= thresholds[0]) return 0
    if (value <= thresholds[1]) return 1
    if (value <= thresholds[2]) return 2
    return 3
  }

  // Pad the start so each column is a full calendar week.
  const first = cells[0]
  const leading = first ? (new Date(first.day).getDay() - firstDayOfWeek + 7) % 7 : 0
  const padded: (HeatCell | null)[] = [...Array<null>(leading).fill(null), ...cells]
  const weeks: (HeatCell | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))

  const cellSize = useMemo(() => {
    if (containerWidth === 0 || weeks.length === 0) return MIN_CELL
    const available = containerWidth - DAY_COL_WIDTH - GAP * weeks.length
    return Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor(available / weeks.length)))
  }, [containerWidth, weeks.length])

  return (
    <div className="heatmap-wrap" ref={measureRef}>
      <div className="heatmap-scroll" ref={scroller}>
        <div className="heatmap" style={{ '--heat-cell': `${cellSize}px` } as CSSProperties}>
          <div className="heatmap-days">
            {DAY_LABELS.map((_, i) => (
              // Only alternate labels are drawn: seven stacked letters is noise.
              <span key={i} className="heatmap-day">
                {i % 2 === 1 ? DAY_LABELS[(i + firstDayOfWeek) % 7] : ''}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div className="heatmap-week" key={wi}>
              {week.map((cell, di) => {
                if (!cell) return <span className="heatmap-cell empty" key={di} />
                const bin = binOf(cell.value)
                return (
                  <button
                    key={di}
                    className="heatmap-cell"
                    style={{ background: bin < 0 ? 'var(--heat-0)' : RAMP[bin] }}
                    onPointerEnter={() => setActive(cell)}
                    onPointerDown={() => setActive(cell)}
                    onPointerLeave={() => setActive(null)}
                    aria-label={`${new Date(cell.day).toDateString()}: ${
                      cell.workouts === 0 ? 'rest day' : formatValue(cell.value)
                    }`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="heatmap-foot">
        <span className="faint">{active ? new Date(active.day).toDateString() : 'Less'}</span>
        {active ? (
          <span className="muted mono">
            {active.workouts === 0
              ? 'Rest day'
              : `${formatValue(active.value)} · ${active.workouts} workout${active.workouts > 1 ? 's' : ''}`}
          </span>
        ) : (
          <div className="heatmap-legend">
            <span className="heatmap-cell" style={{ background: 'var(--heat-0)' }} />
            {RAMP.map((c) => (
              <span key={c} className="heatmap-cell" style={{ background: c }} />
            ))}
          </div>
        )}
        {!active && <span className="faint">More</span>}
      </div>
    </div>
  )
}
