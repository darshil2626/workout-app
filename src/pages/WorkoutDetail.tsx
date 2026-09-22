import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import type { Exercise, Routine } from '../db/types'
import { Header } from '../components/Header'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { useFormatters } from '../lib/useSettings'
import { describeSet, elapsedSeconds, estimate1RM, setBadges } from '../lib/workout'
import { formatDateLabel, formatDurationShort, formatTimeOfDay } from '../lib/time'
import { IconList, IconMore, IconNote, IconPlay, IconTrash } from '../components/Icons'
import { useActiveWorkout } from '../state/ActiveWorkoutContext'
import { PR_LABEL, prsForWorkout, type PRKind } from '../lib/records'
import { effortLabel, feelingFor } from '../components/FinishSheet'

export function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fmt = useFormatters()
  const { workout: active, startFromRoutine } = useActiveWorkout()

  const workout = useLiveQuery(async () => (id ? ((await db.workouts.get(id)) ?? null) : null), [id])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [blocked, setBlocked] = useState(false)

  // Judged against sessions that came *before* this one, so an old PR is not
  // retroactively un-badged by later progress.
  const prs = useLiveQuery(
    async () =>
      workout && byId.size > 0
        ? await prsForWorkout(workout, byId, fmt.settings.bodyweightKg, fmt.settings.countWarmupSets)
        : new Map<string, PRKind[]>(),
    [workout?.id, byId.size, fmt.settings.bodyweightKg, fmt.settings.countWarmupSets],
    new Map<string, PRKind[]>(),
  )

  if (workout === undefined) return <div className="spinner" />
  if (workout === null) {
    return (
      <>
        <Header title="Workout" back="/history" />
        <div className="page">
          <div className="empty">
            <h3>Workout not found</h3>
            <p className="muted">It may have been deleted.</p>
          </div>
        </div>
      </>
    )
  }

  const best1RM = new Map<string, number>()
  for (const le of workout.exercises) {
    for (const s of le.sets) {
      if (s.weight && s.reps) {
        const e = estimate1RM(s.weight, s.reps)
        if (e > (best1RM.get(le.exerciseId) ?? 0)) best1RM.set(le.exerciseId, e)
      }
    }
  }

  /** Turns this session into a routine so it can be repeated verbatim. */
  async function saveAsRoutine() {
    const routine: Routine = {
      id: newId(),
      name: workout!.name,
      folderId: null,
      exercises: workout!.exercises.map((le) => ({
        id: newId(),
        exerciseId: le.exerciseId,
        notes: le.notes,
        restSeconds: le.restSeconds ?? null,
        supersetGroup: le.supersetGroup,
        sets: le.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          durationSec: s.durationSec,
          distanceM: s.distanceM,
          setType: s.setType,
        })),
      })),
      order: await db.routines.count(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastPerformedAt: null,
    }
    await db.routines.put(routine)
    setMenu(false)
    navigate('/')
  }

  /** Starts a fresh session pre-filled from this one, without saving a routine. */
  async function repeat() {
    if (active) {
      setMenu(false)
      setBlocked(true)
      return
    }
    const scratch: Routine = {
      id: newId(),
      name: workout!.name,
      folderId: null,
      exercises: workout!.exercises.map((le) => ({
        id: newId(),
        exerciseId: le.exerciseId,
        notes: le.notes,
        restSeconds: le.restSeconds ?? null,
        supersetGroup: le.supersetGroup,
        sets: le.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          durationSec: s.durationSec,
          distanceM: s.distanceM,
          setType: s.setType,
        })),
      })),
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await startFromRoutine(scratch)
    // The scratch routine is never persisted, so clear the link back to it.
    const started = await db.workouts.where('status').equals('active').first()
    if (started) await db.workouts.put({ ...started, routineId: undefined })
    setMenu(false)
    navigate('/workout')
  }

  async function remove() {
    await db.workouts.delete(workout!.id)
    setConfirmDelete(false)
    navigate('/history', { replace: true })
  }

  return (
    <>
      <Header
        title={workout.name}
        back="/history"
        right={
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Workout options">
            <IconMore />
          </button>
        }
      />

      <div className="page">
        <p className="workout-dateline">
          {formatDateLabel(workout.startedAt)} at {formatTimeOfDay(workout.startedAt)}
        </p>

        <div className="stat-grid" style={{ marginTop: 14 }}>
          <div className="stat">
            <div className="stat-value mono">{formatDurationShort(elapsedSeconds(workout))}</div>
            <div className="stat-label">Duration</div>
          </div>
          <div className="stat">
            <div className="stat-value mono">{fmt.volumeCompact(workout.totalVolumeKg)}</div>
            <div className="stat-label">Volume {fmt.weightUnit}</div>
          </div>
          <div className="stat">
            <div className="stat-value mono">{workout.totalSets}</div>
            <div className="stat-label">Sets</div>
          </div>
          <div className="stat">
            <div className="stat-value mono">{workout.totalReps}</div>
            <div className="stat-label">Reps</div>
          </div>
        </div>

        {workout.effort !== undefined || workout.feeling !== undefined ? (
          <div className="card row" style={{ marginTop: 14, gap: 24 }}>
            {workout.effort !== undefined && (
              <div className="stack">
                <div className="field-label">Effort</div>
                <div>{effortLabel(workout.effort)}</div>
              </div>
            )}
            {workout.feeling !== undefined && (
              <div className="stack">
                <div className="field-label">Felt</div>
                <div>
                  <span style={{ fontSize: '1.15rem' }}>{feelingFor(workout.feeling)?.emoji}</span>{' '}
                  {feelingFor(workout.feeling)?.label}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {workout.notes ? (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="field-label" style={{ marginBottom: 4 }}>
              Notes
            </div>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {workout.notes}
            </p>
          </div>
        ) : null}

        <div className="section-title">Exercises</div>

        {workout.exercises.length === 0 ? (
          <p className="muted">No sets were logged in this session.</p>
        ) : (
          workout.exercises.map((le) => {
            const exercise = byId.get(le.exerciseId)
            const kind = exercise?.kind ?? 'weight_reps'
            const badges = setBadges(le.sets)
            const oneRM = best1RM.get(le.exerciseId)
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
                    {oneRM ? (
                      <span className="ex-sub">
                        Best estimated 1RM {fmt.weight(Math.round(oneRM * 10) / 10)}{' '}
                        {fmt.weightUnit}
                      </span>
                    ) : null}
                  </div>
                  {le.supersetGroup !== null && <span className="superset-badge">SS</span>}
                </div>

                {le.notes ? (
                  <p className="faint" style={{ padding: '0 14px 8px' }}>
                    {le.notes}
                  </p>
                ) : null}

                <div style={{ padding: '0 14px 12px' }}>
                  {le.sets.map((s, i) => (
                    <div className="row" key={s.id} style={{ padding: '6px 0', gap: 12 }}>
                      <span className={`set-badge ${s.setType}`} style={{ margin: 0 }}>
                        {badges[i]}
                      </span>
                      <span className="mono grow">
                        {describeSet(s, kind, {
                          weight: (kg) => `${fmt.weight(kg)} ${fmt.weightUnit}`,
                          distance: (m) => `${fmt.distance(m)} ${fmt.distanceUnit}`,
                          duration: fmt.duration,
                        })}
                      </span>
                      {s.rpe ? <span className="badge">RPE {s.rpe}</span> : null}
                      {prs.get(s.id)?.length ? (
                        <span
                          className="badge badge-pr"
                          title={prs.get(s.id)!.map((k) => PR_LABEL[k]).join(', ')}
                        >
                          PR
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>

      <Sheet open={menu} title={workout.name} onClose={() => setMenu(false)}>
        <button className="sheet-list-item" onClick={() => void repeat()}>
          <IconPlay />
          <span className="grow">Repeat this workout</span>
        </button>
        <button className="sheet-list-item" onClick={() => void saveAsRoutine()}>
          <IconList />
          <span className="grow">Save as routine</span>
        </button>
        <button
          className="sheet-list-item"
          onClick={() => {
            setMenu(false)
            navigate(`/history/${workout.id}/edit`)
          }}
        >
          <IconNote />
          <span className="grow">Edit workout</span>
        </button>
        <button
          className="sheet-list-item danger"
          onClick={() => {
            setMenu(false)
            setConfirmDelete(true)
          }}
        >
          <IconTrash />
          <span className="grow">Delete workout</span>
        </button>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        title="Delete workout?"
        message="This session and every set in it will be removed permanently."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmSheet
        open={blocked}
        title="A workout is already running"
        message={`Finish or discard “${active?.name}” first.`}
        confirmLabel="Go to workout"
        onConfirm={() => navigate('/workout')}
        onCancel={() => setBlocked(false)}
      />
    </>
  )
}
