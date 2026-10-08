import { useEffect, useRef, useState } from 'react'

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
  // The tapped day and where to float its card, measured against the wrapper.
  const [active, setActive] = useState<{ cell: HeatCell; x: number; y: number } | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const wrap = useRef<HTMLDivElement | null>(null)

  function show(cell: HeatCell, target: HTMLElement) {
    const w = wrap.current
    if (!w) return
    const r = target.getBoundingClientRect()
    const wr = w.getBoundingClientRect()
    // Clamped so the card never hangs off either edge of the chart.
    const x = Math.min(Math.max(r.left - wr.left + r.width / 2, 80), Math.max(80, wr.width - 80))
    setActive({ cell, x, y: r.top - wr.top })
  }

  // The card is dismissed by tapping anywhere that isn't a day, or by scrolling.
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('.heatmap-cell')) setActive(null)
    }
    const el = scroller.current
    const onScroll = () => setActive(null)
    document.addEventListener('pointerdown', onDown)
    el?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown)
      el?.removeEventListener('scroll', onScroll)
    }
  }, [active])

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

  return (
    <div className="heatmap-wrap" ref={wrap}>
      <div className="heatmap-scroll" ref={scroller}>
        <div className="heatmap">
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
                    onClick={(e) => show(cell, e.currentTarget)}
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

      {active && (
        // Floats above the tapped day, where a thumb on the day never covers it.
        <div className="heatmap-popup" role="status" style={{ left: active.x, top: active.y }}>
          <div className="heatmap-popup-date">{new Date(active.cell.day).toDateString()}</div>
          <div className="mono">
            {active.cell.workouts === 0
              ? 'Rest day'
              : `${formatValue(active.cell.value)} in ${active.cell.workouts} workout${active.cell.workouts > 1 ? 's' : ''}`}
          </div>
        </div>
      )}

      <div className="heatmap-foot">
        <span className="faint">Less</span>
        <div className="heatmap-legend">
          <span className="heatmap-cell" style={{ background: 'var(--heat-0)' }} />
          {RAMP.map((c) => (
            <span key={c} className="heatmap-cell" style={{ background: c }} />
          ))}
        </div>
        <span className="faint">More</span>
      </div>
    </div>
  )
}
