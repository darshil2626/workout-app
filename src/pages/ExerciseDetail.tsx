import { useMemo, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from '../lib/navigate'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Header } from '../components/Header'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { ExerciseFormSheet } from '../components/ExerciseForm'
import { ExercisePicker } from '../components/ExercisePicker'
import { MuscleTargets } from '../components/MuscleTargets'
import { useFormatters, type Formatters } from '../lib/useSettings'
import { getExerciseHistory } from '../lib/history'
import { countsTowardVolume, describeSet, setBadges } from '../lib/workout'
import {
  loadSetRecords,
  PR_LABEL,
  recordsFromHistory,
  relevantKinds,
  type ExerciseRecords,
  type RecordKind,
  type SetRecord,
} from '../lib/records'

/**
 * Nonzero placeholder for every kind, purely so `recordTile` below returns a
 * tile (and its label) for each record this exercise can set, instead of the
 * null it returns for a genuine zero. Only the labels are used — the values
 * are never rendered.
 */
const PREVIEW_RECORDS: ExerciseRecords = {
  weight: 1,
  oneRm: 1,
  volume: 1,
  sessionVolume: 1,
  reps: 1,
  duration: 1,
  distance: 1,
}
import { formatDateLabel } from '../lib/time'
import { hasActiveWorkout, mergeExercises } from '../lib/exerciseRepair'
import { vibrateError } from '../lib/chime'
import { IconMore, IconTrash } from '../components/Icons'
import { ChartCard } from '../components/charts/ChartCard'
import { LineChart } from '../components/charts/LineChart'
import {
  exerciseProgress,
  metricsFor,
  PROGRESS_METRIC_LABEL,
  PROGRESS_METRIC_SHORT,
  TIME_RANGES,
  withinRange,
  type ProgressMetric,
  type TimeRangeKey,
} from '../lib/stats'

/**
 * One records tile. Returns null when the movement has no value for that kind
 * yet, so a record the user has never set leaves no empty tile behind.
 */
function recordTile(
  kind: RecordKind,
  records: ExerciseRecords,
  fmt: Formatters,
): { value: string; label: string } | null {
  switch (kind) {
    case 'weight':
      return records.weight > 0
        ? { value: fmt.weight(records.weight), label: `Heaviest ${fmt.weightUnit}` }
        : null
    case 'oneRm':
      // An estimate, so one decimal — 134.17 kg implies precision it lacks.
      return records.oneRm > 0
        ? { value: fmt.weight(Math.round(records.oneRm * 10) / 10), label: 'Est. 1RM' }
        : null
    case 'volume':
      return records.volume > 0
        ? { value: fmt.volumeCompact(records.volume), label: 'Best set vol.' }
        : null
    case 'sessionVolume':
      return records.sessionVolume > 0
        ? { value: fmt.volumeCompact(records.sessionVolume), label: 'Best session vol.' }
        : null
    case 'reps':
      return records.reps > 0 ? { value: String(records.reps), label: 'Most reps' } : null
    case 'duration':
      return records.duration > 0
        ? { value: fmt.duration(records.duration), label: 'Longest' }
        : null
    case 'distance':
      return records.distance > 0
        ? { value: fmt.distance(records.distance), label: `Furthest ${fmt.distanceUnit}` }
        : null
  }
}

