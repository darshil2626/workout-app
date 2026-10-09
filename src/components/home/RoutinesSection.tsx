import { useMemo, useState } from 'react'
import type { Exercise, Folder, Routine } from '../../db/types'
import { IconFolder, IconMinimise, IconPlay, IconTrash } from '../Icons'
import { formatRelative } from '../../lib/time'
import { useSwipeToDelete } from '../../lib/useSwipeToDelete'

const EXPANDED_FOLDERS_KEY = 'trana_expanded_folders'

/** Tracks which folders the user has explicitly opened, not which are
 *  collapsed — so a newly created folder (never in this set) starts
 *  collapsed by default without needing to be seeded into it up front. */
function readExpandedFolders(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_FOLDERS_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function writeExpandedFolders(ids: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...ids]))
  } catch {
    // Best-effort; a folder just falls back to collapsed-by-default next load.
  }
}

interface Props {
  routines: Routine[]
  folders: Folder[]
  exerciseById: Map<string, Exercise>
  onStart: (routine: Routine) => void
  onMenu: (routine: Routine) => void
  /** Swipe's faster path onto the same delete this menu's "Delete routine"
   *  option already reaches — no dedicated "..." trigger sits on this card
   *  (the whole info area already opens the menu on a single tap), so this
   *  list only picks up swipe-to-delete, not long-press. */
  onSwipeDelete: (routine: Routine) => void
  onNewRoutine: () => void
  onNewFolder: () => void
  /** Asks for confirmation upstream; the routines inside are kept. */
  onDeleteFolder: (folder: Folder) => void
}

/**
 * The old home screen, demoted to a section. Grouping, ordering, the card and
 * its context menu are unchanged — this is still the list people navigate by
 * once they have decided what to train.
 */
export function RoutinesSection({
  routines,
  folders,
  exerciseById,
  onStart,
  onMenu,
  onSwipeDelete,
  onNewRoutine,
  onNewFolder,
  onDeleteFolder,
}: Props) {
  const routineById = useMemo(() => new Map(routines.map((r) => [r.id, r])), [routines])
  const swipe = useSwipeToDelete((id) => {
    const r = routineById.get(id)
    if (r) onSwipeDelete(r)
  })
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(readExpandedFolders)
  function toggleFolder(id: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeExpandedFolders(next)
      return next
    })
  }
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => a.order - b.order), [folders])
  const byFolder = useMemo(() => {
    const map = new Map<string | null, Routine[]>()
    for (const r of [...routines].sort((a, b) => a.order - b.order || b.updatedAt - a.updatedAt)) {
      const key = r.folderId
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return map
  }, [routines])

  const loose = byFolder.get(null) ?? []

  return (
    <section>
      <div className="row-between home-section-row">
        <span className="section-title">Your routines</span>
        <span className="row home-section-actions">
          <button className="header-action home-section-muted" onClick={onNewFolder}>
            New folder
          </button>
          <button className="header-action" onClick={onNewRoutine}>
            New routine
          </button>
        </span>
      </div>

      {routines.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <h3>No routines yet</h3>
          <p className="muted">
            Build a routine once and every session starts pre-filled with your exercises and target sets.
          </p>
        </div>
      )}

      {sortedFolders.map((folder) => {
        const folderRoutines = byFolder.get(folder.id) ?? []
        const expanded = expandedFolders.has(folder.id)
        return (
          <div key={folder.id}>
            <div className="row folder-head">
              <button
                className="section-title row folder-toggle"
                style={{ gap: 8 }}
                onClick={() => toggleFolder(folder.id)}
                aria-expanded={expanded}
              >
                <IconFolder />
                <span className="grow truncate" style={{ textAlign: 'left' }}>
                  {folder.name}
                </span>
                <span className="faint">
                  {folderRoutines.length} {folderRoutines.length === 1 ? 'routine' : 'routines'}
                </span>
                <IconMinimise className={`folder-toggle-chevron${expanded ? ' open' : ''}`} />
              </button>
              <button
                className="icon-btn"
                onClick={() => onDeleteFolder(folder)}
                aria-label={`Delete folder ${folder.name}`}
              >
                <IconTrash />
              </button>
            </div>
            {expanded &&
              (folderRoutines.length === 0 ? (
                <p className="faint" style={{ paddingLeft: 4 }}>
                  Empty folder
                </p>
              ) : (
                <div className="list">
                  {folderRoutines.map((r) => (
                    <RoutineCard
                      key={r.id}
                      routine={r}
                      exerciseById={exerciseById}
                      onStart={() => onStart(r)}
                      onMenu={() => onMenu(r)}
                      swipe={swipe}
                    />
                  ))}
                </div>
              ))}
          </div>
        )
      })}

      {loose.length > 0 && (
        <>
          {sortedFolders.length > 0 && <div className="section-title">Other routines</div>}
          <div className="list" style={sortedFolders.length > 0 ? undefined : { marginTop: 2 }}>
            {loose.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                exerciseById={exerciseById}
                onStart={() => onStart(r)}
                onMenu={() => onMenu(r)}
                swipe={swipe}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function RoutineCard({
  routine,
  exerciseById,
  onStart,
  onMenu,
  swipe,
}: {
  routine: Routine
  exerciseById: Map<string, Exercise>
  onStart: () => void
  onMenu: () => void
  swipe: ReturnType<typeof useSwipeToDelete>
}) {
  const swipeRow = swipe.rowProps(routine.id)
  const totalSets = routine.exercises.reduce((n, re) => n + re.sets.length, 0)
  return (
    <div className="swipe-row">
      <div className="swipe-row-action">
        <IconTrash />
        Delete
      </div>
      <div className="card swipe-row-content" style={swipeRow.style} onPointerDown={swipeRow.onPointerDown}>
        <button className="stack" style={{ textAlign: 'left', width: '100%', gap: 0 }} onClick={onMenu}>
          <div className="row-between" style={{ width: '100%' }}>
            <span style={{ fontWeight: 650 }} className="truncate">
              {routine.name}
            </span>
            {routine.lastPerformedAt ? (
              <span className="faint" style={{ flexShrink: 0 }}>
                {formatRelative(routine.lastPerformedAt)}
              </span>
            ) : null}
          </div>
          <div className="row" style={{ gap: 14, marginTop: 6 }}>
            <span className="muted mono">
              {routine.exercises.length} {routine.exercises.length === 1 ? 'exercise' : 'exercises'}
            </span>
            <span className="muted mono">{totalSets} sets</span>
          </div>
          {routine.exercises.length === 0 ? (
            <div className="card-exercises" style={{ marginTop: 6 }}>
              No exercises yet
            </div>
          ) : (
            <ul className="history-ex-list" style={{ width: '100%' }}>
              {routine.exercises.slice(0, 3).map((re) => (
                <li key={re.id}>
                  <span className="truncate">{exerciseById.get(re.exerciseId)?.name ?? 'Unknown'}</span>
                  <span className="mono">
                    {re.sets.length} {re.sets.length === 1 ? 'set' : 'sets'}
                  </span>
                </li>
              ))}
              {routine.exercises.length > 3 && (
                <li className="history-ex-more">+{routine.exercises.length - 3} more</li>
              )}
            </ul>
          )}
        </button>
        <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 10 }} onClick={onStart}>
          <IconPlay />
          Start routine
        </button>
      </div>
    </div>
  )
}
