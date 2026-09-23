import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise } from '../db/types'
import { Header } from '../components/Header'
import { ExerciseFormSheet } from '../components/ExerciseForm'
import { IconPlus, IconSearch } from '../components/Icons'

const ALL = 'All'

export function ExercisesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState(ALL)
  const [creating, setCreating] = useState(false)

  // `undefined` while Dexie hasn't answered yet, distinct from a genuinely
  // empty library — the deep-link effect below needs that distinction so it
  // doesn't apply `?muscle=` against a muscle list that hasn't loaded.
  const exercisesRaw = useLiveQuery(() => db.exercises.toArray())
  const exercises = exercisesRaw ?? []

  const muscles = useMemo(() => {
    const set = new Set(exercises.filter((e) => !e.archived).map((e) => e.muscleGroup))
    return [ALL, ...[...set].sort()]
  }, [exercises])

  // Stats deep-links here with `?muscle=Back`. Applied once, after the real
  // muscle list is known, so an unknown or missing value falls back to "All"
  // rather than showing an empty list, and so it never fights a muscle the
  // user picks by hand afterwards.
  const appliedMuscleParam = useRef(false)
  useEffect(() => {
    if (appliedMuscleParam.current || exercisesRaw === undefined) return
    appliedMuscleParam.current = true
    const wanted = searchParams.get('muscle')
    if (wanted && muscles.includes(wanted)) setMuscle(wanted)
  }, [exercisesRaw, muscles, searchParams])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return exercises
      .filter((e) => !e.archived)
      .filter((e) => muscle === ALL || e.muscleGroup === muscle)
      .filter((e) => q === '' || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [exercises, query, muscle])

  // Alphabetical index headers, the fastest way to scan 200 names on a phone.
  const grouped = useMemo(() => {
    const groups = new Map<string, Exercise[]>()
    for (const e of filtered) {
      const letter = e.name[0].toUpperCase()
      groups.set(letter, [...(groups.get(letter) ?? []), e])
    }
    return [...groups.entries()]
  }, [filtered])

  return (
    <>
      <Header
        title="Exercises"
        back
        right={
          <button className="header-action" onClick={() => setCreating(true)}>
            <IconPlus />
          </button>
        }
      />

      <div className="page">
        {/* Search and the muscle filter stay reachable through a ~200-row list,
            so they stick just under the header instead of scrolling away with
            the first screenful of results. */}
        <div className="exercise-filter-bar">
          <div className="search-wrap">
            <IconSearch />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${exercises.length} exercises`}
              autoComplete="off"
            />
          </div>

          <div className="chips" style={{ marginTop: 10 }}>
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
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            <p className="muted">Nothing matches “{query}”.</p>
            <button className="btn btn-accent-soft btn-sm" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>
              <IconPlus />
              Create it
            </button>
          </div>
        ) : (
          grouped.map(([letter, list]) => (
            <div key={letter}>
              {/* A tag rather than a plain caption, so the alphabetical index
                  reads as a landmark and not just another muted line. */}
              <div className="index-title">{letter}</div>
              <div className="card" style={{ padding: '4px 14px' }}>
                {list.map((e) => (
                  <button
                    key={e.id}
                    className="picker-item"
                    onClick={() => navigate(`/exercises/${e.id}`)}
                  >
                    <div className="stack grow">
                      <span className="picker-name truncate">{e.name}</span>
                      <span className="picker-meta">
                        {e.muscleGroup} · {e.equipment}
                      </span>
                    </div>
                    {e.isCustom && <span className="badge">Custom</span>}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <ExerciseFormSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(id) => navigate(`/exercises/${id}`)}
      />
    </>
  )
}
