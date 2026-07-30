import { useState } from 'react'
import { useElementWidth } from './useElementWidth'
import { compactNumber, makeScale, niceTicks } from './scales'

export interface LinePoint {
  date: number
  value: number
}

interface Props {
  points: LinePoint[]
  formatValue: (v: number) => string
  formatDate: (ts: number) => string
  height?: number
  /**
   * 'zero' anchors the axis at zero, keeping the line's height proportional —
   * right for quantities like load or volume.
   * 'auto' frames the data's own range, for levels that never approach zero
   * (bodyweight, circumferences) where a zero baseline flattens the trend into
   * a straight line. 'auto' drops the area fill, which only means anything when
   * measured from zero.
   */
  baseline?: 'zero' | 'auto'
}

const PAD = { top: 14, right: 16, bottom: 26, left: 44 }

/**
 * Single-series time line. No legend by design — one series means the card
 * title already says what is plotted.
 */
export function LineChart({
  points,
  formatValue,
  formatDate,
  height = 168,
  baseline = 'zero',
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom

  const values = points.map((p) => p.value)
  const maxV = Math.max(...values, 0)
  const minV = Math.min(...values)
  // Breathing room so the line never sits flush against the top or bottom rule.
  const spread = maxV - minV
  const margin = spread > 0 ? spread * 0.15 : Math.max(maxV * 0.05, 1)
  const ticks =
    baseline === 'zero'
      ? niceTicks(0, maxV, 4)
      : niceTicks(Math.max(0, minV - margin), maxV + margin, 4)
  const domainMin = baseline === 'zero' ? 0 : ticks[0]
  const domainMax = ticks[ticks.length - 1]

  const x = makeScale(0, Math.max(1, points.length - 1), PAD.left, PAD.left + plotW)
  const y = makeScale(domainMin, domainMax, PAD.top + plotH, PAD.top)

  const coords = points.map((p, i) => ({ px: x(i), py: y(p.value), ...p }))
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px.toFixed(1)},${c.py.toFixed(1)}`).join(' ')
  const area =
    baseline === 'zero' && coords.length > 1
      ? `${line} L${coords[coords.length - 1].px.toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${coords[0].px.toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`
      : ''

  const last = coords[coords.length - 1]
  const shown = active !== null ? coords[active] : undefined

  function pick(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect()
    const local = clientX - rect.left
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < coords.length; i++) {
      const d = Math.abs(coords[i].px - local)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    setActive(best)
  }

  return (
    <div className="chart-plot" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Line chart, ${points.length} points, latest ${formatValue(last.value)}`}
          tabIndex={0}
          className="chart-svg"
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerMove={(e) => {
            if (e.buttons > 0 || e.pointerType === 'mouse') pick(e.clientX, e.currentTarget)
          }}
          onPointerLeave={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              setActive((a) => Math.min(coords.length - 1, (a ?? -1) + 1))
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              setActive((a) => Math.max(0, (a ?? coords.length) - 1))
            } else if (e.key === 'Escape') {
              setActive(null)
            }
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(t)}
                y2={y(t)}
                className={t === domainMin ? 'chart-baseline' : 'chart-grid'}
              />
              <text x={PAD.left - 8} y={y(t) + 4} className="chart-tick" textAnchor="end">
                {compactNumber(t)}
              </text>
            </g>
          ))}

          {area && <path d={area} className="chart-area" />}
          {coords.length > 1 && <path d={line} className="chart-line" />}

          {/* Crosshair for the inspected point. */}
          {shown && (
            <line
              x1={shown.px}
              x2={shown.px}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="chart-crosshair"
            />
          )}

          {/* End marker carries a surface ring so it stays legible over the line. */}
          <circle cx={last.px} cy={last.py} r={5} className="chart-dot" />
          {shown && shown !== last && (
            <circle cx={shown.px} cy={shown.py} r={5} className="chart-dot" />
          )}

          {/* Only the endpoint is directly labelled; the axis and tooltip carry the rest. */}
          {!shown && (
            <text
              x={Math.min(last.px + 8, PAD.left + plotW)}
              y={Math.max(last.py - 9, PAD.top + 8)}
              className="chart-endlabel"
              textAnchor={last.px > PAD.left + plotW - 48 ? 'end' : 'start'}
            >
              {formatValue(last.value)}
            </text>
          )}

          <text x={PAD.left} y={height - 8} className="chart-tick" textAnchor="start">
            {formatDate(points[0].date)}
          </text>
          {points.length > 1 && (
            <text x={PAD.left + plotW} y={height - 8} className="chart-tick" textAnchor="end">
              {formatDate(last.date)}
            </text>
          )}
        </svg>
      )}

      {shown && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(Math.max(shown.px, 60), Math.max(60, width - 60)),
            top: PAD.top,
          }}
        >
          <span className="chart-tooltip-value">{formatValue(shown.value)}</span>
          <span className="chart-tooltip-date">{formatDate(shown.date)}</span>
        </div>
      )}
    </div>
  )
}
