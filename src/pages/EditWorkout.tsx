import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from '../lib/navigate'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import type { Exercise, LoggedExercise, LoggedSet, SetType, Workout } from '../db/types'
import { Header } from '../components/Header'
import { SetRow } from '../components/SetRow'
import { ExercisePicker } from '../components/ExercisePicker'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { useFormatters } from '../lib/useSettings'
import { computeTotals, emptySet, fieldsFor, isSetLogged, SET_TYPE_LABEL, setBadges } from '../lib/workout'
import { formatDuration, parseDuration } from '../lib/time'
import { IconMore, IconPlus, IconTrash } from '../components/Icons'

function toDateInput(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toTimeInput(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function combine(dateText: string, timeText: string): number {
  const [y, m, d] = dateText.split('-').map(Number)
  const [hh, mm] = timeText.split(':').map(Number)
  if (!y || !m || !d) return Date.now()
  return new Date(y, m - 1, d, hh || 0, mm || 0).getTime()
}

/** Edits a completed session: metadata, sets, and which exercises it contains. */
export function EditWorkoutPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fmt = useFormatters()

  const stored = useLiveQuery(async () => (id ? ((await db.workouts.get(id)) ?? null) : null), [id])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState('')
  const [items, setItems] = useState<LoggedExercise[]>([])
  const [hydrated, setHydrated] = useState(false)

  const [picking, setPicking] = useState(false)
  const [exMenu, setExMenu] = useState<LoggedExercise | null>(null)
  const [setMenu, setSetMenu] = useState<{ leId: string; set: LoggedSet } | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  useEffect(() => {
    if (hydrated || stored === undefined) return
    if (stored === null) {
      setHydrated(true)
      return
    }
    setName(stored.name)
    setNotes(stored.notes ?? '')
    setDate(toDateInput(stored.startedAt))
    setTime(toTimeInput(stored.startedAt))
    const seconds = Math.max(
      0,
      Math.floor(((stored.finishedAt ?? stored.startedAt) - stored.startedAt) / 1000) - stored.pausedSec,
    )
    setDuration(formatDuration(seconds))
    setItems(stored.exercises)
    setHydrated(true)
  }, [stored, hydrated])

  if (!hydrated) return <div className="spinner" />
  if (stored === null) {
    return (
      <>
        <Header title="Edit workout" back="/history" />
        <div className="page">
          <div className="empty">
            <h3>Workout not found</h3>
          </div>
        </div>
      </>
    )
  }

  function updateExercise(leId: string, fn: (le: LoggedExercise) => LoggedExercise) {
    setItems((prev) => prev.map((le) => (le.id === leId ? fn(le) : le)))
  }

  function updateSet(leId: string, setId: string, patch: Partial<LoggedSet>) {
    updateExercise(leId, (le) => ({
      ...le,
      sets: le.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
    }))
  }

  async function save() {
    const startedAt = combine(date, time)
    const seconds = parseDuration(duration) ?? 0
    // Drop blank sets and now-empty exercises, matching how a session is saved
    // when it is finished normally.
    const cleaned = items
      .map((le) => ({ ...le, sets: le.sets.filter(isSetLogged) }))
      .filter((le) => le.sets.length > 0)

    const totals = computeTotals(
      cleaned,
      byId,
      stored!.bodyweightKg ?? fmt.settings.bodyweightKg,
      fmt.settings.countWarmupSets,
    )
    const updated: Workout = {
      ...stored!,
      name: name.trim() || stored!.name,
      notes: notes.trim() || undefined,
      startedAt,
      finishedAt: startedAt + seconds * 1000,
      pausedSec: 0,
      exercises: cleaned,
      exerciseIds: [...new Set(cleaned.map((e) => e.exerciseId))],
      totalVolumeKg: totals.totalVolumeKg,
      totalSets: totals.totalSets,
      totalReps: totals.totalReps,
    }
    await db.workouts.put(updated)
    navigate(`/history/${updated.id}`, { replace: true })
  }

  return (
    <>
      <Header
        title="Edit workout"
        left={
          <button className="header-action" onClick={() => setConfirmLeave(true)}>
            Cancel
          </button>
        }
        right={
          <button className="header-action" onClick={() => void save()}>
            Save
          </button>
        }
      />

      <div className="page">
        <div className="field">
          <label className="field-label" htmlFor="w-name">
            Name
          </label>
          <input
            id="w-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="row" style={{ gap: 10, marginTop: 12, alignItems: 'flex-end' }}>
          <div className="field grow">
            <label className="field-label" htmlFor="w-date">
              Date
            </label>
            <input
              id="w-date"
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field grow">
            <label className="field-label" htmlFor="w-time">
              Start
            </label>
            <input
              id="w-time"
              className="input"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label className="field-label" htmlFor="w-duration">
            Duration (h:mm:ss)
          </label>
          <input
            id="w-duration"
            className="input"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="1:05:00"
            inputMode="text"
          />
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label className="field-label" htmlFor="w-notes">
            Notes
          </label>
          <textarea
            id="w-notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did the session feel?"
          />
        </div>

        <div style={{ marginTop: 18 }}>
          {items.map((le) => {
            const exercise = byId.get(le.exerciseId)
            const kind = exercise?.kind ?? 'weight_reps'
            const f = fieldsFor(kind)
            const badges = setBadges(le.sets)
            return (
              <section className="ex-block" key={le.id}>
                <div className="ex-head">
                  <span className="ex-name truncate grow">{exercise?.name ?? 'Unknown exercise'}</span>
                  <button className="icon-btn" onClick={() => setExMenu(le)} aria-label="Exercise options">
                    <IconMore />
                  </button>
                </div>

                <table className="set-table">
                  <thead>
                    <tr>
                      <th className="col-set">Set</th>
                      <th className="col-prev">Previous</th>
                      {f.distance && <th>{fmt.distanceUnit}</th>}
                      {f.weight && <th>{fmt.weightUnit}</th>}
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
                        fmt={fmt}
                        onChange={(patch) => updateSet(le.id, set.id, patch)}
                        onToggleComplete={() =>
                          updateSet(le.id, set.id, { completed: !set.completed })
                        }
                        onOpenMenu={() => setSetMenu({ leId: le.id, set })}
                      />
                    ))}
                  </tbody>
                </table>

                <div className="ex-foot">
                  <button
                    className="btn btn-ghost btn-sm btn-block"
                    onClick={() =>
                      updateExercise(le.id, (x) => {
                        const last = x.sets.at(-1)
                        const next = emptySet()
                        if (last) {
                          next.weight = last.weight
                          next.reps = last.reps
                          next.durationSec = last.durationSec
                          next.distanceM = last.distanceM
                        }
                        // Sets added to a past session are logged, not pending.
                        next.completed = true
                        return { ...x, sets: [...x.sets, next] }
                      })
                    }
                  >
                    <IconPlus />
                    Add set
                  </button>
                </div>
              </section>
            )
          })}
        </div>

        <button className="btn btn-accent-soft btn-block" style={{ marginTop: 14 }} onClick={() => setPicking(true)}>
          <IconPlus />
          Add exercise
        </button>

        <p className="faint" style={{ marginTop: 12 }}>
          Totals and personal records are recalculated when you save.
        </p>
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onConfirm={(ids) =>
          setItems((prev) => [
            ...prev,
            ...ids.map((exerciseId) => {
              const set = emptySet()
              set.completed = true
              return {
                id: newId(),
                exerciseId,
                restSeconds: null,
                supersetGroup: null,
                sets: [set],
              }
            }),
          ])
        }
      />

      <Sheet open={setMenu !== null} title="Set type" onClose={() => setSetMenu(null)}>
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
            if (setMenu) {
              updateExercise(setMenu.leId, (le) => ({
                ...le,
                sets: le.sets.filter((s) => s.id !== setMenu.set.id),
              }))
            }
            setSetMenu(null)
          }}
        >
          <IconTrash />
          <span className="grow">Remove set</span>
        </button>
      </Sheet>

      <Sheet
        open={exMenu !== null}
        title={byId.get(exMenu?.exerciseId ?? '')?.name ?? 'Exercise'}
        onClose={() => setExMenu(null)}
      >
        <button
          className="sheet-list-item danger"
          onClick={() => {
            if (exMenu) setItems((prev) => prev.filter((x) => x.id !== exMenu.id))
            setExMenu(null)
          }}
        >
          <IconTrash />
          <span className="grow">Remove exercise</span>
        </button>
      </Sheet>

      <ConfirmSheet
        open={confirmLeave}
        title="Discard changes?"
        message="Your edits to this workout will not be saved."
        confirmLabel="Discard"
        destructive
        onConfirm={() => navigate(`/history/${id}`, { replace: true })}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  )
}
