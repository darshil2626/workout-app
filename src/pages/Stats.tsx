import { useMemo, useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise, Measurement, Workout } from '../db/types'
import { Header } from '../components/Header'
import { ChartCard } from '../components/charts/ChartCard'
import { ColumnChart } from '../components/charts/ColumnChart'
import { Heatmap } from '../components/charts/Heatmap'
import { LineChart } from '../components/charts/LineChart'
import { useFormatters } from '../lib/useSettings'
import {
  computeStreaks,
  muscleDistribution,
  overallTotals,
  volumeByDay,
  volumeByWeek,
  type WeekPoint,
} from '../lib/stats'
import { formatMeasurement, specFor, unitLabel } from '../lib/measurements'
import { formatHoursTotal } from '../lib/time'
import { IconChart } from '../components/Icons'

type WeekMetric = 'volume' | 'perSession' | 'sets'

const WEEK_METRIC_LABEL: Record<WeekMetric, string> = {
  volume: 'Total volume',
  perSession: 'Per session',
  sets: 'Sets',
}

/**
 * A raw weekly total goes up simply from training more often — it partly
 * re-plots the activity heatmap above it. Per-session divides that confound
 * out; weeks with no workouts read as zero rather than as a division error.
 */
function weekMetricValue(w: WeekPoint, metric: WeekMetric): number {
  switch (metric) {
    case 'volume':
      return w.volumeKg
    case 'perSession':
      return w.workouts > 0 ? w.volumeKg / w.workouts : 0
    case 'sets':
      return w.sets
  }
}

