import { useEffect, useMemo, useRef, useState } from 'react'
import { listExercises, listDoneWorkoutsNewestFirst } from '../db/repo'
import { useNavigate } from '../lib/navigate'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Exercise, Workout } from '../db/types'
import { Header } from '../components/Header'
import { useFormatters } from '../lib/useSettings'
import { elapsedSeconds } from '../lib/workout'
import { formatDateLabel, formatDurationShort, formatTimeOfDay } from '../lib/time'
import { feelingFor } from '../components/FinishSheet'

/** Sessions drawn at a time. A decade of training is thousands of cards, and drawing them all at once froze the page. */
const PAGE_SIZE = 60

/**
 * How far down the list this visit had got, kept for the session so coming back
 * from a workout lands where you left off instead of at the first page.
 */
let rememberedVisible = PAGE_SIZE

export function HistoryPage() {
  const navigate = useNavigate()
  const fmt = useFormatters()

  // `undefined` while Dexie hasn't answered yet, distinct from a genuinely
  // empty history — collapsing that into `[]` immediately would show the
  // "No workouts yet" empty state as a flash before real history pops in.
  const workoutsRaw = useLiveQuery(() => listDoneWorkoutsNewestFirst())
  // Memoised: a fresh `[]` each render would defeat every useMemo keyed on it.
  const workouts = useMemo(() => workoutsRaw ?? [], [workoutsRaw])
  const exercises = useLiveQuery(() => listExercises(), [], [] as Exercise[])
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  const [visible, setVisible] = useState(rememberedVisible)
  const showMore = () =>
    setVisible((v) => {
      rememberedVisible = v + PAGE_SIZE
      return rememberedVisible
    })
  const shown = useMemo(() => workouts.slice(0, visible), [workouts, visible])
  const hasMore = shown.length < workouts.length

  // Loads the next page as the end of the list nears the screen. The button
  // below does the same for anyone without scroll events or IntersectionObserver.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!hasMore || !el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) showMore()
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, visible])

  // Group by calendar month so long histories stay scannable.
  const months = useMemo(() => {
    const groups = new Map<string, Workout[]>()
    for (const w of shown) {
      const d = new Date(w.startedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      const list = groups.get(key)
      if (list) list.push(w)
      else groups.set(key, [w])
    }
    return [...groups.entries()].map(([key, list]) => ({
      key,
      label: new Date(list[0].startedAt).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
      list,
    }))
  }, [shown])

  const totalVolume = workouts.reduce((sum, w) => sum + w.totalVolumeKg, 0)

  return (
    <>
      <Header title="History" />
      <div className="page">
        {workoutsRaw === undefined ? (
          <div className="spinner" />
        ) : workouts.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📈</div>
            <h3>No workouts yet</h3>
            <p className="muted">Finished sessions land here with every set you logged.</p>
          </div>
        ) : (
          <>
            {/* Totals for the whole history, sitting above the list as its header
                rather than as a fourth card fighting the sessions for attention. */}
            <div className="stat-grid list-summary">
              <div className="stat">
                <div className="stat-value mono">{workouts.length}</div>
                <div className="stat-label">Workouts</div>
              </div>
              <div className="stat">
                <div className="stat-value mono">{fmt.volumeCompact(totalVolume)}</div>
                <div className="stat-label">Total {fmt.weightUnit}</div>
              </div>
              <div className="stat">
                <div className="stat-value mono">{workouts.reduce((s, w) => s + w.totalSets, 0)}</div>
                <div className="stat-label">Sets</div>
              </div>
            </div>

            {months.map((month) => (
              <div key={month.key}>
                {/* Sticky so a long history never loses track of which month it's
                    scrolled into. */}
                <div className="section-title month-title">{month.label}</div>
                <div className="list">
                  {month.list.map((w) => (
                    <button
                      key={w.id}
                      className="card card-tappable"
                      style={{ textAlign: 'left' }}
                      onClick={() => navigate(`/history/${w.id}`)}
                    >
                      <div className="row-between">
                        <span style={{ fontWeight: 650 }} className="truncate">
                          {w.name}
                        </span>
                        <span className="row" style={{ gap: 6, flexShrink: 0 }}>
                          {w.feeling !== undefined && (
                            <span title={`Felt ${feelingFor(w.feeling)?.label.toLowerCase()}`}>
                              {feelingFor(w.feeling)?.emoji}
                            </span>
                          )}
                          {/* Date and time of day share a line — a session only needs
                              one line to say when it happened. */}
                          <span className="faint">
                            {formatDateLabel(w.startedAt)} · {formatTimeOfDay(w.startedAt)}
                          </span>
                        </span>
                      </div>
                      <div className="row" style={{ gap: 14, marginTop: 6 }}>
                        <span className="muted mono">{formatDurationShort(elapsedSeconds(w))}</span>
                        <span className="muted mono">
                          {fmt.volume(w.totalVolumeKg)} {fmt.weightUnit}
                        </span>
                        <span className="muted mono">{w.totalSets} sets</span>
                      </div>
                      {/* The thing people actually scan a history card for, so it
                          outranks the stats row above it rather than trailing it. */}
                      {w.exercises.length === 0 ? (
                        <div className="card-exercises" style={{ marginTop: 6 }}>
                          No exercises logged
                        </div>
                      ) : (
                        <ul className="history-ex-list">
                          {w.exercises.slice(0, 3).map((le) => (
                            <li key={le.id}>
                              <span className="truncate">{byId.get(le.exerciseId)?.name ?? 'Unknown'}</span>
                              <span className="mono">
                                {le.sets.length} {le.sets.length === 1 ? 'set' : 'sets'}
                              </span>
                            </li>
                          ))}
                          {w.exercises.length > 3 && (
                            <li className="history-ex-more">+{w.exercises.length - 3} more</li>
                          )}
                        </ul>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {hasMore && (
              <>
                <div ref={sentinel} aria-hidden="true" />
                <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={showMore}>
                  Show earlier workouts ({workouts.length - shown.length} more)
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
