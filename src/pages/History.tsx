import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise, Workout } from '../db/types'
import { Header } from '../components/Header'
import { useFormatters } from '../lib/useSettings'
import { elapsedSeconds } from '../lib/workout'
import { formatDateLabel, formatDurationShort, formatTimeOfDay } from '../lib/time'
import { feelingFor } from '../components/FinishSheet'

export function HistoryPage() {
  const navigate = useNavigate()
  const fmt = useFormatters()

  const workouts = useLiveQuery(
    () => db.workouts.where('status').equals('done').reverse().sortBy('startedAt'),
    [],
    [] as Workout[],
  )
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  // Group by calendar month so long histories stay scannable.
  const months = useMemo(() => {
    const groups = new Map<string, Workout[]>()
    for (const w of workouts) {
      const d = new Date(w.startedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      groups.set(key, [...(groups.get(key) ?? []), w])
    }
    return [...groups.entries()].map(([key, list]) => ({
      key,
      label: new Date(list[0].startedAt).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
      list,
    }))
  }, [workouts])

  const totalVolume = workouts.reduce((sum, w) => sum + w.totalVolumeKg, 0)

  return (
    <>
      <Header title="History" />
      <div className="page">
        {workouts.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📈</div>
            <h3>No workouts yet</h3>
            <p className="muted">Finished sessions land here with every set you logged.</p>
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-value mono">{workouts.length}</div>
                <div className="stat-label">Workouts</div>
              </div>
              <div className="stat">
                <div className="stat-value mono">{fmt.volumeCompact(totalVolume)}</div>
                <div className="stat-label">Total {fmt.weightUnit}</div>
              </div>
              <div className="stat">
                <div className="stat-value mono">
                  {workouts.reduce((s, w) => s + w.totalSets, 0)}
                </div>
                <div className="stat-label">Sets</div>
              </div>
            </div>

            {months.map((month) => (
              <div key={month.key}>
                <div className="section-title">{month.label}</div>
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
                        <span className="row" style={{ gap: 6 }}>
                          {w.feeling !== undefined && (
                            <span title={`Felt ${feelingFor(w.feeling)?.label.toLowerCase()}`}>
                              {feelingFor(w.feeling)?.emoji}
                            </span>
                          )}
                          <span className="faint">{formatDateLabel(w.startedAt)}</span>
                        </span>
                      </div>
                      <div className="row" style={{ gap: 14, marginTop: 6 }}>
                        <span className="muted mono">{formatDurationShort(elapsedSeconds(w))}</span>
                        <span className="muted mono">
                          {fmt.volume(w.totalVolumeKg)} {fmt.weightUnit}
                        </span>
                        <span className="muted mono">{w.totalSets} sets</span>
                      </div>
                      <div className="faint" style={{ marginTop: 6, lineHeight: 1.4 }}>
                        {w.exercises.length === 0
                          ? 'No exercises logged'
                          : w.exercises
                              .map(
                                (le) =>
                                  `${le.sets.length} × ${byId.get(le.exerciseId)?.name ?? 'Unknown'}`,
                              )
                              .join(', ')}
                      </div>
                      <div className="faint" style={{ marginTop: 4 }}>
                        {formatTimeOfDay(w.startedAt)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}
