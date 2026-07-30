import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import type { Exercise, Folder, Routine } from '../db/types'
import { useActiveWorkout } from '../state/ActiveWorkoutContext'
import { Header } from '../components/Header'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { IconFolder, IconPlay, IconPlus, IconTrash } from '../components/Icons'
import { formatRelative } from '../lib/time'

export function HomePage() {
  const navigate = useNavigate()
  const { workout, startEmpty, startFromRoutine } = useActiveWorkout()

  const routines = useLiveQuery(() => db.routines.toArray(), [], [] as Routine[])
  const folders = useLiveQuery(() => db.folders.toArray(), [], [] as Folder[])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [] as Exercise[])
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  const [menuRoutine, setMenuRoutine] = useState<Routine | null>(null)
  const [deleting, setDeleting] = useState<Routine | null>(null)
  const [newFolder, setNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [startBlocked, setStartBlocked] = useState<null | { routine?: Routine }>(null)

  const sortedFolders = useMemo(() => [...folders].sort((a, b) => a.order - b.order), [folders])
  const byFolder = useMemo(() => {
    const map = new Map<string | null, Routine[]>()
    for (const r of [...routines].sort((a, b) => a.order - b.order || b.updatedAt - a.updatedAt)) {
      const key = r.folderId
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return map
  }, [routines])

  /**
   * Only one session can be active. Starting another would silently orphan the
   * first, so the user is asked to deal with it explicitly.
   */
  async function start(routine?: Routine) {
    if (workout) {
      setStartBlocked({ routine })
      return
    }
    if (routine) await startFromRoutine(routine)
    else await startEmpty()
    navigate('/workout')
  }

  async function createFolder() {
    const name = folderName.trim()
    if (name === '') return
    await db.folders.add({
      id: newId(),
      name,
      order: folders.length,
      createdAt: Date.now(),
    })
    setFolderName('')
    setNewFolder(false)
  }

  async function deleteRoutine(routine: Routine) {
    await db.routines.delete(routine.id)
    setDeleting(null)
  }

  function summary(routine: Routine): string {
    if (routine.exercises.length === 0) return 'No exercises yet'
    return routine.exercises
      .map((re) => {
        const name = exerciseById.get(re.exerciseId)?.name ?? 'Unknown'
        return `${re.sets.length} × ${name}`
      })
      .join(', ')
  }

  return (
    <>
      <Header
        title="Workout"
        right={
          <button className="header-action" onClick={() => setNewFolder(true)}>
            New folder
          </button>
        }
      />

      <div className="page">
        {workout ? (
          <button className="btn btn-primary btn-lg btn-block" onClick={() => navigate('/workout')}>
            <IconPlay />
            Resume “{workout.name}”
          </button>
        ) : (
          <button className="btn btn-primary btn-lg btn-block" onClick={() => void start()}>
            <IconPlus />
            Start empty workout
          </button>
        )}

        <div className="row" style={{ marginTop: 10, gap: 10 }}>
          <button
            className="btn btn-ghost grow"
            onClick={() => navigate('/routines/new')}
          >
            <IconPlus />
            New routine
          </button>
        </div>

        {routines.length === 0 && (
          <div className="empty">
            <div className="empty-icon">📋</div>
            <h3>No routines yet</h3>
            <p className="muted">
              Build a routine once and every session starts pre-filled with your exercises and
              target sets.
            </p>
          </div>
        )}

        {sortedFolders.map((folder) => (
          <div key={folder.id}>
            <div className="section-title row" style={{ gap: 8 }}>
              <IconFolder />
              {folder.name}
            </div>
            {(byFolder.get(folder.id) ?? []).length === 0 ? (
              <p className="faint" style={{ paddingLeft: 4 }}>
                Empty folder
              </p>
            ) : (
              <div className="list">
                {(byFolder.get(folder.id) ?? []).map((r) => (
                  <RoutineCard
                    key={r.id}
                    routine={r}
                    summary={summary(r)}
                    onStart={() => void start(r)}
                    onMenu={() => setMenuRoutine(r)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {(byFolder.get(null) ?? []).length > 0 && (
          <>
            <div className="section-title">{sortedFolders.length > 0 ? 'Other routines' : 'My routines'}</div>
            <div className="list">
              {(byFolder.get(null) ?? []).map((r) => (
                <RoutineCard
                  key={r.id}
                  routine={r}
                  summary={summary(r)}
                  onStart={() => void start(r)}
                  onMenu={() => setMenuRoutine(r)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Sheet open={menuRoutine !== null} title={menuRoutine?.name} onClose={() => setMenuRoutine(null)}>
        <button
          className="sheet-list-item"
          onClick={() => {
            const r = menuRoutine
            setMenuRoutine(null)
            if (r) void start(r)
          }}
        >
          <IconPlay />
          <span className="grow">Start routine</span>
        </button>
        <button
          className="sheet-list-item"
          onClick={() => {
            const r = menuRoutine
            setMenuRoutine(null)
            if (r) navigate(`/routines/${r.id}`)
          }}
        >
          <IconPlus />
          <span className="grow">Edit routine</span>
        </button>
        <button
          className="sheet-list-item danger"
          onClick={() => {
            setDeleting(menuRoutine)
            setMenuRoutine(null)
          }}
        >
          <IconTrash />
          <span className="grow">Delete routine</span>
        </button>
      </Sheet>

      <Sheet
        open={newFolder}
        title="New folder"
        onClose={() => setNewFolder(false)}
        footer={
          <>
            <button className="btn btn-ghost grow" onClick={() => setNewFolder(false)}>
              Cancel
            </button>
            <button className="btn btn-primary grow" onClick={() => void createFolder()}>
              Create
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="folder-name">
            Folder name
          </label>
          <input
            id="folder-name"
            className="input"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="e.g. Push Pull Legs"
          />
        </div>
      </Sheet>

      <ConfirmSheet
        open={deleting !== null}
        title={`Delete “${deleting?.name}”?`}
        message="Past workouts started from this routine are kept."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleting && void deleteRoutine(deleting)}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmSheet
        open={startBlocked !== null}
        title="A workout is already running"
        message={`Finish or discard “${workout?.name}” before starting another.`}
        confirmLabel="Go to workout"
        onConfirm={() => {
          setStartBlocked(null)
          navigate('/workout')
        }}
        onCancel={() => setStartBlocked(null)}
      />
    </>
  )
}

function RoutineCard({
  routine,
  summary,
  onStart,
  onMenu,
}: {
  routine: Routine
  summary: string
  onStart: () => void
  onMenu: () => void
}) {
  return (
    <div className="card">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <button className="stack grow" style={{ textAlign: 'left' }} onClick={onMenu}>
          <span style={{ fontWeight: 650 }}>{routine.name}</span>
          <span className="faint" style={{ lineHeight: 1.4 }}>
            {summary}
          </span>
          {routine.lastPerformedAt ? (
            <span className="faint">Last done {formatRelative(routine.lastPerformedAt)}</span>
          ) : null}
        </button>
      </div>
      <button className="btn btn-accent-soft btn-sm btn-block" style={{ marginTop: 10 }} onClick={onStart}>
        <IconPlay />
        Start routine
      </button>
    </div>
  )
}