const WEEK_METRIC_SUBTITLE: Record<WeekMetric, string> = {
  volume: 'Total weight moved per week',
  perSession: 'Volume divided by that week’s workout count, so training more often doesn’t by itself push the line up',
  sets: 'Working sets logged per week',
}

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

  const bodyweightRows = useLiveQuery(
    () => db.measurements.where('type').equals('bodyweight').toArray(),
    [],
    [] as Measurement[],
  )
  // Charts read left-to-right in time; the delta wants newest-first, so both
  // directions are taken from the one sorted array rather than sorting twice.
  const bodyweightEntries = useMemo(
    () => [...bodyweightRows].sort((a, b) => a.takenAt - b.takenAt),
    [bodyweightRows],
  )
  const latestWeight = bodyweightEntries[bodyweightEntries.length - 1]
  const previousWeight = bodyweightEntries[bodyweightEntries.length - 2]
  // Absent rather than zero: a single entry has nothing to compare against, and
  // "+0" would read as a real, measured lack of change.
  const weightDelta =
    latestWeight && previousWeight ? latestWeight.value - previousWeight.value : null
  const weightSpec = specFor('bodyweight')

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
  const muscleMax = useMemo(() => Math.max(...muscles.map((m) => m.sets), 1), [muscles])

  const [weekMetric, setWeekMetric] = useState<WeekMetric>('volume')

  const activityRef = useRef<HTMLDivElement>(null)
  const weeklyRef = useRef<HTMLDivElement>(null)

  function scrollToChart(ref: RefObject<HTMLDivElement | null>) {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  /**
   * The Measurements card doubles as a bodyweight preview once there is
   * something to preview. A brand-new user — or one who hasn't weighed in —
   * still gets a plain link rather than an empty chart.
   */
  function measurementsCard() {
    if (bodyweightEntries.length === 0) {
      return (
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
      )
    }
    const unit = unitLabel(weightSpec.kind, fmt.settings)
    return (
      <button
        className="card card-tappable"
        style={{ textAlign: 'left', width: '100%' }}
        onClick={() => navigate('/measurements')}
      >
        <div className="row-between">
          <div className="stack">
            <span style={{ fontWeight: 650 }}>Measurements</span>
            <span className="faint">
              {formatMeasurement(latestWeight.value, weightSpec.kind, fmt.settings)} {unit}
              {weightDelta !== null && weightDelta !== 0
                ? ` · ${weightDelta > 0 ? '+' : '−'}${formatMeasurement(Math.abs(weightDelta), weightSpec.kind, fmt.settings)} since last`
                : ''}
            </span>
          </div>
        </div>
        <div className="measurement-preview">
          <LineChart
            points={bodyweightEntries.map((e) => ({ date: e.takenAt, value: e.value }))}
            // Bodyweight never nears zero, so a zero baseline would flatten a
            // real trend into a near-straight line, same as on the full page.
            baseline="auto"
            xAxis="time"
            height={84}
            formatValue={(v) => `${formatMeasurement(v, weightSpec.kind, fmt.settings)} ${unit}`}
            formatDate={(ts) => new Date(ts).toLocaleDateString()}
          />
        </div>
      </button>
    )
  }

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
          {measurementsCard()}
        </div>
      </>
    )
  }

  const weekLabel = (weekStart: number) =>
    new Date(weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  const weekFormat = (v: number): string =>
    weekMetric === 'sets' ? Math.round(v).toLocaleString() : `${fmt.volume(v)} ${fmt.weightUnit}`

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
            reachable on hover and in every table view. Each tile also doubles as
            a shortcut to the chart it summarises. */}
        <div className="headline-card">
          <button className="headline" onClick={() => scrollToChart(weeklyRef)}>
            <div className="headline-value" title={`${fmt.volume(totals.volumeKg)} ${fmt.weightUnit}`}>
              {fmt.volumeCompact(totals.volumeKg)}
              <span className="headline-unit">{fmt.weightUnit}</span>
            </div>
            <div className="stat-label">Volume lifted</div>
          </button>
          <button className="headline" onClick={() => scrollToChart(activityRef)}>
            <div className="headline-value">{formatHoursTotal(totals.durationSec)}</div>
            <div className="stat-label">Time lifting</div>
          </button>
          <button className="headline" onClick={() => scrollToChart(activityRef)}>
            <div className="headline-value">
              {streaks.currentWeeks}
              <span className="headline-unit">wk</span>
            </div>
            <div className="stat-label">Week streak</div>
          </button>
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
        {measurementsCard()}

        <div className="section-title">Training</div>

        <div ref={activityRef} className="chart-anchor">
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
        </div>

        <div ref={weeklyRef} className="chart-anchor">
          <ChartCard
            title="Weekly volume"
            subtitle={WEEK_METRIC_SUBTITLE[weekMetric]}
            controls={(['volume', 'perSession', 'sets'] as WeekMetric[]).map((m) => (
              <button
                key={m}
                className={`chip${weekMetric === m ? ' active' : ''}`}
                onClick={() => setWeekMetric(m)}
              >
                {WEEK_METRIC_LABEL[m]}
              </button>
            ))}
            table={{
              columns: [
                { header: 'Week of' },
                { header: 'Workouts', numeric: true },
                { header: 'Sets', numeric: true },
                { header: `Volume (${fmt.weightUnit})`, numeric: true },
                { header: `Per session (${fmt.weightUnit})`, numeric: true },
              ],
              rows: [...weeks]
                .reverse()
                .map((w) => [
                  weekLabel(w.weekStart),
                  w.workouts,
                  w.sets,
                  fmt.volume(w.volumeKg),
                  w.workouts > 0 ? fmt.volume(w.volumeKg / w.workouts) : '—',
                ]),
            }}
          >
            <ColumnChart
              columns={weeks.map((w) => ({
                label: weekLabel(w.weekStart),
                tooltipLabel: `Week of ${weekLabel(w.weekStart)} · ${w.workouts} workout${w.workouts === 1 ? '' : 's'}`,
                value: weekMetricValue(w, weekMetric),
              }))}
              formatValue={weekFormat}
            />
          </ChartCard>
        </div>

        <ChartCard
          title="Muscle balance"
          subtitle="Working sets by primary muscle group, all time — tap a muscle to see its exercises"
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
          {/* Reimplements BarList's markup rather than making the bars tappable
              there: every other BarList in the app is a plain chart, and this is
              the one place a bar is also a link to `/exercises`. Set counts only,
              same as BarList — volume beside every bar would crowd the track,
              and the table view carries it. One hue for every bar, per BarList's
              own reasoning: the categories have no natural order, so shading by
              size would double-encode the length the bar already shows. */}
          <div className="bar-list">
            {muscles.map((m) => (
              <button
                key={m.muscle}
                className="bar-row tappable"
                onClick={() => navigate(`/exercises?muscle=${encodeURIComponent(m.muscle)}`)}
                aria-label={`${m.muscle}: ${m.sets} set${m.sets === 1 ? '' : 's'} — view exercises`}
              >
                <span className="bar-label truncate">{m.muscle}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${Math.max((m.sets / muscleMax) * 100, 1.5)}%` }}
                  />
                </div>
                <span className="bar-value mono">
                  {m.sets}
                  <span className="bar-chevron" aria-hidden="true">
                    {'›'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </ChartCard>

        <p className="faint" style={{ marginTop: 14 }}>
          Warm-up sets are {fmt.settings.countWarmupSets ? 'included in' : 'excluded from'} volume
          and set counts. Sets are attributed to each exercise's primary muscle group.
        </p>
      </div>
    </>
  )
}
