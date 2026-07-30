import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise, LoggedExercise, LoggedSet, SetType } from '../db/types'
import { useActiveWorkout } from '../state/ActiveWorkoutContext'
import { useRestTimer } from '../state/RestTimerContext'
import { useFormatters } from '../lib/useSettings'
import { useNow } from '../lib/useNow'
import {
  computeTotals,
  elapsedSeconds,
  fieldsFor,
  SET_TYPE_LABEL,
  setBadges,
} from '../lib/workout'
import { getPreviousPerformance, type PreviousPerformance } from '../lib/history'
import {
  emptyRecords,
  findSessionPRs,
  loadRecords,
  type ExerciseRecords,
  type PRKind,
} from '../lib/records'
import { formatDuration } from '../lib/time'
import { SetRow } from '../components/SetRow'
import { ExercisePicker } from '../components/ExercisePicker'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { PlateCalculator } from '../components/PlateCalculator'
import {
  IconArrowDown,
  IconArrowUp,
  IconLink,
  IconMore,
  IconNote,
  IconPlus,
  IconTimer,
  IconTrash,
} from '../components/Icons'

/** Look up "last time" performances for every exercise in the session. */
function usePreviousPerformances(exerciseIds: string[], excludeWorkoutId?: string) {
  const key = exerciseIds.join('|')
  return useLiveQuery(
    async () => {
      const map = new Map<string, PreviousPerformance>()
      for (const id of key === '' ? [] : key.split('|')) {
        const prev = await getPreviousPerformance(id, excludeWorkoutId)
        if (prev) map.set(id, prev)
      }
      return map
    },
    [key, excludeWorkoutId],
    new Map<string, PreviousPerformance>(),
  )
}

/**
 * Best-ever values per exercise, excluding the session in progress, so a set
 * logged now can be compared against everything that came before it.
 */
function useRecordBaselines(
  exerciseIds: string[],
  exerciseById: Map<string, Exercise>,
  bodyweightKg: number | null,
  excludeWorkoutId?: string,
) {
  const key = exerciseIds.join('|')
  return useLiveQuery(
    async () => {
      const map = new Map<string, ExerciseRecords>()
      for (const id of key === '' ? [] : key.split('|')) {
        const exercise = exerciseById.get(id)
        if (!exercise) continue
        map.set(id, await loadRecords(id, exercise.kind, bodyweightKg, excludeWorkoutId))
      }
      return map
    },
    [key, excludeWorkoutId, bodyweightKg, exerciseById.size],
    new Map<string, ExerciseRecords>(),
  )
}

