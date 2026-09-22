import { ColumnChart, type Column } from '../charts/ColumnChart'
import type { VolumeMomentum } from '../../lib/home'
import type { WeekPoint } from '../../lib/stats'
import type { Formatters } from '../../lib/useSettings'

interface Props {
  momentum: VolumeMomentum
  /** The recent buckets, oldest first — the same ones `volumeMomentum` totals. */
  weeks: WeekPoint[]
  fmt: Formatters
}

/**
 * Six weeks of volume against the six before them.
 *
 * A fall is rendered in dim text rather than in --danger: deloads, illness and
 * travel all produce lighter weeks, and colouring those red would turn an
 * honest record of training into an accusation.
 */
export function MomentumCard({ momentum, weeks, fmt }: Props) {
  const { deltaPct, recentKg } = momentum
  const rounded = deltaPct === null ? null : Math.round(deltaPct)
  const tone = rounded === null || rounded === 0 ? 'flat' : rounded > 0 ? 'up' : 'down'

  const columns: Column[] = weeks.map((w) => ({
    label: weekLabel(w.weekStart),
    value: w.volumeKg,
    tooltipLabel: `Week of ${weekLabel(w.weekStart)}`,
  }))

  return (
    <section className="card home-block">
      <div className="row-between">
        <div className="stack">
          {rounded === null ? (
            <>
              <span className="home-delta flat">
                {fmt.volumeCompact(recentKg)} {fmt.weightUnit}
              </span>
              <span className="faint">lifted in the last 6 weeks</span>
            </>
          ) : (
            <>
              <span className={`home-delta ${tone}`}>
                {rounded > 0 ? '+' : ''}
                {rounded}%
              </span>
              <span className="faint">vs the previous 6 weeks</span>
            </>
          )}
        </div>
        {rounded !== null && (
          <span className="muted mono">
            {fmt.volumeCompact(recentKg)} {fmt.weightUnit}
          </span>
        )}
      </div>

      <ColumnChart
        columns={columns}
        formatValue={(v) => `${fmt.volumeCompact(v)} ${fmt.weightUnit}`}
        height={112}
      />
    </section>
  )
}

function weekLabel(weekStart: number): string {
  return new Date(weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
