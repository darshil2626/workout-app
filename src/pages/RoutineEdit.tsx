import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from '../lib/navigate'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import type { Exercise, Folder, Routine, RoutineExercise, RoutineSetTarget, SetType } from '../db/types'
import { Header } from '../components/Header'
import { ExercisePicker } from '../components/ExercisePicker'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { useFormatters } from '../lib/useSettings'
import { fieldsFor, SET_TYPE_LABEL, setBadges } from '../lib/workout'
import { displayToKg, displayToMetres, formatDistance, formatWeight, parseNumber } from '../lib/units'
import { formatDuration, parseDuration } from '../lib/time'
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

function emptyTarget(): RoutineSetTarget {
  return { weight: null, reps: null, durationSec: null, distanceM: null, setType: 'normal' }
}

export function RoutineEditPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new' || id === undefined
  const navigate = useNavigate()
  const fmt = useFormatters()

  const folders = useLiveQuery(() => db.folders.toArray(), [], [] as Folder[])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])
  const existing = useLiveQuery(async () => (isNew ? null : ((await db.routines.get(id!)) ?? null)), [id, isNew])

  const [name, setName] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [items, setItems] = useState<RoutineExercise[]>([])
  const [hydrated, setHydrated] = useState(false)

  const [picking, setPicking] = useState(false)
  const [menu, setMenu] = useState<RoutineExercise | null>(null)
  const [restEditor, setRestEditor] = useState<RoutineExercise | null>(null)
  const [typeMenu, setTypeMenu] = useState<{ exId: string; index: number } | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  // Load once; afterwards local state is the source of truth while editing.
  useEffect(() => {
    if (hydrated) return
    if (isNew) {
      setHydrated(true)
      return
    }
    if (existing === undefined) return
    if (existing === null) {
      setHydrated(true)
      return
    }
    setName(existing.name)
    setFolderId(existing.folderId)
    setItems(existing.exercises)
    setHydrated(true)
  }, [existing, isNew, hydrated])

  const canSave = name.trim() !== '' && items.length > 0

  async function save() {
    const now = Date.now()
    const record: Routine = {
      id: isNew ? newId() : id!,
      name: name.trim(),
      folderId,
      exercises: items,
      order: existing?.order ?? (await db.routines.count()),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastPerformedAt: existing?.lastPerformedAt ?? null,
    }
    await db.routines.put(record)
    navigate('/', { replace: true })
  }

  function updateItem(itemId: string, fn: (re: RoutineExercise) => RoutineExercise) {
    setItems((prev) => prev.map((re) => (re.id === itemId ? fn(re) : re)))
  }

  function updateTarget(itemId: string, index: number, patch: Partial<RoutineSetTarget>) {
    updateItem(itemId, (re) => ({
      ...re,
      sets: re.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }))
  }

  function move(itemId: string, direction: -1 | 1) {
    setItems((prev) => {
      const i = prev.findIndex((re) => re.id === itemId)
      const j = i + direction
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  if (!hydrated) return <div className="spinner" />

  return (
    <>
      <Header
        title={isNew ? 'New routine' : 'Edit routine'}
        left={
          <button className="header-action" onClick={() => setConfirmLeave(true)}>
            Cancel
          </button>
        }
        right={
          <button className="header-action" disabled={!canSave} onClick={() => void save()}>
            Save
          </button>
        }
      />

      <div className="page">
        <div className="field">
          <label className="field-label" htmlFor="routine-name">
            Routine name
          </label>
          <input
            id="routine-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Push Day A"
            autoComplete="off"
          />
        </div>

        {folders.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="routine-folder">
              Folder
            </label>
            <select
              id="routine-folder"
              className="input"
              value={folderId ?? ''}
              onChange={(e) => setFolderId(e.target.value === '' ? null : e.target.value)}
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          {items.map((re) => {
            const exercise = byId.get(re.exerciseId)
            const kind = exercise?.kind ?? 'weight_reps'
            const f = fieldsFor(kind)
            const badges = setBadges(
              re.sets.map((s) => ({
                id: '',
                weight: null,
                reps: null,
                durationSec: null,
                distanceM: null,
                rpe: null,
                setType: s.setType,
                completed: false,
              })),
            )

            return (
              <section className="ex-block" key={re.id}>
                <div className="ex-head">
                  <div className="stack grow">
                    <span className="ex-name truncate">{exercise?.name ?? 'Unknown exercise'}</span>
                    <span className="ex-sub">
                      {re.sets.length} set{re.sets.length === 1 ? '' : 's'} · rest{' '}
                      {formatDuration(re.restSeconds ?? fmt.settings.defaultRestSeconds)}
                      {re.supersetGroup !== null ? ` · Superset ${re.supersetGroup + 1}` : ''}
                    </span>
                  </div>
                  {re.supersetGroup !== null && <span className="superset-badge">SS</span>}
                  <button className="icon-btn" onClick={() => setMenu(re)} aria-label="Exercise options">
                    <IconMore />
                  </button>
                </div>

                {re.notes !== undefined && (
                  <input
                    className="ex-note-input"
                    value={re.notes}
                    onChange={(e) => updateItem(re.id, (x) => ({ ...x, notes: e.target.value }))}
                    placeholder="Note shown every time you run this routine"
                    aria-label="Exercise note"
                  />
                )}

                <table className="set-table">
                  <thead>
                    <tr>
                      <th className="col-set">Set</th>
                      {f.distance && <th>{fmt.distanceUnit}</th>}
                      {f.weight && <th>{fmt.weightUnit}</th>}
                      {f.duration && <th>Time</th>}
                      {f.reps && <th>Reps</th>}
                      <th style={{ width: 40 }} aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {re.sets.map((s, i) => (
                      <tr key={i}>
                        <td className="col-set">
                          <button
                            className={`set-badge ${s.setType}`}
                            onClick={() => setTypeMenu({ exId: re.id, index: i })}
                            aria-label="Set type"
                          >
                            {badges[i]}
                          </button>
                        </td>
                        {f.distance && (
                          <td>
                            <TargetField
                              display={formatDistance(s.distanceM, fmt.distanceUnit)}
                              placeholder="—"
                              onCommit={(t) => {
                                const n = parseNumber(t)
                                updateTarget(re.id, i, {
                                  distanceM: n === null ? null : displayToMetres(n, fmt.distanceUnit),
                                })
                              }}
                              ariaLabel="Target distance"
                            />
                          </td>
                        )}
                        {f.weight && (
                          <td>
                            <TargetField
                              display={formatWeight(s.weight, fmt.weightUnit)}
                              placeholder="—"
                              onCommit={(t) => {
                                const n = parseNumber(t)
                                updateTarget(re.id, i, {
                                  weight: n === null ? null : displayToKg(n, fmt.weightUnit),
                                })
                              }}
                              ariaLabel="Target weight"
                            />
                          </td>
                        )}
                        {f.duration && (
                          <td>
                            <TargetField
                              display={s.durationSec === null ? '' : formatDuration(s.durationSec)}
                              placeholder="—"
                              onCommit={(t) => updateTarget(re.id, i, { durationSec: parseDuration(t) })}
                              ariaLabel="Target time"
                              inputMode="text"
                            />
                          </td>
                        )}
                        {f.reps && (
                          <td>
                            <TargetField
                              display={s.reps === null ? '' : String(s.reps)}
                              placeholder="—"
                              onCommit={(t) => {
                                const n = parseNumber(t)
                                updateTarget(re.id, i, {
                                  reps: n === null ? null : Math.max(0, Math.round(n)),
                                })
                              }}
                              ariaLabel="Target reps"
                              inputMode="numeric"
                            />
                          </td>
                        )}
                        <td style={{ width: 40 }}>
                          <button
                            className="icon-btn"
                            aria-label="Remove set"
                            onClick={() =>
                              updateItem(re.id, (x) => ({
                                ...x,
                                sets: x.sets.filter((_, k) => k !== i),
                              }))
                            }
                          >
                            <IconTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="ex-foot">
                  <button
                    className="btn btn-ghost btn-sm btn-block"
                    onClick={() =>
                      updateItem(re.id, (x) => ({
                        ...x,
                        // Copy the last target so adding "3 × 100 kg" is three taps.
                        sets: [...x.sets, x.sets.at(-1) ? { ...x.sets[x.sets.length - 1] } : emptyTarget()],
                      }))
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

        <p className="faint" style={{ margin: '14px 0 8px' }}>
          Target weights and reps are optional — leave them blank and they show as placeholders while
          you log.
        </p>

        <button className="btn btn-accent-soft btn-block" onClick={() => setPicking(true)}>
          <IconPlus />
          Add exercise
        </button>
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onConfirm={(ids) =>
          setItems((prev) => [
            ...prev,
            ...ids.map((exerciseId) => ({
              id: newId(),
              exerciseId,
              restSeconds: null,
              supersetGroup: null,
              sets: [emptyTarget(), emptyTarget(), emptyTarget()],
            })),
          ])
        }
      />

      <Sheet open={typeMenu !== null} title="Set type" onClose={() => setTypeMenu(null)}>
        {(['normal', 'warmup', 'drop', 'failure'] as SetType[]).map((t) => (
          <button
            key={t}
            className="sheet-list-item"
            onClick={() => {
              if (typeMenu) updateTarget(typeMenu.exId, typeMenu.index, { setType: t })
              setTypeMenu(null)
            }}
          >
            <span className={`set-badge ${t}`} style={{ margin: 0 }}>
              {t === 'normal' ? '1' : t[0].toUpperCase()}
            </span>
            <span className="grow">{SET_TYPE_LABEL[t]}</span>
          </button>
        ))}
      </Sheet>

      <Sheet
        open={menu !== null}
        title={byId.get(menu?.exerciseId ?? '')?.name ?? 'Exercise'}
        onClose={() => setMenu(null)}
      >
        <button
          className="sheet-list-item"
          onClick={() => {
            if (menu) updateItem(menu.id, (x) => ({ ...x, notes: x.notes ?? '' }))
            setMenu(null)
          }}
        >
          <IconNote />
          <span className="grow">Add a note</span>
        </button>
        <button
          className="sheet-list-item"
          onClick={() => {
            setRestEditor(menu)
            setMenu(null)
          }}
        >
          <IconTimer />
          <span className="grow">Rest timer</span>
          <span className="faint">
            {formatDuration(menu?.restSeconds ?? fmt.settings.defaultRestSeconds)}
          </span>
        </button>
        <button
          className="sheet-list-item"
          disabled={items.findIndex((x) => x.id === menu?.id) === 0}
          onClick={() => {
            if (menu) {
              const idx = items.findIndex((x) => x.id === menu.id)
              if (idx > 0) {
                const above = items[idx - 1]
                const group = above.supersetGroup ?? idx - 1
                updateItem(above.id, (x) => ({ ...x, supersetGroup: group }))
                updateItem(menu.id, (x) => ({ ...x, supersetGroup: group }))
              }
            }
            setMenu(null)
          }}
        >
          <IconLink />
          <span className="grow">Superset with exercise above</span>
        </button>
        {menu !== null && menu.supersetGroup !== null && (
          <button
            className="sheet-list-item"
            onClick={() => {
              updateItem(menu.id, (x) => ({ ...x, supersetGroup: null }))
              setMenu(null)
            }}
          >
            <IconLink />
            <span className="grow">Remove from superset</span>
          </button>
        )}
        <button
          className="sheet-list-item"
          onClick={() => {
            if (menu) move(menu.id, -1)
            setMenu(null)
          }}
        >
          <IconArrowUp />
          <span className="grow">Move up</span>
        </button>
        <button
          className="sheet-list-item"
          onClick={() => {
            if (menu) move(menu.id, 1)
            setMenu(null)
          }}
        >
          <IconArrowDown />
          <span className="grow">Move down</span>
        </button>
        <button
          className="sheet-list-item danger"
          onClick={() => {
            if (menu) setItems((prev) => prev.filter((x) => x.id !== menu.id))
            setMenu(null)
          }}
        >
          <IconTrash />
          <span className="grow">Remove exercise</span>
        </button>
      </Sheet>

      <Sheet open={restEditor !== null} title="Rest timer" onClose={() => setRestEditor(null)}>
        <button
          className="sheet-list-item"
          onClick={() => {
            if (restEditor) updateItem(restEditor.id, (x) => ({ ...x, restSeconds: null }))
            setRestEditor(null)
          }}
        >
          <span className="grow">Use default ({formatDuration(fmt.settings.defaultRestSeconds)})</span>
        </button>
        {[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => (
          <button
            key={s}
            className="sheet-list-item"
            onClick={() => {
              if (restEditor) updateItem(restEditor.id, (x) => ({ ...x, restSeconds: s }))
              setRestEditor(null)
            }}
          >
            <span className="grow">{s === 0 ? 'Off' : formatDuration(s)}</span>
          </button>
        ))}
      </Sheet>

      <ConfirmSheet
        open={confirmLeave}
        title="Discard changes?"
        message="Your edits to this routine will not be saved."
        confirmLabel="Discard"
        destructive
        onConfirm={() => navigate('/', { replace: true })}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  )
}

/** Same focus-safe editing behaviour as SetRow, without completion state. */
function TargetField({
  display,
  placeholder,
  onCommit,
  ariaLabel,
  inputMode = 'decimal',
}: {
  display: string
  placeholder: string
  onCommit: (text: string) => void
  ariaLabel: string
  inputMode?: 'decimal' | 'numeric' | 'text'
}) {
  const [text, setText] = useState(display)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(display)
  }, [display, focused])
  return (
    <input
      className="set-input"
      type="text"
      inputMode={inputMode}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={(e) => {
        setFocused(true)
        e.currentTarget.select()
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value)
        onCommit(e.target.value)
      }}
    />
  )
}