export function ActiveWorkoutPage() {
  const navigate = useNavigate()
  const {
    workout,
    loading,
    addExercises,
    removeExercise,
    moveExercise,
    addSet,
    removeSet,
    updateSet,
    updateExercise,
    setName,
    setNotes,
    finish,
    discard,
  } = useActiveWorkout()
  const restTimer = useRestTimer()
  const fmt = useFormatters()
  const now = useNow(1000)

  const [picking, setPicking] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [setMenu, setSetMenu] = useState<{ leId: string; set: LoggedSet } | null>(null)
  const [exMenu, setExMenu] = useState<LoggedExercise | null>(null)
  const [restEditor, setRestEditor] = useState<LoggedExercise | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  // Non-null while the plate calculator sheet is open; holds the target weight.
  const [plateTarget, setPlateTarget] = useState<number | null | undefined>(undefined)

  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])
  const previous = usePreviousPerformances(workout?.exerciseIds ?? [], workout?.id)
  const baselines = useRecordBaselines(
    workout?.exerciseIds ?? [],
    byId,
    fmt.settings.bodyweightKg,
    workout?.id,
  )

  const totals = useMemo(
    () => computeTotals(workout?.exercises ?? [], byId, fmt.settings.bodyweightKg),
    [workout?.exercises, byId, fmt.settings.bodyweightKg],
  )

  if (loading) return <div className="spinner" />

  if (!workout) {
    return (
      <div className="page">
        <div className="empty">
          <div className="empty-icon">🏋️</div>
          <h3>No workout in progress</h3>
          <p className="muted">Start one from the Workout tab.</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
            Go to Workout
          </button>
        </div>
      </div>
    )
  }

  const elapsed = elapsedSeconds(workout, now)

  function handleToggleComplete(le: LoggedExercise, set: LoggedSet) {
    const nowComplete = !set.completed
    updateSet(le.id, set.id, { completed: nowComplete })
    // Rest starts on completion only; un-ticking a set should not start a timer.
    if (nowComplete && fmt.settings.restTimerEnabled && fmt.settings.autoStartRestTimer) {
      restTimer.start(le.restSeconds ?? fmt.settings.defaultRestSeconds)
    }
  }

  async function handleFinish() {
    setConfirmFinish(false)
    const id = await finish()
    restTimer.stop()
    if (id) navigate(`/history/${id}`, { replace: true })
    else navigate('/', { replace: true })
  }

  async function handleDiscard() {
    setConfirmDiscard(false)
    await discard()
    restTimer.stop()
    navigate('/', { replace: true })
  }

  const anyCompleted = workout.exercises.some((le) => le.sets.some((s) => s.completed))

  return (
    <>
      <header className="header">
        <div className="header-row">
          <button className="header-action danger" onClick={() => setConfirmDiscard(true)}>
            Discard
          </button>
          <div className="grow" style={{ textAlign: 'center' }}>
            <div className="mono" style={{ fontWeight: 700 }}>
              {formatDuration(elapsed)}
            </div>
          </div>
          <button
            className="header-action"
            onClick={() => setConfirmFinish(true)}
            style={{ color: 'var(--success)' }}
          >
            Finish
          </button>
        </div>
      </header>

      <div className="page">
        <input
          className="input"
          value={workout.name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Workout name"
          style={{
            fontSize: '1.35rem',
            fontWeight: 650,
            background: 'transparent',
            border: 'none',
            padding: '4px 0',
          }}
        />

        <div className="stat-grid" style={{ margin: '10px 0 4px' }}>
          <div className="stat">
            <div className="stat-value mono">{fmt.volume(totals.totalVolumeKg)}</div>
            <div className="stat-label">Volume {fmt.weightUnit}</div>
          </div>
          <div className="stat">
            <div className="stat-value mono">{totals.totalSets}</div>
            <div className="stat-label">Sets</div>
          </div>
          <div className="stat">
            <div className="stat-value mono">{totals.totalReps}</div>
            <div className="stat-label">Reps</div>
          </div>
        </div>

        {showNotes || workout.notes ? (
          <textarea
            className="input"
            style={{ marginTop: 10 }}
            value={workout.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did the session feel?"
            aria-label="Workout notes"
          />
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setShowNotes(true)}
          >
            <IconNote />
            Add workout note
          </button>
        )}

        <div style={{ marginTop: 16 }}>
          {workout.exercises.map((le) => {
            const exercise = byId.get(le.exerciseId)
            const kind = exercise?.kind ?? 'weight_reps'
            const f = fieldsFor(kind)
            const badges = setBadges(le.sets)
            const prev = previous.get(le.exerciseId)
            const prs = exercise
              ? findSessionPRs(
                  le.sets,
                  exercise,
                  baselines.get(le.exerciseId) ?? emptyRecords(),
                  fmt.settings.bodyweightKg,
                )
              : new Map<string, PRKind[]>()

            return (
              <section className="ex-block" key={le.id}>
                <div className="ex-head">
                  <div className="stack grow">
                    <button
                      className="ex-name truncate"
                      style={{ textAlign: 'left' }}
                      onClick={() => navigate(`/exercises/${le.exerciseId}`)}
                    >
                      {exercise?.name ?? 'Unknown exercise'}
                    </button>
                    <span className="ex-sub">
                      Rest {formatDuration(le.restSeconds ?? fmt.settings.defaultRestSeconds)}
                      {le.supersetGroup !== null ? ` · Superset ${le.supersetGroup + 1}` : ''}
                    </span>
                  </div>
                  {le.supersetGroup !== null && <span className="superset-badge">SS</span>}
                  <button className="icon-btn" onClick={() => setExMenu(le)} aria-label="Exercise options">
                    <IconMore />
                  </button>
                </div>

                {le.notes !== undefined && (
                  <input
                    className="ex-note-input"
                    value={le.notes}
                    onChange={(e) => updateExercise(le.id, { notes: e.target.value })}
                    placeholder="Note for this exercise"
                    aria-label="Exercise note"
                  />
                )}

                <table className="set-table">
                  <thead>
                    <tr>
                      <th className="col-set">Set</th>
                      <th className="col-prev">Previous</th>
                      {f.distance && <th>{fmt.distanceUnit}</th>}
                      {f.weight && <th>{f.weightLabel ? `${f.weightLabel} (${fmt.weightUnit})` : fmt.weightUnit}</th>}
                      {f.duration && <th>Time</th>}
                      {f.reps && <th>Reps</th>}
                      <th className="col-check" aria-label="Completed" />
                    </tr>
                  </thead>
                  <tbody>
                    {le.sets.map((set, i) => (
                      <SetRow
                        key={set.id}
                        set={set}
                        badge={badges[i]}
                        kind={kind}
                        previous={prev?.sets[i]}
                        prs={prs.get(set.id)}
                        fmt={fmt}
                        onChange={(patch) => updateSet(le.id, set.id, patch)}
                        onToggleComplete={() => handleToggleComplete(le, set)}
                        onOpenMenu={() => setSetMenu({ leId: le.id, set })}
                      />
                    ))}
                  </tbody>
                </table>

                <div className="ex-foot">
                  <button className="btn btn-ghost btn-sm btn-block" onClick={() => addSet(le.id)}>
                    <IconPlus />
                    Add set
                  </button>
                </div>
              </section>
            )
          })}
        </div>

        <div className="list" style={{ marginTop: 16 }}>
          <button className="btn btn-accent-soft btn-block" onClick={() => setPicking(true)}>
            <IconPlus />
            Add exercise
          </button>
          <button className="btn btn-danger btn-block" onClick={() => setConfirmDiscard(true)}>
            Discard workout
          </button>
        </div>
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onConfirm={(ids) => addExercises(ids)}
      />

      {/* Per-set menu: RPE, plate maths, set type, delete. */}
      <Sheet open={setMenu !== null} title="Set options" onClose={() => setSetMenu(null)}>
        <div className="field-label">Effort (RPE)</div>
        <div className="rpe-row">
          <button
            className={`chip${setMenu?.set.rpe === null ? ' active' : ''}`}
            onClick={() => {
              if (setMenu) updateSet(setMenu.leId, setMenu.set.id, { rpe: null })
              setSetMenu(null)
            }}
          >
            None
          </button>
          {RPE_VALUES.map((v) => (
            <button
              key={v}
              className={`chip${setMenu?.set.rpe === v ? ' active' : ''}`}
              onClick={() => {
                if (setMenu) updateSet(setMenu.leId, setMenu.set.id, { rpe: v })
                setSetMenu(null)
              }}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          className="sheet-list-item"
          onClick={() => {
            setPlateTarget(setMenu?.set.weight ?? null)
            setSetMenu(null)
          }}
        >
          <IconPlus />
          <span className="grow">Plate calculator</span>
          <span className="faint">
            {setMenu?.set.weight !== null && setMenu?.set.weight !== undefined
              ? `${fmt.weight(setMenu.set.weight)} ${fmt.weightUnit}`
              : 'no weight'}
          </span>
        </button>

        <div className="field-label" style={{ marginTop: 14 }}>
          Set type
        </div>
        {(['normal', 'warmup', 'drop', 'failure'] as SetType[]).map((t) => (
          <button
            key={t}
            className="sheet-list-item"
            onClick={() => {
              if (setMenu) updateSet(setMenu.leId, setMenu.set.id, { setType: t })
              setSetMenu(null)
            }}
          >
            <span className={`set-badge ${t}`} style={{ margin: 0 }}>
              {t === 'normal' ? '1' : t[0].toUpperCase()}
            </span>
            <span className="grow">{SET_TYPE_LABEL[t]}</span>
            {setMenu?.set.setType === t && <span style={{ color: 'var(--accent)' }}>✓</span>}
          </button>
        ))}
        <button
          className="sheet-list-item danger"
          onClick={() => {
            if (setMenu) removeSet(setMenu.leId, setMenu.set.id)
            setSetMenu(null)
          }}
        >
          <IconTrash />
          <span className="grow">Delete set</span>
        </button>
      </Sheet>

      {/* Per-exercise menu. */}
      <Sheet
        open={exMenu !== null}
        title={byId.get(exMenu?.exerciseId ?? '')?.name ?? 'Exercise'}
        onClose={() => setExMenu(null)}
      >
        <button
          className="sheet-list-item"
          onClick={() => {
            if (exMenu) updateExercise(exMenu.id, { notes: exMenu.notes ?? '' })
            setExMenu(null)
          }}
        >
          <IconNote />
          <span className="grow">Add a note</span>
        </button>
        <button
          className="sheet-list-item"
          onClick={() => {
            setRestEditor(exMenu)
            setExMenu(null)
          }}
        >
          <IconTimer />
          <span className="grow">Rest timer</span>
          <span className="faint">
            {formatDuration(exMenu?.restSeconds ?? fmt.settings.defaultRestSeconds)}
          </span>
        </button>
        <button
          className="sheet-list-item"
          onClick={() => {
            if (exMenu) {
              // Grouping with the exercise above is how supersets are built in
              // practice; the group id is the index of the first member.
              const idx = workout.exercises.findIndex((e) => e.id === exMenu.id)
              if (idx > 0) {
                const above = workout.exercises[idx - 1]
                const group = above.supersetGroup ?? idx - 1
                updateExercise(above.id, { supersetGroup: group })
                updateExercise(exMenu.id, { supersetGroup: group })
              }
            }
            setExMenu(null)
          }}
          disabled={workout.exercises.findIndex((e) => e.id === exMenu?.id) === 0}
        >
          <IconLink />
          <span className="grow">Superset with exercise above</span>
        </button>
        {exMenu?.supersetGroup !== null && exMenu !== null && (
          <button
            className="sheet-list-item"
            onClick={() => {
              updateExercise(exMenu.id, { supersetGroup: null })
              setExMenu(null)
            }}
          >
            <IconLink />
            <span className="grow">Remove from superset</span>
          </button>
        )}
        <button
          className="sheet-list-item"
          onClick={() => {
            if (exMenu) moveExercise(exMenu.id, -1)
            setExMenu(null)
          }}
        >
          <IconArrowUp />
          <span className="grow">Move up</span>
        </button>
        <button
          className="sheet-list-item"
          onClick={() => {
            if (exMenu) moveExercise(exMenu.id, 1)
            setExMenu(null)
          }}
        >
          <IconArrowDown />
          <span className="grow">Move down</span>
        </button>
        <button
          className="sheet-list-item danger"
          onClick={() => {
            if (exMenu) removeExercise(exMenu.id)
            setExMenu(null)
          }}
        >
          <IconTrash />
          <span className="grow">Remove exercise</span>
        </button>
      </Sheet>

      <PlateCalculator
        open={plateTarget !== undefined}
        targetKg={plateTarget ?? null}
        onClose={() => setPlateTarget(undefined)}
      />

      <RestEditorSheet
        exercise={restEditor}
        defaultRest={fmt.settings.defaultRestSeconds}
        onClose={() => setRestEditor(null)}
        onSave={(seconds) => {
          if (restEditor) updateExercise(restEditor.id, { restSeconds: seconds })
          setRestEditor(null)
        }}
      />

      <ConfirmSheet
        open={confirmFinish}
        title={anyCompleted ? 'Finish workout?' : 'Nothing logged yet'}
        message={
          anyCompleted
            ? 'Unfinished sets will be discarded and the session saved to your history.'
            : 'No sets are ticked complete, so this session would be saved empty. Finish anyway?'
        }
        confirmLabel="Finish"
        onConfirm={() => void handleFinish()}
        onCancel={() => setConfirmFinish(false)}
      />

      <ConfirmSheet
        open={confirmDiscard}
        title="Discard workout?"
        message="Everything logged in this session will be deleted. This cannot be undone."
        confirmLabel="Discard"
        destructive
        onConfirm={() => void handleDiscard()}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  )
}

/** RPE in half steps from "could do 4 more" up to a genuine limit set. */
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

const REST_PRESETS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300]

function RestEditorSheet({
  exercise,
  defaultRest,
  onClose,
  onSave,
}: {
  exercise: LoggedExercise | null
  defaultRest: number
  onClose: () => void
  onSave: (seconds: number | null) => void
}) {
  const current = exercise?.restSeconds ?? defaultRest
  return (
    <Sheet open={exercise !== null} title="Rest timer" onClose={onClose}>
      <p className="muted" style={{ marginBottom: 12 }}>
        Applies to this exercise in this workout.
      </p>
      <button className="sheet-list-item" onClick={() => onSave(null)}>
        <span className="grow">Use default ({formatDuration(defaultRest)})</span>
        {exercise?.restSeconds == null && <span style={{ color: 'var(--accent)' }}>✓</span>}
      </button>
      {REST_PRESETS.map((s) => (
        <button key={s} className="sheet-list-item" onClick={() => onSave(s)}>
          <span className="grow">{s === 0 ? 'Off' : formatDuration(s)}</span>
          {exercise?.restSeconds === s && current === s && (
            <span style={{ color: 'var(--accent)' }}>✓</span>
          )}
        </button>
      ))}
    </Sheet>
  )
}
