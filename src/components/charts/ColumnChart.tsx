import { useState } from 'react'
import { useElementWidth } from './useElementWidth'
import { compactNumber, makeScale, niceTicks } from './scales'

export interface Column {
  label: string
  value: number
  /** Longer label used in the tooltip, e.g. a full date range. */
  tooltipLabel?: string
}

interface Props {
  columns: Column[]
  formatValue: (v: number) => string
  height?: number
}

const PAD = { top: 14, right: 8, bottom: 26, left: 44 }
const MAX_BAR = 24
const GAP = 2

/** Columns for a discrete ordered series (weeks). One hue, one series. */
export function ColumnChart({ columns, formatValue, height = 168 }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const ticks = niceTicks(0, Math.max(...columns.map((c) => c.value), 0), 4)
  const domainMax = ticks[ticks.length - 1]
  const y = makeScale(0, domainMax, PAD.top + plotH, PAD.top)

  const band = columns.length > 0 ? plotW / columns.length : 0
  // Cap the bar and leave the band's remainder as air rather than filling it.
  const barW = Math.max(3, Math.min(MAX_BAR, band - GAP))

  return (
    <div className="chart-plot" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Column chart, ${columns.length} periods`}
          className="chart-svg"
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? 'chart-baseline' : 'chart-grid'}
              />
              <text x={PAD.left - 8} y={y(t) + 4} className="chart-tick" textAnchor="end">
                {compactNumber(t)}
              </text>
            </g>
          ))}

          {columns.map((c, i) => {
            const cx = PAD.left + band * i + band / 2
            const top = y(c.value)
            const h = PAD.top + plotH - top
            return (
              <g key={i}>
                {/* Hit area spans the whole band so touch targets stay large. */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onPointerDown={() => setActive(i)}
                  onPointerEnter={() => setActive(i)}
                />
                {c.value > 0 && (
                  <rect
                    x={cx - barW / 2}
                    y={top}
                    width={barW}
                    height={Math.max(h, 2)}
                    rx={4}
                    className={active === i ? 'chart-bar active' : 'chart-bar'}
                    pointerEvents="none"
                  />
                )}
              </g>
            )
          })}

          {/* Label only the first and last period; the tooltip covers the rest. */}
          <text x={PAD.left} y={height - 8} className="chart-tick" textAnchor="start">
            {columns[0]?.label}
          </text>
          {columns.length > 1 && (
            <text x={PAD.left + plotW} y={height - 8} className="chart-tick" textAnchor="end">
              {columns[columns.length - 1].label}
            </text>
          )}
        </svg>
      )}

      {active !== null && columns[active] && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(Math.max(PAD.left + band * active + band / 2, 60), Math.max(60, width - 60)),
            top: PAD.top,
          }}
        >
          <span className="chart-tooltip-value">{formatValue(columns[active].value)}</span>
          <span className="chart-tooltip-date">
            {columns[active].tooltipLabel ?? columns[active].label}
          </span>
        </div>
      )}
    </div>
  )
}
