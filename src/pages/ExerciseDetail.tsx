import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Header } from '../components/Header'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { ExerciseFormSheet } from '../components/ExerciseForm'
import { useFormatters } from '../lib/useSettings'
import { getExerciseHistory } from '../lib/history'
import { describeSet, estimate1RM, setBadges } from '../lib/workout'
import { formatDateLabel } from '../lib/time'
import { IconMore, IconTrash } from '../components/Icons'
import { ChartCard } from '../components/charts/ChartCard'
import { LineChart } from '../components/charts/LineChart'
import {
  exerciseProgress,
  metricsFor,
  PROGRESS_METRIC_LABEL,
  TIME_RANGES,
  withinRange,
  type ProgressMetric,
  type TimeRangeKey,
} from '../lib/stats'

export function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fmt = useFormatters()
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [blockedDelete, setBlockedDelete] = useState(false)
  const [metric, setMetric] = useState<ProgressMetric | null>(null)
  const [range, setRange] = useState<TimeRangeKey>('6m')

  const exercise = useLiveQuery(async () => (id ? ((await db.exercises.get(id)) ?? null) : null), [id])
  const history = useLiveQuery(async () => (id ? await getExerciseHistory(id) : []), [id], [])

  const records = useMemo(() => {
    let heaviestKg = 0
    let best1RM = 0
    let bestSetVolume = 0
    let bestReps = 0
    let bestDuration = 0
    let bestDistance = 0
    let totalSets = 0
    for (const { logged } of history) {
      for (const s of logged.sets) {
        if (!s.completed) continue
        totalSets += 1
        if (s.weight && s.weight > heaviestKg) heaviestKg = s.weight
        if (s.reps && s.reps > bestReps) bestReps = s.reps
        if (s.durationSec && s.durationSec > bestDuration) bestDuration = s.durationSec
        if (s.distanceM && s.distanceM > bestDistance) bestDistance = s.distanceM
        if (s.weight && s.reps) {
          best1RM = Math.max(best1RM, estimate1RM(s.weight, s.reps))
          bestSetVolume = Math.max(bestSetVolume, s.weight * s.reps)
        }
      }
    }
    return { heaviestKg, best1RM, bestSetVolume, bestReps, bestDuration, bestDistance, totalSets }
  }, [history])

  const availableMetrics = useMemo(
    () => (exercise ? metricsFor(exercise.kind) : []),
    [exercise],
  )
  const activeMetric: ProgressMetric = metric ?? availableMetrics[0] ?? 'heaviest'

  const points = useMemo(() => {
    if (!exercise) return []
    const all = exerciseProgress(history, exercise, activeMetric, fmt.settings.bodyweightKg)
    return withinRange(all, range)
  }, [exercise, history, activeMetric, range, fmt.settings.bodyweightKg])

  /** Formats a plotted value in the units the active metric is measured in. */
  const formatMetric = (v: number): string => {
    switch (activeMetric) {
      case 'heaviest':
      case 'oneRm':
        return `${fmt.weight(v)} ${fmt.weightUnit}`
      case 'volume':
        return `${fmt.volume(v)} ${fmt.weightUnit}`
      case 'duration':
        return fmt.duration(v)
      case 'distance':
        return `${fmt.distance(v)} ${fmt.distanceUnit}`
      case 'reps':
        return `${Math.round(v)} reps`
    }
  }

  if (exercise === undefined) return <div className="spinner" />
  if (exercise === null) {
    return (
      <>
        <Header title="Exercise" back={true} />
        <div className="page">
          <div className="empty">
            <h3>Exercise not found</h3>
          </div>
        </div>
      </>
    )
  }

  async function remove() {
    // Deleting an exercise that appears in history would leave dangling
    // references, so those get archived instead of removed.
    if (history.length > 0) {
      await db.exercises.put({ ...exercise!, archived: true })
    } else {
      await db.exercises.delete(exercise!.id)
    }
    setConfirmDelete(false)
    navigate('/exercises', { replace: true })
  }

  return (
    <>
      <Header
        title={exercise.name}
        back={true}
        right={
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Exercise options">
            <IconMore />
          </button>
        }
      />

      <div className="page">
        <p className="muted">
          {exercise.muscleGroup} · {exercise.equipment}
          {exercise.isCustom ? ' · Custom' : ''}
        </p>

        {exercise.notes ? (
          <div className="card" style={{ marginTop: 12 }}>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {exercise.notes}
            </p>
          </div>
        ) : null}

        <div className="section-title">Personal records</div>
        {records.totalSets === 0 ? (
          <p className="muted">Log this exercise once and your records appear here.</p>
        ) : (
          <div className="stat-grid">
            {records.heaviestKg > 0 && (
              <div className="stat">
                <div className="stat-value mono">{fmt.weight(records.heaviestKg)}</div>
                <div className="stat-label">Heaviest {fmt.weightUnit}</div>
              </div>
            )}
            {records.best1RM > 0 && (
              <div className="stat">
                {/* An estimate, so one decimal — 134.17 kg implies precision it lacks. */}
                <div className="stat-value">{fmt.weight(Math.round(records.best1RM * 10) / 10)}</div>
                <div className="stat-label">Est. 1RM</div>
              </div>
            )}
            {records.bestSetVolume > 0 && (
              <div className="stat">
                <div className="stat-value mono">{fmt.volume(records.bestSetVolume)}</div>
                <div className="stat-label">Best set vol.</div>
              </div>
            )}
            {records.bestReps > 0 && (
              <div className="stat">
                <div className="stat-value mono">{records.bestReps}</div>
                <div className="stat-label">Most reps</div>
              </div>
            )}
            {records.bestDuration > 0 && (
              <div className="stat">
                <div className="stat-value mono">{fmt.duration(records.bestDuration)}</div>
                <div className="stat-label">Longest</div>
              </div>
            )}
            {records.bestDistance > 0 && (
              <div className="stat">
                <div className="stat-value mono">{fmt.distance(records.bestDistance)}</div>
                <div className="stat-label">Furthest {fmt.distanceUnit}</div>
              </div>
            )}
            <div className="stat">
              <div className="stat-value mono">{records.totalSets}</div>
              <div className="stat-label">Total sets</div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <>
            <div className="section-title">Progress</div>
            <ChartCard
              title={PROGRESS_METRIC_LABEL[activeMetric]}
              subtitle="One point per session, warm-ups excluded"
              controls={
                <>
                  {availableMetrics.length > 1 &&
                    availableMetrics.map((m) => (
                      <button
                        key={m}
                        className={`chip${activeMetric === m ? ' active' : ''}`}
                        onClick={() => setMetric(m)}
                      >
                        {PROGRESS_METRIC_LABEL[m]}
                      </button>
                    ))}
                  <span style={{ flex: 1, minWidth: 4 }} />
                  {TIME_RANGES.map((r) => (
                    <button
                      key={r.key}
                      className={`chip${range === r.key ? ' active' : ''}`}
                      onClick={() => setRange(r.key)}
                    >
                      {r.label}
                    </button>
                  ))}
                </>
              }
              table={{
                columns: [
                  { header: 'Date' },
                  { header: PROGRESS_METRIC_LABEL[activeMetric], numeric: true },
                ],
                rows: [...points]
                  .reverse()
                  .map((p) => [new Date(p.date).toLocaleDateString(), formatMetric(p.value)]),
              }}
              empty="No sessions in this range."
            >
              <LineChart
                points={points}
                formatValue={formatMetric}
                formatDate={(ts) =>
                  new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                }
              />
            </ChartCard>
          </>
        )}

        <div className="section-title">History</div>
        {history.length === 0 ? (
          <p className="muted">No sessions logged yet.</p>
        ) : (
          history.map(({ workout, logged }) => {
            const badges = setBadges(logged.sets)
            return (
              <div className="card" key={`${workout.id}-${logged.id}`}>
                <button
                  className="row-between"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => navigate(`/history/${workout.id}`)}
                >
                  <span style={{ fontWeight: 650 }} className="truncate">
                    {workout.name}
                  </span>
                  <span className="faint">{formatDateLabel(workout.startedAt)}</span>
                </button>
                <div style={{ marginTop: 8 }}>
                  {logged.sets.map((s, i) => (
                    <div className="row" key={s.id} style={{ padding: '3px 0', gap: 10 }}>
                      <span className={`set-badge ${s.setType}`} style={{ margin: 0 }}>
                        {badges[i]}
                      </span>
                      <span className="mono muted">
                        {describeSet(s, exercise.kind, {
                          weight: (kg) => `${fmt.weight(kg)} ${fmt.weightUnit}`,
                          distance: (m) => `${fmt.distance(m)} ${fmt.distanceUnit}`,
                          duration: fmt.duration,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      <Sheet open={menu} title={exercise.name} onClose={() => setMenu(false)}>
        <button
          className="sheet-list-item"
          onClick={() => {
            setMenu(false)
            setEditing(true)
          }}
        >
          <span className="grow">Edit exercise</span>
        </button>
        <button
          className="sheet-list-item danger"
          onClick={() => {
            setMenu(false)
            if (exercise.isCustom) setConfirmDelete(true)
            else setBlockedDelete(true)
          }}
        >
          <IconTrash />
          <span className="grow">Delete exercise</span>
        </button>
      </Sheet>

      <ExerciseFormSheet open={editing} exercise={exercise} onClose={() => setEditing(false)} />

      <ConfirmSheet
        open={confirmDelete}
        title={history.length > 0 ? 'Hide this exercise?' : 'Delete this exercise?'}
        message={
          history.length > 0
            ? 'It appears in your history, so it will be hidden from lists rather than deleted — your past workouts stay intact.'
            : 'This custom exercise will be removed.'
        }
        confirmLabel={history.length > 0 ? 'Hide' : 'Delete'}
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmSheet
        open={blockedDelete}
        title="Built-in exercise"
        message="Built-in exercises cannot be deleted. You can edit its details, or create your own version instead."
        confirmLabel="Edit instead"
        onConfirm={() => {
          setBlockedDelete(false)
          setEditing(true)
        }}
        onCancel={() => setBlockedDelete(false)}
      />
    </>
  )
}
