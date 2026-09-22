import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise, Workout } from '../db/types'
import { Header } from '../components/Header'
import { ChartCard } from '../components/charts/ChartCard'
import { ColumnChart } from '../components/charts/ColumnChart'
import { Heatmap } from '../components/charts/Heatmap'
import { BarList } from '../components/charts/BarList'
import { useFormatters } from '../lib/useSettings'
import { computeStreaks, muscleDistribution, overallTotals, volumeByDay, volumeByWeek } from '../lib/stats'
import { formatHoursTotal } from '../lib/time'
import { IconChart } from '../components/Icons'

export function StatsPage() {
  const navigate = useNavigate()
  const fmt = useFormatters()

  const workouts = useLiveQuery(
    () => db.workouts.where('status').equals('done').toArray(),
    [],
    [] as Workout[],
  )
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  const firstDay = fmt.settings.firstDayOfWeek
  const totals = useMemo(() => overallTotals(workouts), [workouts])
  const streaks = useMemo(() => computeStreaks(workouts, firstDay), [workouts, firstDay])
  const weeks = useMemo(() => volumeByWeek(workouts, firstDay, 12), [workouts, firstDay])
  const days = useMemo(() => volumeByDay(workouts, 119), [workouts])
  const muscles = useMemo(
    () =>
      muscleDistribution(workouts, byId, fmt.settings.bodyweightKg, fmt.settings.countWarmupSets),
    [workouts, byId, fmt.settings.bodyweightKg, fmt.settings.countWarmupSets],
  )

  if (workouts.length === 0) {
    return (
      <>
        <Header title="Stats" />
        <div className="page">
          <div className="empty">
            <div className="empty-icon">
              <IconChart />
            </div>
            <h3>No stats yet</h3>
            <p className="muted">
              Finish a workout and your training history, streaks and muscle balance appear here.
            </p>
          </div>

          {/* Measurements track independently of logged workouts, so a brand-new
              user still needs a way to reach them from an otherwise-empty page. */}
          <button
            className="card card-tappable"
            style={{ textAlign: 'left' }}
            onClick={() => navigate('/measurements')}
          >
            <span style={{ fontWeight: 650 }}>Measurements</span>
            <p className="faint" style={{ marginTop: 4 }}>
              Track bodyweight and circumferences over time, even before your first workout.
            </p>
          </button>
        </div>
      </>
    )
  }

  const weekLabel = (weekStart: number) =>
    new Date(weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  return (
    <>
      <Header title="Stats" />

      <div className="page">
        {/* The one number the screen leads with: proportional figures, not tabular. */}
        <div className="hero">
          <span className="hero-value">{totals.workouts}</span>
          <span className="hero-label">
            workout{totals.workouts === 1 ? '' : 's'} logged
          </span>
        </div>

        {/* Three headline figures, then the smaller counts. Volume is abbreviated
            because an all-time total runs to seven digits; the exact number stays
            reachable on hover and in every table view. */}
        <div className="headline-card">
          <div className="headline">
            <div className="headline-value" title={`${fmt.volume(totals.volumeKg)} ${fmt.weightUnit}`}>
              {fmt.volumeCompact(totals.volumeKg)}
              <span className="headline-unit">{fmt.weightUnit}</span>
            </div>
            <div className="stat-label">Volume lifted</div>
          </div>
          <div className="headline">
            <div className="headline-value">{formatHoursTotal(totals.durationSec)}</div>
            <div className="stat-label">Time lifting</div>
          </div>
          <div className="headline">
            <div className="headline-value">
              {streaks.currentWeeks}
              <span className="headline-unit">wk</span>
            </div>
            <div className="stat-label">Week streak</div>
          </div>
        </div>

        <div className="stat-grid" style={{ marginTop: 10 }}>
          <div className="stat">
            <div className="stat-value">{streaks.longestWeeks}</div>
            <div className="stat-label">Best streak</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totals.sets.toLocaleString()}</div>
            <div className="stat-label">Sets</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totals.reps.toLocaleString()}</div>
            <div className="stat-label">Reps</div>
          </div>
        </div>

        <div className="section-title">Body</div>
        <button
          className="card card-tappable"
          style={{ textAlign: 'left' }}
          onClick={() => navigate('/measurements')}
        >
          <span style={{ fontWeight: 650 }}>Measurements</span>
          <p className="faint" style={{ marginTop: 4 }}>
            Bodyweight and circumferences — log an entry or see the trend.
          </p>
        </button>

        <div className="section-title">Training</div>

        <ChartCard
          title="Activity"
          subtitle="Last 17 weeks — brighter means more volume"
          table={{
            columns: [{ header: 'Date' }, { header: 'Workouts', numeric: true }, { header: `Volume (${fmt.weightUnit})`, numeric: true }],
            rows: days
              .filter((d) => d.workouts > 0)
              .reverse()
              .map((d) => [
                new Date(d.day).toLocaleDateString(),
                d.workouts,
                fmt.volume(d.volumeKg),
              ]),
          }}
        >
          <Heatmap
            cells={days.map((d) => ({ day: d.day, value: d.volumeKg, workouts: d.workouts }))}
            firstDayOfWeek={firstDay}
            formatValue={(v) => `${fmt.volume(v)} ${fmt.weightUnit}`}
          />
        </ChartCard>

        <ChartCard
          title="Weekly volume"
          subtitle="Total weight moved per week"
          table={{
            columns: [
              { header: 'Week of' },
              { header: 'Workouts', numeric: true },
              { header: 'Sets', numeric: true },
              { header: `Volume (${fmt.weightUnit})`, numeric: true },
            ],
            rows: [...weeks]
              .reverse()
              .map((w) => [weekLabel(w.weekStart), w.workouts, w.sets, fmt.volume(w.volumeKg)]),
          }}
        >
          <ColumnChart
            columns={weeks.map((w) => ({
              label: weekLabel(w.weekStart),
              tooltipLabel: `Week of ${weekLabel(w.weekStart)} · ${w.workouts} workout${w.workouts === 1 ? '' : 's'}`,
              value: w.volumeKg,
            }))}
            formatValue={(v) => `${fmt.volume(v)} ${fmt.weightUnit}`}
          />
        </ChartCard>

        <ChartCard
          title="Muscle balance"
          subtitle="Working sets by primary muscle group, all time"
          table={{
            columns: [
              { header: 'Muscle' },
              { header: 'Sets', numeric: true },
              { header: `Volume (${fmt.weightUnit})`, numeric: true },
            ],
            rows: muscles.map((m) => [m.muscle, m.sets, fmt.volume(m.volumeKg)]),
          }}
          empty="No completed working sets yet."
        >
          {/* Set counts only: adding volume beside every bar crowds the track,
              and the table view carries it. */}
          <BarList
            items={muscles.map((m) => ({ label: m.muscle, value: m.sets }))}
            formatValue={(v) => String(v)}
          />
        </ChartCard>

        <p className="faint" style={{ marginTop: 14 }}>
          Warm-up sets are {fmt.settings.countWarmupSets ? 'included in' : 'excluded from'} volume
          and set counts. Sets are attributed to each exercise's primary muscle group.
        </p>
      </div>
    </>
  )
}
