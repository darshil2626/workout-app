import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise } from '../db/types'
import { Sheet } from './Sheet'
import { ExerciseFormSheet } from './ExerciseForm'
import { IconCheck, IconPlus, IconSearch } from './Icons'

interface Props {
  open: boolean
  onClose: () => void
  /** Receives every id the user ticked, in selection order. */
  onConfirm: (exerciseIds: string[]) => void
  title?: string
  /** Hidden from the list — used when picking a merge target for an exercise. */
  excludeId?: string
  /** Picking a merge target, so only one choice makes sense. */
  single?: boolean
  confirmLabel?: string
}

const ALL = 'All'

export function ExercisePicker({
  open,
  onClose,
  onConfirm,
  title = 'Add exercise',
  excludeId,
  single = false,
  confirmLabel,
}: Props) {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<string>(ALL)
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])

  const muscles = useMemo(() => {
    const set = new Set(exercises.filter((e) => !e.archived).map((e) => e.muscleGroup))
    return [ALL, ...[...set].sort()]
  }, [exercises])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return exercises
      .filter((e) => !e.archived && e.id !== excludeId)
      .filter((e) => muscle === ALL || e.muscleGroup === muscle)
      .filter((e) => q === '' || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [exercises, query, muscle, excludeId])

  function toggle(id: string) {
    if (single) {
      setSelected((prev) => (prev[0] === id ? [] : [id]))
      return
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function reset() {
    setSelected([])
    setQuery('')
    setMuscle(ALL)
  }

  function confirm() {
    onConfirm(selected)
    reset()
    onClose()
  }

  return (
    <>
      <Sheet
        open={open}
        title={title}
        onClose={() => {
          reset()
          onClose()
        }}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreating(true)}>
              <IconPlus />
              New
            </button>
            <button
              className="btn btn-primary grow"
              disabled={selected.length === 0}
              onClick={confirm}
            >
              {selected.length === 0
                ? (confirmLabel ? 'Select an exercise' : 'Select exercises')
                : (confirmLabel ?? `Add ${selected.length} exercise${selected.length > 1 ? 's' : ''}`)}
            </button>
          </>
        }
      >
        <div className="search-wrap" style={{ marginBottom: 10 }}>
          <IconSearch />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises"
            autoComplete="off"
            // Autofocus is deliberately off: it forces the mobile keyboard up
            // and hides most of the list before the user has looked at it.
          />
        </div>

        <div className="chips" style={{ marginBottom: 6 }}>
          {muscles.map((m) => (
            <button
              key={m}
              className={`chip${muscle === m ? ' active' : ''}`}
              onClick={() => setMuscle(m)}
            >
              {m}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            <p className="muted">No exercises match “{query}”.</p>
            <button className="btn btn-accent-soft btn-sm" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>
              <IconPlus />
              Create “{query.trim() || 'new exercise'}”
            </button>
          </div>
        ) : (
          <div>
            {filtered.map((e) => {
              const on = selected.includes(e.id)
              return (
                <button key={e.id} className="picker-item" onClick={() => toggle(e.id)}>
                  <div className="avatar">{initials(e.name)}</div>
                  <div className="stack grow">
                    <span className="picker-name truncate">{e.name}</span>
                    <span className="picker-meta">
                      {e.muscleGroup} · {e.equipment}
                      {e.isCustom ? ' · Custom' : ''}
                    </span>
                  </div>
                  <span className={`picker-check${on ? ' on' : ''}`}>{on && <IconCheck />}</span>
                </button>
              )
            })}
          </div>
        )}
      </Sheet>

      <ExerciseFormSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(id) => {
          // Tick the freshly created exercise so one tap adds it.
          setSelected((prev) => [...prev, id])
          setQuery('')
        }}
      />
    </>
  )
}

function initials(name: string): string {
  const words = name.replace(/[()]/g, '').split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
