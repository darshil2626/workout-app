import type { DayPoint, Streaks } from '../../lib/stats'
import type { Formatters } from '../../lib/useSettings'
import { Heatmap, syntheticHeatCells } from '../charts/Heatmap'

interface Props {
  /** `volumeByDay`'s output, oldest first. */
  days: DayPoint[]
  streaks: Streaks
  firstDayOfWeek: 0 | 1
  fmt: Formatters
}

/**
 * GitHub-style calendar of recent training days, replacing the home screen's
 * old one-line streak readout ("🔥 3 weeks · best 5").
 *
 * Current and best streak are shown as two distinct stat tiles rather than
 * folded into one sentence: they answer different questions — "am I on a
 * roll right now" versus "what's the record" — and squashing them together
 * made the record read as a footnote to the current run.
 *
 * Rest-day-aware without any new logic: `computeStreaks` already counts a
 * streak in weeks, not days, so a planned rest day inside an otherwise-active
 * week never breaks it — only a whole empty week does. This component only
 * adds the calendar visual on top of that existing rule.
 */
export function ConsistencyCalendar({ days, streaks, firstDayOfWeek, fmt }: Props) {
  const hasRecentActivity = days.some((d) => d.workouts > 0)

  return (
    <section className="home-sect home-appear">
      <div className="section-title">Consistency</div>
      <div className="card">
        <div className="row" style={{ alignItems: 'stretch', gap: 12 }}>
          <div className="consistency-chart">
            {hasRecentActivity ? (
              <Heatmap
                cells={days.map((d) => ({ day: d.day, value: d.volumeKg, workouts: d.workouts }))}
                firstDayOfWeek={firstDayOfWeek}
                formatValue={(v) => `${fmt.volume(v)} ${fmt.weightUnit}`}
              />
            ) : (
              <div className="chart-empty">
                <div className="chart-empty-preview" aria-hidden="true">
                  <Heatmap
                    cells={syntheticHeatCells(days.length)}
                    firstDayOfWeek={firstDayOfWeek}
                    formatValue={() => ''}
                  />
                </div>
                <p className="muted">Train a few days and your calendar fills in here.</p>
              </div>
            )}
          </div>

          <div className="consistency-streaks">
            <div className="stat">
              <div className="stat-value">{streaks.currentWeeks}</div>
              <div className="stat-label">Current streak</div>
            </div>
            <div className="stat">
              <div className="stat-value">{streaks.longestWeeks}</div>
              <div className="stat-label">Best streak</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