export function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fmt = useFormatters()
  const [menu, setMenu] = useState(false)
  const [mergePicker, setMergePicker] = useState(false)
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [blockedDelete, setBlockedDelete] = useState(false)
  const [metric, setMetric] = useState<ProgressMetric | null>(null)
  const [range, setRange] = useState<TimeRangeKey>('6m')

  const exercise = useLiveQuery(async () => (id ? ((await db.exercises.get(id)) ?? null) : null), [id])
  const history = useLiveQuery(async () => (id ? await getExerciseHistory(id) : []), [id], [])
  const mergeTarget = useLiveQuery(
    async () => (mergeTargetId ? ((await db.exercises.get(mergeTargetId)) ?? null) : null),
    [mergeTargetId],
  )

  const countWarmups = fmt.settings.countWarmupSets

  // Folded by the same helper the in-workout PR badges use, so the records on
  // this page and the badges during a session can never disagree.
  const records = useMemo(
    () =>
      exercise
        ? recordsFromHistory(history, exercise.kind, fmt.settings.bodyweightKg, countWarmups)
        : null,
    [history, exercise, fmt.settings.bodyweightKg, countWarmups],
  )

  const recordKinds = useMemo(
    () => (exercise ? relevantKinds(exercise.kind) : []),
    [exercise],
  )

  const totalSets = useMemo(
    () =>
      history.reduce(
        (n, { logged }) => n + logged.sets.filter((s) => countsTowardVolume(s, countWarmups)).length,
        0,
      ),
    [history, countWarmups],
  )

  const setRecords = useLiveQuery(
    async () =>
      id && exercise ? await loadSetRecords(id, exercise.kind, countWarmups) : ([] as SetRecord[]),
    [id, exercise?.kind, countWarmups],
    [] as SetRecord[],
  )

  const availableMetrics = useMemo(
    () => (exercise ? metricsFor(exercise.kind) : []),
    [exercise],
  )
  const activeMetric: ProgressMetric = metric ?? availableMetrics[0] ?? 'heaviest'

  const points = useMemo(() => {
    if (!exercise) return []
    const all = exerciseProgress(
      history,
      exercise,
      activeMetric,
      fmt.settings.bodyweightKg,
      countWarmups,
    )
    return withinRange(all, range)
  }, [exercise, history, activeMetric, range, fmt.settings.bodyweightKg, countWarmups])

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

  async function startMerge(ids: string[]) {
    setMergePicker(false)
    if (ids.length === 0) return
    if (await hasActiveWorkout()) {
      setMergeError('Finish or discard the workout in progress first.')
      return
    }
    setMergeTargetId(ids[0])
  }

  async function confirmMerge() {
    const targetId = mergeTargetId
    setMergeTargetId(null)
    if (!targetId || !exercise) return
    try {
      await mergeExercises(exercise.id, targetId)
      navigate(`/exercises/${targetId}`, { replace: true })
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : 'Could not merge those exercises.')
    }
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
        // Paired with the same name on the list row in Exercises.tsx — see
        // the comment there for why setting it unconditionally is safe (this
        // page only ever renders one such span, for the one exercise it's
        // showing, so there is never a duplicate to collide with).
        title={
          <span style={{ viewTransitionName: `exercise-name-${exercise.id}` } as CSSProperties}>
            {exercise.name}
          </span>
        }
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

        {/* Animated illustration retired in favor of the muscle readout below.
            Archived, not deleted: components/ExerciseArt.tsx, db/exerciseArt.ts,
            public/exercise-art/ and scripts/match-exercise-illustrations.mjs are
            all still intact and unreferenced. To bring it back, restore the
            `ExerciseArt` import above and swap it in for `MuscleTargets` here. */}
        <MuscleTargets exercise={exercise} />

        {exercise.notes ? (
          <div className="card" style={{ marginTop: 12 }}>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {exercise.notes}
            </p>
          </div>
        ) : null}

        <div className="section-title">Personal records</div>
        {totalSets === 0 || !records ? (
          <div className="chart-empty">
            <div className="chart-empty-preview" aria-hidden="true">
              <div className="stat-grid">
                {recordKinds.map((kind) => {
                  const tile = recordTile(kind, PREVIEW_RECORDS, fmt)
                  if (!tile) return null
                  return (
                    <div className="stat" key={kind}>
                      <div className="stat-value mono">—</div>
                      <div className="stat-label">{tile.label}</div>
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="muted">Log this exercise once and your records appear here.</p>
          </div>
        ) : (
          <div className="stat-grid">
            {/* Only the records this movement can actually set: a pull-up has no
                heaviest weight, so an empty tile there would read as a gap. */}
            {recordKinds.map((kind) => {
              const tile = recordTile(kind, records, fmt)
              if (!tile) return null
              return (
                <div className="stat" key={kind} title={PR_LABEL[kind]}>
                  <div className="stat-value mono">{tile.value}</div>
                  <div className="stat-label">{tile.label}</div>
                </div>
              )
            })}
            <div className="stat">
              <div className="stat-value mono">{totalSets.toLocaleString()}</div>
              <div className="stat-label">Total sets</div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <>
            <div className="section-title">Progress</div>
            <ChartCard
              title={PROGRESS_METRIC_LABEL[activeMetric]}
              subtitle={`One point per session, warm-ups ${countWarmups ? 'included' : 'excluded'}`}
              controls={
                availableMetrics.length > 1
                  ? availableMetrics.map((m) => (
                      <button
                        key={m}
                        className={`chip${activeMetric === m ? ' active' : ''}`}
                        onClick={() => setMetric(m)}
                      >
                        {PROGRESS_METRIC_SHORT[m]}
                      </button>
                    ))
                  : null
              }
              ranges={TIME_RANGES.map((r) => (
                <button
                  key={r.key}
                  className={`chip${range === r.key ? ' active' : ''}`}
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
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
                xAxis="time"
                formatValue={formatMetric}
                formatDate={(ts) => new Date(ts).toLocaleDateString()}
              />
            </ChartCard>
          </>
        )}

        {setRecords.length > 0 && (
          <>
            <div className="section-title">Set records</div>
            <p className="faint" style={{ marginBottom: 8 }}>
              Heaviest weight lifted at each rep count. These are not personal records and earn no
              badge — together they describe a strength curve that a single 1RM estimate flattens.
            </p>
            <div className="card set-records">
              <table className="chart-table">
                <thead>
                  <tr>
                    <th>Reps</th>
                    <th className="num">{fmt.weightUnit}</th>
                    <th className="num">Achieved</th>
                  </tr>
                </thead>
                <tbody>
                  {setRecords.map((r) => (
                    <tr key={r.reps}>
                      <td>{r.reps}</td>
                      <td className="num">{fmt.weight(r.weightKg)}</td>
                      <td className="num">{formatDateLabel(r.achievedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          className="sheet-list-item"
          onClick={() => {
            setMenu(false)
            setMergePicker(true)
          }}
        >
          <span className="grow">Merge into…</span>
        </button>
        <button
          className="sheet-list-item danger"
          onClick={() => {
            setMenu(false)
            if (exercise.isCustom) {
              setConfirmDelete(true)
            } else {
              if (fmt.settings.restTimerVibrate) vibrateError()
              setBlockedDelete(true)
            }
          }}
        >
          <IconTrash />
          <span className="grow">Delete exercise</span>
        </button>
      </Sheet>

      <ExerciseFormSheet open={editing} exercise={exercise} onClose={() => setEditing(false)} />

      <ExercisePicker
        open={mergePicker}
        title={`Merge "${exercise.name}" into`}
        confirmLabel="Choose"
        single
        excludeId={exercise.id}
        onConfirm={(ids) => void startMerge(ids)}
        onClose={() => setMergePicker(false)}
      />

      <ConfirmSheet
        open={mergeTargetId !== null}
        title="Merge these exercises?"
        message={`Every set logged as "${exercise.name}" (${history.length} session(s)) moves to "${mergeTarget?.name ?? ''}", and any routine using it is repointed. "${exercise.name}" is then deleted. This cannot be undone.`}
        confirmLabel="Merge"
        destructive
        onConfirm={() => void confirmMerge()}
        onCancel={() => setMergeTargetId(null)}
      />

      <ConfirmSheet
        open={mergeError !== null}
        title="Can't merge"
        message={mergeError ?? undefined}
        confirmLabel="OK"
        onConfirm={() => setMergeError(null)}
        onCancel={() => setMergeError(null)}
      />

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
