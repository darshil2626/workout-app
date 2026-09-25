import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '../lib/navigate'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise, LoggedExercise, LoggedSet, SetType } from '../db/types'
import { useActiveWorkout, type SessionRating } from '../state/ActiveWorkoutContext'
import { useRestTimer } from '../state/RestTimerContext'
import { useSetTimer } from '../state/SetTimerContext'
import { useFormatters } from '../lib/useSettings'
import { useNow } from '../lib/useNow'
import {
  computeTotals,
  elapsedSeconds,
  fieldsFor,
  isSetLogged,
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
import { vibrateTick } from '../lib/chime'
import { SetRow } from '../components/SetRow'
import { ExercisePicker } from '../components/ExercisePicker'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { PlateCalculator } from '../components/PlateCalculator'
import { FinishSheet } from '../components/FinishSheet'
import { Toast } from '../components/Toast'
import { useSortable } from '../lib/useSortable'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
import { useLongPress } from '../lib/useLongPress'
import { formatVolumeCompact } from '../lib/units'
import {
  IconArrowDown,
  IconArrowUp,
  IconGrip,
  IconLink,
  IconMinimise,
  IconMore,
  IconNote,
  IconPlus,
  IconSwap,
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
  countWarmups: boolean,
  excludeWorkoutId?: string,
) {
  const key = exerciseIds.join('|')
  // Keyed on the kinds actually being queried rather than the library's size:
  // a rename, a kind change or a merge leaves the count untouched, and keying
  // on size would then serve a baseline computed from a stale exercise map.
  const kindKey = exerciseIds.map((id) => exerciseById.get(id)?.kind ?? '?').join('|')
  return useLiveQuery(
    async () => {
      const map = new Map<string, ExerciseRecords>()
      for (const id of key === '' ? [] : key.split('|')) {
        const exercise = exerciseById.get(id)
        if (!exercise) continue
        map.set(id, await loadRecords(id, exercise.kind, bodyweightKg, countWarmups, excludeWorkoutId))
      }
      return map
    },
    [key, kindKey, excludeWorkoutId, bodyweightKg, countWarmups],
    // Undefined until the first scan resolves, so "not loaded yet" stays
    // distinguishable from "loaded, and this exercise has no history".
    undefined,
  )
}

export function ActiveWorkoutPage() {
  const navigate = useNavigate()
  const {
    workout,
    loading,
    addExercises,
    removeExercise,
    replaceExercise,
    moveExercise,
    reorderExercises,
    addSet,
    removeSet,
    insertSet,
    updateSet,
    updateExercise,
    setName,
    setNotes,
    finish,
    discard,
  } = useActiveWorkout()
  const restTimer = useRestTimer()
  const setTimer = useSetTimer()
  const fmt = useFormatters()
  const now = useNow(1000)

  const [picking, setPicking] = useState(false)
  // The block whose exercise is being swapped out, and the replacement chosen
  // for it while the cross-kind warning is up.
  const [replacing, setReplacing] = useState<LoggedExercise | null>(null)
  const [replaceWarning, setReplaceWarning] = useState<{ leId: string; exerciseId: string } | null>(
    null,
  )
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [rating, setRating] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [setMenu, setSetMenu] = useState<{ leId: string; set: LoggedSet } | null>(null)
  const [exMenu, setExMenu] = useState<LoggedExercise | null>(null)
  const [restEditor, setRestEditor] = useState<LoggedExercise | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  // Non-null while the plate calculator sheet is open; holds the target weight.
  const [plateTarget, setPlateTarget] = useState<number | null | undefined>(undefined)
  // Holds what a swipe just removed so an Undo tap can put it back where it was.
  const [undoSet, setUndoSet] = useState<{ leId: string; index: number; set: LoggedSet } | null>(null)

  // Undefined until the library loads. Defaulting to [] here would make every
  // exercise look unknown for a tick, which silently suppresses PR badges and
  // shows the wrong input columns for anything that is not weight × reps.
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined)
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises])
  const previous = usePreviousPerformances(workout?.exerciseIds ?? [], workout?.id)
  const baselines = useRecordBaselines(
    workout?.exerciseIds ?? [],
    byId,
    fmt.settings.bodyweightKg,
    fmt.settings.countWarmupSets,
    workout?.id,
  )

  /**
   * Stops the hold timer and writes what it measured into the set: the duration,
   * ticked complete, with rest started — the same outcome as typing the number
   * and tapping the check, in one tap.
   */
  const commitSetTimer = useCallback(() => {
    const activeId = setTimer.active?.setId
    const seconds = setTimer.stop()
    if (!activeId || seconds === null) return

    const owner = workout?.exercises.find((le) => le.sets.some((s) => s.id === activeId))
    if (!owner) return
    updateSet(owner.id, activeId, { durationSec: seconds, completed: true })
    if (fmt.settings.restTimerEnabled && fmt.settings.autoStartRestTimer) {
      restTimer.start(owner.restSeconds ?? fmt.settings.defaultRestSeconds)
    }
  }, [setTimer, workout?.exercises, updateSet, restTimer, fmt.settings])

  // A countdown that reaches zero records itself; the provider has already
  // chimed, so the hold is over whether or not the screen is being watched.
  const countdownFinished = setTimer.active?.remainingSec === 0
  useEffect(() => {
    if (countdownFinished) commitSetTimer()
  }, [countdownFinished, commitSetTimer])

  const totals = useMemo(
    () =>
      computeTotals(
        workout?.exercises ?? [],
        byId,
        fmt.settings.bodyweightKg,
        fmt.settings.countWarmupSets,
      ),
    [workout?.exercises, byId, fmt.settings.bodyweightKg, fmt.settings.countWarmupSets],
  )

  const blockIds = useMemo(() => (workout?.exercises ?? []).map((le) => le.id), [workout?.exercises])
  const sortable = useSortable(blockIds, reorderExercises, () => {
    if (fmt.settings.restTimerVibrate) vibrateTick()
  })

  // Swipe-to-delete and long-press-for-menu on set rows. Both are additional
  // paths onto actions the set-number badge already reaches by tap (open the
  // menu, then "Delete set" in it) — nothing here bypasses that badge, it's
  // just faster for anyone who finds the gesture. Keyed by set id, which is
  // unique across the whole session, so one pair of hooks covers every
  // exercise block's table rather than one per block.
  const swipeSet = useSwipeToDelete((setId) => {
    const le = workout?.exercises.find((e) => e.sets.some((s) => s.id === setId))
    if (!le) return
    const index = le.sets.findIndex((s) => s.id === setId)
    const removed = le.sets[index]
    removeSet(le.id, setId)
    setUndoSet({ leId: le.id, index, set: removed })
  })
  const longPressSet = useLongPress(
    (setId) => {
      const le = workout?.exercises.find((e) => e.sets.some((s) => s.id === setId))
      const set = le?.sets.find((s) => s.id === setId)
      if (le && set) setSetMenu({ leId: le.id, set })
    },
    // A row a swipe is already dragging doesn't also get a long-press menu.
    { disabled: (id) => swipeSet.isSwiping(id) },
  )

  function undoRemoveSet() {
    if (!undoSet) return
    insertSet(undoSet.leId, undoSet.index, undoSet.set)
    setUndoSet(null)
  }

  // Badged sets across the whole session, for the finish summary.
  const prCount = useMemo(() => {
    if (!baselines || !workout) return 0
    let n = 0
    for (const le of workout.exercises) {
      const exercise = byId.get(le.exerciseId)
      if (!exercise) continue
      const found = findSessionPRs(
        le.sets,
        exercise,
        baselines.get(le.exerciseId) ?? emptyRecords(),
        fmt.settings.bodyweightKg,
        fmt.settings.countWarmupSets,
      )
      for (const kinds of found.values()) n += kinds.length
    }
    return n
  }, [baselines, workout, byId, fmt.settings.bodyweightKg, fmt.settings.countWarmupSets])

  if (loading || !exercises) return <div className="spinner" />

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

  async function handleFinish(sessionRating: SessionRating) {
    setRating(false)
    const id = await finish(sessionRating)
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
          {/* The logging screen hides the tab bar, so without this the only way
              back to the rest of the app was the browser's back button. The
              session keeps running; the banner on every other screen returns. */}
          <button
            className="icon-btn"
            onClick={() => navigate('/')}
            aria-label="Minimise workout"
            title="Back to app — the workout keeps running"
          >
            <IconMinimise />
          </button>
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
            <div className="stat-value mono">{fmt.volumeCompact(totals.totalVolumeKg)}</div>
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
            // A baseline of zeros would badge every set, so wait for the real
            // one. Missing from a *loaded* map means no history at all, which
            // is a genuine all-zero baseline and does badge.
            const baseline = baselines && exercise
              ? baselines.get(le.exerciseId) ?? emptyRecords()
              : undefined
            const prs =
              exercise && baseline
                ? findSessionPRs(
                    le.sets,
                    exercise,
                    baseline,
                    fmt.settings.bodyweightKg,
                    fmt.settings.countWarmupSets,
                  )
                : new Map<string, PRKind[]>()

            const offset = sortable.offsetFor(le.id)
            return (
              <section
                className={`ex-block${sortable.draggingId === le.id ? ' dragging' : ''}`}
                key={le.id}
                ref={sortable.registerRef(le.id)}
                style={
                  offset === 0
                    ? undefined
                    : {
                        transform: `translateY(${offset}px)`,
                        // Only the rows being pushed aside animate; the dragged
                        // one must track the finger exactly.
                        transition: sortable.draggingId === le.id ? 'none' : 'transform 160ms ease',
                      }
                }
              >
                <div className="ex-head">
                  <button
                    className="ex-grip"
                    aria-label={`Reorder ${exercise?.name ?? 'exercise'}`}
                    {...sortable.handleProps(le.id)}
                  >
                    <IconGrip />
                  </button>
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
                        timer={setTimer.active?.setId === set.id ? setTimer.active : undefined}
                        onChange={(patch) => updateSet(le.id, set.id, patch)}
                        onToggleComplete={() => handleToggleComplete(le, set)}
                        onOpenMenu={() => setSetMenu({ leId: le.id, set })}
                        // A target already in the field counts down; an empty
                        // one counts up until the hold gives out.
                        onStartTimer={() => setTimer.start(set.id, set.durationSec)}
                        onStopTimer={commitSetTimer}
                        swipe={swipeSet}
                        longPress={longPressSet}
                      />
                    ))}
                  </tbody>
                </table>

                <div className="ex-foot">
                  <button className="btn btn-ghost btn-sm grow" onClick={() => addSet(le.id)}>
                    <IconPlus />
                    Add set
                  </button>
                  {/* Deleting a set was only reachable through the set-number
                      menu, which reads as a label rather than a button. Removing
                      the last set is the case that comes up mid-session, so it
                      gets its own control; the menu still removes any other. */}
                  <button
                    className="btn btn-ghost btn-sm ex-foot-remove"
                    onClick={() => {
                      const last = le.sets[le.sets.length - 1]
                      if (last) removeSet(le.id, last.id)
                    }}
                    disabled={le.sets.length === 0}
                    aria-label="Remove last set"
                    title="Remove last set"
                  >
                    <IconTrash />
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

      {/* Replacing keeps the block's sets, so only a change of kind — which
          changes which columns are shown — is worth warning about. */}
      <ExercisePicker
        open={replacing !== null}
        title={`Replace ${byId.get(replacing?.exerciseId ?? '')?.name ?? 'exercise'}`}
        confirmLabel="Replace"
        single
        excludeId={replacing?.exerciseId}
        onClose={() => setReplacing(null)}
        onConfirm={(ids) => {
          const le = replacing
          const next = ids[0]
          setReplacing(null)
          if (!le || !next) return
          const from = byId.get(le.exerciseId)
          const to = byId.get(next)
          const logged = le.sets.some(isSetLogged)
          if (logged && from && to && from.kind !== to.kind) {
            setReplaceWarning({ leId: le.id, exerciseId: next })
          } else {
            replaceExercise(le.id, next)
          }
        }}
      />

      <ConfirmSheet
        open={replaceWarning !== null}
        title="Different exercise type"
        message={
          'This exercise is logged differently, so some numbers already entered may stop being shown. They are kept, not deleted.'
        }
        confirmLabel="Replace"
        onConfirm={() => {
          if (replaceWarning) replaceExercise(replaceWarning.leId, replaceWarning.exerciseId)
          setReplaceWarning(null)
        }}
        onCancel={() => setReplaceWarning(null)}
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
        {/* Routines can carry a set in as a warm-up; once it is loaded to a real
            working weight, the silent exclusion from records surprises people. */}
        {setMenu?.set.setType === 'warmup' && !fmt.settings.countWarmupSets && (
          <p className="faint" style={{ marginTop: 8 }}>
            Warm-up sets don't count towards records.
          </p>
        )}
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
            setReplacing(exMenu)
            setExMenu(null)
          }}
        >
          <IconSwap />
          <span className="grow">Replace exercise</span>
        </button>
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
        onConfirm={() => {
          setConfirmFinish(false)
          setRating(true)
        }}
        onCancel={() => setConfirmFinish(false)}
      />

      <FinishSheet
        open={rating}
        summary={{
          duration: formatDuration(elapsed),
          volume: `${formatVolumeCompact(totals.totalVolumeKg, fmt.weightUnit)} ${fmt.weightUnit}`,
          prCount,
        }}
        onClose={() => setRating(false)}
        onSave={(r) => void handleFinish(r)}
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

      <Toast
        message={undoSet ? 'Set deleted' : null}
        actionLabel="Undo"
        onAction={undoRemoveSet}
        onDismiss={() => setUndoSet(null)}
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
